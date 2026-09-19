// The inline surface. PRD §12 and §13.3.
//
// The person selected a passage and asked for a change to it. The agent proposes; it does
// not write. Accepting the proposal is the *host* applying an edit to its own document,
// in its own UI, on its own authority — which is Appendix A's Post Studio rule ("user
// publishes; agent never posts") and the reason this surface needs no write skill and no
// approval gate. The diff preview *is* the gate.
//
// Latency target is tighter than chat — §12 wants a first token under 500ms — so this
// workflow does no retrieval and no skill selection. The document is the context, and it
// arrived with the request.

import type { AgentManifest } from '../agents/registry.ts';
import type { Block } from '../adapters/types.ts';
import { StateGraph } from './graph.ts';
import type { GraphContext } from './graph.ts';
import { EgressGuard } from '../guardrails/egress.ts';
import { scanForInjection } from '../guardrails/injection.ts';
import { applyPiiPolicy } from '../guardrails/pii.ts';
import { CortexError } from '../errors.ts';
import { newSpanId, record as recordSpan } from '../telemetry/trace.ts';
import type { WorkflowDeps } from './workflow.ts';

export interface InlineState {
  /** What the person selected, verbatim. */
  selection: string;
  instruction: string;
  docRef: string;
  docTitle: string;
  docBody: string;
  proposal: string;
  fallbackUsed: boolean;
}

export const initialInlineState = (instruction: string, context: Record<string, unknown>): InlineState => ({
  selection: String(context.selection ?? ''),
  instruction,
  docRef: String(context.ref ?? ''),
  docTitle: String(context.title ?? ''),
  docBody: String(context.body ?? ''),
  proposal: '',
  fallbackUsed: false,
});

export function buildInlineWorkflow(deps: WorkflowDeps): StateGraph<InlineState> {
  const g = new StateGraph<InlineState>(deps.config.budgets.max_steps_per_run);

  g.node('propose_edit', async (state, ctx: GraphContext) => {
    const started = Date.now();
    const stepId = `step_inline_${ctx.runId}`;
    deps.store.addStep({ id: stepId, runId: ctx.runId, seq: 0, kind: 'model', name: 'propose_edit', inputDigest: '', status: 'ok', latencyMs: 0, costUsd: 0, modelId: null });
    await deps.emit({ type: 'step_started', runId: ctx.runId, stepId, kind: 'model', name: 'propose_edit', label: 'Drafting an edit' });

    if (!state.selection.trim()) {
      throw new CortexError('invalid_arguments', 'Select the passage you want changed, then ask again.');
    }

    // §14.3 — the selection is user input and goes through the same ingress check as a
    // chat message. A secret pasted into a document must not reach a provider because it
    // happened to arrive by a different door.
    const ingress = applyPiiPolicy(state.selection);
    if (ingress.blocked.length) {
      throw new CortexError('invalid_arguments', `That passage looks like it contains ${ingress.blocked.join(' and ')}. It was not sent to a model.`);
    }

    // The document body is host content, so it is untrusted like any retrieved chunk.
    const findings = scanForInjection([
      { sourceId: 'doc', ref: state.docRef, title: state.docTitle, text: state.docBody, score: 1 },
    ]);
    if (findings.length) deps.store.trace(ctx.runId, stepId, 'injection_findings', findings);

    const surfacePrompt = deps.agent.surfacePrompts.inline ?? deps.agent.prompt;
    const version = deps.prompts.resolveVersion(surfacePrompt.id, surfacePrompt.version, deps.principal.id);
    const rendered = deps.prompts.render(surfacePrompt.id, version, {
      host_name: deps.hostName,
      locale: deps.principal.locale,
      principal_name: deps.principal.id,
      principal_type: deps.principal.type,
      principal_tz: deps.principal.tz,
      doc_title: state.docTitle,
      doc_ref: state.docRef,
      doc_body: state.docBody,
      selection: state.selection,
      instruction: state.instruction,
    });
    deps.store.trace(ctx.runId, stepId, 'prompt', { id: rendered.id, version: rendered.version, hash: rendered.hash, chars: rendered.text.length });

    const route = await deps.router.complete(
      deps.agent.modelPolicy.steps?.compose ?? deps.agent.modelPolicy.default,
      {
        messages: [
          { role: 'system', content: rendered.text },
          { role: 'user', content: state.instruction },
        ],
        maxTokens: 600,
      },
      { principal: deps.principal, runId: ctx.runId, surface: 'inline', retryCount: 0, budgetRemainingUsd: deps.budgetRemainingUsd() },
    );

    if (route.fallbackUsed) {
      await deps.emit({
        type: 'notice', runId: ctx.runId, kind: 'fallback_model_used',
        message: `The usual model was unavailable; this edit came from ${route.modelRef.provider}/${route.modelRef.model}.`,
      });
    }

    // The guard runs here too. There are no citations to verify in an edit, but an
    // injected instruction repeated into someone's document is worse than one repeated
    // into an answer: it persists, and the next agent to read that document inherits it.
    const guard = new EgressGuard([], findings, [state.instruction, state.docTitle]);
    let raw = '';
    for await (const chunk of route.stream) {
      raw += chunk;
      const out = guard.push(chunk);
      // Tokens stream so the editor can show the edit forming, per §12's latency target.
      if (out.text) await deps.emit({ type: 'token', runId: ctx.runId, text: out.text });
      for (const notice of out.notices) await deps.emit({ type: 'notice', runId: ctx.runId, kind: notice.kind, message: notice.message });
    }
    const tail = guard.flush();
    if (tail.text) await deps.emit({ type: 'token', runId: ctx.runId, text: tail.text });

    const usage = await route.done;
    deps.store.addCost(ctx.runId, deps.principal.id, usage.costUsd, usage.tokensIn, usage.tokensOut);

    const after = guard.stats().released.trim() || state.selection;
    const block: Block = { type: 'diff_proposal', target: state.docRef, before: state.selection, after };
    await deps.emit({ type: 'block', runId: ctx.runId, block });

    const latency = Date.now() - started;
    deps.store.finishStep(stepId, 'ok', latency, usage.costUsd, usage.modelId);
    recordSpan({
      name: 'propose_edit', runId: ctx.runId, kind: 'model', spanId: newSpanId(),
      startedAt: started, endedAt: Date.now(), status: 'ok',
      attrs: { step_id: stepId, cost_usd: usage.costUsd, model_id: usage.modelId, latency_ms: latency, unchanged: after === state.selection },
      payload: { prompt: rendered.text, chunks: [], output_raw: raw, output_released: after, model: usage.modelId, provider: usage.provider },
    });
    await deps.emit({ type: 'step_completed', runId: ctx.runId, stepId, status: 'ok', latencyMs: latency });

    return { proposal: after, fallbackUsed: route.fallbackUsed };
  });

  return g;
}
