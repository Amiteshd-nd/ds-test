// The fixed workflow. PRD §9.1 Mode A:
//
//   ingest → resolve_entities → retrieve → [skill calls] → compose → gate? → emit
//
// Ships first, stays the default, and handles the cases that actually occur. Mode B
// (supervisor / sub-agent) is gated behind `features.orchestration.dynamic` and is not
// implemented in this slice — the flag exists so nothing quietly turns it on.

import type { AgentManifest } from '../agents/registry.ts';
import type { Chunk, MemoryBundle, Principal, RunEvent, SkillManifest, Surface } from '../adapters/types.ts';
import type { CortexConfig } from '../config/config.ts';
import type { GroundingPipeline } from '../grounding/pipeline.ts';
import type { PolicyAdapter } from '../adapters/policy.ts';
import type { MemoryService } from '../memory/service.ts';
import type { Router } from '../router/router.ts';
import type { SkillInvoker } from '../skills/invoker.ts';
import { newStepId } from '../skills/invoker.ts';
import type { SkillSelector } from '../skills/selector.ts';
import type { PromptStore } from '../prompts/store.ts';
import type { RunStore } from '../runtime/store.ts';
import { StateGraph } from './graph.ts';
import type { GraphContext } from './graph.ts';
import { BlockStreamParser } from './blocks.ts';
import { scanForInjection } from '../guardrails/injection.ts';
import type { InjectionFinding } from '../guardrails/injection.ts';
import { applyPiiPolicy } from '../guardrails/pii.ts';
import { EgressGuard } from '../guardrails/egress.ts';
import type { GuardOutput } from '../guardrails/egress.ts';
import { CortexError } from '../errors.ts';
import { MAX_FAN_OUT } from '../agents/registry.ts';
import { cosine, embedText } from '../router/providers/local.ts';
import { newSpanId, record as recordSpan } from '../telemetry/trace.ts';
import type { SpanKind } from '../telemetry/trace.ts';

export interface ChatState {
  question: string;
  history: string[];
  memory: MemoryBundle | null;
  chunks: Chunk[];
  filteredCount: number;
  skillSummaries: string[];
  answer: string;
  groundedRatio: number | null;
  hallucinatedCitations: string[];
  fallbackUsed: boolean;
  injectionFindings: InjectionFinding[];
  /** Set from the trigger context when a host surface proposes an action. */
  proposedSkill: { skillId: string; args: Record<string, unknown> } | null;
}

export interface Delegator {
  /** Runs one sub-agent to completion. Supplied by the engine; §9.1 Mode B. */
  runSubAgent(parentRunId: string, agentId: string, principal: Principal, question: string): Promise<{ runId: string; answer: string; costUsd: number; status: string }>;
}

export interface WorkflowDeps {
  /** Present only when dynamic orchestration is enabled and the agent has sub-agents. */
  delegator?: Delegator;
  /** Sub-agent manifests this supervisor may delegate to, already entitlement-checked. */
  subAgents?: { id: string; name: string; description: string }[];
  config: CortexConfig;
  agent: AgentManifest;
  principal: Principal;
  entitlements: Set<string>;
  surface: Surface;
  hostName: string;
  grounding: GroundingPipeline;
  policy: PolicyAdapter;
  memory: MemoryService;
  router: Router;
  prompts: PromptStore;
  invoker: SkillInvoker;
  selector: SkillSelector;
  skills: SkillManifest[];
  store: RunStore;
  emit: (event: RunEvent) => Promise<void>;
  budgetRemainingUsd: () => number;
}

export function buildChatWorkflow(deps: WorkflowDeps): StateGraph<ChatState> {
  const g = new StateGraph<ChatState>(deps.config.budgets.max_steps_per_run);
  let seq = 0;

  const step = async (kind: 'model' | 'skill' | 'retrieval' | 'gate' | 'subagent', name: string, label: string, runId: string) => {
    const id = newStepId();
    deps.store.addStep({ id, runId, seq: seq++, kind, name, inputDigest: '', status: 'ok', latencyMs: 0, costUsd: 0, modelId: null });
    // The human name, not the skill id: "Searching project documents…", never
    // "invoking docs.search". §13.4's tool-running state is only useful if it reads.
    await deps.emit({ type: 'step_started', runId, stepId: id, kind, name, label });
    const started = Date.now();
    return {
      id,
      done: async (status: 'ok' | 'error' | 'denied' | 'timeout' | 'awaiting', costUsd = 0, modelId: string | null = null, payload?: unknown) => {
        const latency = Date.now() - started;
        deps.store.finishStep(id, status, latency, costUsd, modelId);
        // A step is a span. Its start and end are not one lexical scope, so it is
        // recorded rather than wrapped — same row in the trace store either way.
        recordSpan({
          name, runId, kind: kind as SpanKind, spanId: newSpanId(),
          startedAt: started, endedAt: Date.now(), status,
          attrs: { step_id: id, label, cost_usd: costUsd, model_id: modelId ?? undefined, latency_ms: latency },
          payload,
        });
        await deps.emit({ type: 'step_completed', runId, stepId: id, status, latencyMs: latency });
      },
    };
  };

  // -- ingest ---------------------------------------------------------------
  g.node('ingest', async (state, ctx: GraphContext) => {
    const s = await step('retrieval', 'ingest', 'Reading your question', ctx.runId);

    // §14.3 — PII detection on ingress as well as egress. A secret pasted into a chat
    // box must not reach a provider, whatever the provider promises about retention.
    const ingress = applyPiiPolicy(state.question);
    if (ingress.blocked.length) {
      await s.done('denied');
      throw new CortexError('invalid_arguments', `That message looks like it contains ${ingress.blocked.join(' and ')}. Remove it and ask again — it should not be sent to a model.`);
    }

    const bundle = await deps.memory.assemble({
      principal: deps.principal,
      threadId: null,
      question: state.question,
      turns: deps.agent.memory.session.turns,
      semanticRecall: deps.agent.memory.session.semanticRecall,
      readKeys: deps.agent.memory.profile.read,
      budgetTokens: Math.floor(deps.agent.grounding.maxContextTokens * 0.15),
    });
    const redacted = await deps.memory.redactBundle(deps.principal, bundle);
    await s.done('ok');
    return { memory: redacted, question: ingress.text };
  });

  // -- retrieve (with the graph leg folded in — §11.1 runs them in parallel) ---
  g.node('retrieve', async (state, ctx) => {
    const s = await step('retrieval', 'retrieve', `Searching ${deps.hostName}`, ctx.runId);
    const result = await deps.grounding.run({
      question: state.question,
      principal: deps.principal,
      runId: ctx.runId,
      sources: deps.agent.grounding.sources,
      graph: deps.agent.grounding.graph,
      maxContextTokens: deps.agent.grounding.maxContextTokens,
      history: state.history,
    });

    const findings = scanForInjection(result.chunks);
    if (findings.length) {
      // Kept, wrapped, and logged — not dropped. Dropping would let anyone delete a
      // document from an answer by pasting a magic phrase into it.
      deps.store.trace(ctx.runId, s.id, 'injection_findings', findings);
    }

    for (const c of result.chunks) {
      await deps.emit({ type: 'citation', runId: ctx.runId, sourceId: c.sourceId, ref: c.ref, title: c.title });
    }
    if (result.filteredCount > 0) {
      await deps.emit({
        type: 'notice',
        runId: ctx.runId,
        kind: 'permission_filtered',
        message: `${result.filteredCount} result${result.filteredCount === 1 ? '' : 's'} you do not have access to were removed before the answer was written.`,
      });
    }
    await s.done('ok');
    return { chunks: result.chunks, filteredCount: result.filteredCount, injectionFindings: findings };
  });

  // -- skills ---------------------------------------------------------------
  g.node('skills', async (state, ctx) => {
    if (deps.skills.length === 0) return {};
    const summaries: string[] = [...state.skillSummaries];

    // -- resuming after a human answered a gate ------------------------------
    //
    // A run that halted at an approval re-enters this node, and the one thing it must
    // not do is ask again. The decision is durable; the selection that produced the
    // request already happened, possibly days ago. So an answered approval is executed
    // directly and the node returns — it does not re-select, and it does not re-gate.
    const decided = deps.store.decidedApprovals(ctx.runId);
    if (decided.length > 0) {
      for (const approval of decided) {
        const skill = deps.skills.find((sk) => sk.id === approval.payload.action);
        // Marked executed before the call, not after: a crash mid-call must not leave
        // an approval that a later resume would run again. The idempotency key in the
        // skill manifest is what makes the retry of a genuinely-lost call safe.
        deps.store.markApprovalExecuted(approval.stepId);
        if (!skill) continue;

        const args = approval.editedArgs ?? approval.payload.args;
        const s = await step('skill', skill.id, skill.name, ctx.runId);
        try {
          const outcome = await deps.invoker.invoke({
            skill,
            gates: deps.agent.hitl.gates,
            args,
            principal: deps.principal,
            entitlements: deps.entitlements,
            runId: ctx.runId,
            stepId: s.id,
            argsFromUntrustedContent: false,
            approved: true,
          });
          if (outcome.kind !== 'ok') {
            // Approved, then refused by the host anyway — an entitlement lost while the
            // approval sat in someone's inbox. The user is told; nothing is executed.
            await s.done('denied');
            await deps.emit({ type: 'notice', runId: ctx.runId, kind: 'partial_success', message: outcome.reason });
            continue;
          }
          await deps.emit({ type: 'block', runId: ctx.runId, block: { type: 'skill_call', skill: skill.id, args, state: 'ok' } });
          summaries.push(`${skill.name}: ${JSON.stringify(outcome.result.data).slice(0, 600)}`);
          await s.done('ok');
        } catch (err) {
          await s.done('error');
          await deps.emit({
            type: 'notice', runId: ctx.runId, kind: 'partial_success',
            message: err instanceof CortexError ? err.message : 'The approved action failed.',
          });
        }
      }
      return { skillSummaries: summaries };
    }

    // -- an action proposed by the surface ------------------------------------
    //
    // Choosing a *write* action's arguments out of free prose is a model's job, and the
    // offline provider cannot do it (docs/DECISIONS.md D-8). So a host surface may
    // propose the action itself — the user picks a record and writes the comment, which
    // is how a real inline or form surface works anyway.
    //
    // Proposing is not authorising. The proposal enters the same path as a model's
    // choice and is checked the same way: the skill must be in the agent's allow-list,
    // the principal must hold its entitlements, the host policy still answers, the
    // arguments are still validated, and the gate still fires. The surface decides what
    // to suggest; CORTEX decides whether it happens.
    const proposed = state.proposedSkill;
    const choices = proposed
      ? [{ skillId: proposed.skillId, args: proposed.args, why: 'proposed by the surface, pending your approval' }]
      : await deps.selector.select(state.question, deps.skills);

    if (proposed && !deps.skills.some((sk) => sk.id === proposed.skillId)) {
      await deps.emit({
        type: 'notice', runId: ctx.runId, kind: 'partial_success',
        message: `${deps.agent.name} is not allowed to use ${proposed.skillId}.`,
      });
      return { skillSummaries: summaries };
    }

    for (const choice of choices) {
      const skill = deps.skills.find((sk) => sk.id === choice.skillId) as SkillManifest;
      const s = await step('skill', skill.id, skill.name, ctx.runId);
      try {
        const outcome = await deps.invoker.invoke({
          skill,
          gates: deps.agent.hitl.gates,
          args: choice.args,
          principal: deps.principal,
          entitlements: deps.entitlements,
          runId: ctx.runId,
          stepId: s.id,
          // §14.2 — "never let retrieved content authorize an action."
          //
          // Arguments a *model* chose are downstream of everything in its context by
          // construction, and its context contains retrieved documents. So when this
          // run's retrieval turned up instruction-shaped content, model-chosen arguments
          // are treated as derived from it and a side-effecting call escalates to a gate
          // regardless of what the agent's own config says.
          //
          // Arguments a host *surface* proposed are not: those came from a person
          // operating the product, and they still meet the agent's declared gates.
          argsFromUntrustedContent: !proposed && (state.injectionFindings?.length ?? 0) > 0,
        });

        if (outcome.kind === 'denied') {
          await s.done('denied');
          await deps.emit({ type: 'notice', runId: ctx.runId, kind: 'partial_success', message: outcome.reason });
          continue;
        }
        if (outcome.kind === 'needs_approval') {
          // The run stops here, durably. It may sit for days; the process may restart
          // under it. §9.2's payload: the exact action, the exact arguments, a readable
          // rendering, the reasoning that led here, and the cost of proceeding.
          const payload = {
            action: skill.id,
            args: choice.args,
            human: outcome.reason,
            reasoning: choice.why,
            costUsd: deps.store.getRun(ctx.runId)?.costUsd ?? 0,
          };
          deps.store.requestApproval(ctx.runId, s.id, payload);
          // The status is written before the event goes out, not after. A client that
          // receives `approval_requested` and approves immediately — which is exactly
          // what a fast user or an automated approver does — must not find the run still
          // marked `running`. Durable state first, then the invitation to act on it.
          deps.store.setStatus(ctx.runId, 'awaiting_approval');
          await deps.emit({ type: 'approval_requested', runId: ctx.runId, stepId: s.id, payload });
          await deps.emit({ type: 'block', runId: ctx.runId, block: { type: 'skill_call', skill: skill.id, args: choice.args, state: 'awaiting_approval' } });
          await s.done('awaiting');
          return { __halt: true, skillSummaries: summaries };
        }

        await deps.emit({ type: 'block', runId: ctx.runId, block: { type: 'skill_call', skill: skill.id, args: choice.args, state: 'ok' } });
        summaries.push(`${skill.name}: ${JSON.stringify(outcome.result.data).slice(0, 600)}`);
        await s.done('ok');
      } catch (err) {
        // §9.3 — partial results are always emitted. "I found 8 of 10" beats an error.
        await s.done('error');
        const message = err instanceof CortexError ? err.message : 'A tool failed.';
        await deps.emit({ type: 'notice', runId: ctx.runId, kind: 'partial_success', message });
      }
    }
    return { skillSummaries: summaries };
  });

  // -- delegate (§9.1 Mode B) -------------------------------------------------
  //
  // Off unless `features.orchestration.dynamic` is on AND the agent declares sub-agents.
  // Non-negotiable 5: fixed workflows first, and dynamic planning stays behind a flag.
  //
  // What this is not: a planner. The supervisor does not invent a decomposition; it picks
  // from a declared, validated set of specialists, each of which is an ordinary agent
  // manifest with its own allow-list, its own budget, and its own trace. That is the
  // version of Mode B worth having — "parallel team development and modular quality
  // evaluation", which is the reason the PRD gives for wanting it.
  g.node('delegate', async (state, ctx) => {
    const available = deps.subAgents ?? [];
    if (!deps.delegator || available.length === 0) return {};

    const chosen = await pickSubAgents(state.question, available);
    if (chosen.length === 0) return {};

    const s = await step('subagent', 'delegate', `Asking ${chosen.length} specialist${chosen.length === 1 ? '' : 's'}`, ctx.runId);
    const summaries = [...state.skillSummaries];

    // Parallel, capped at the fan-out the manifest validator already enforced. One slow
    // specialist should not serialise the others.
    const results = await Promise.all(
      chosen.map(async (sub) => {
        try {
          return { sub, ...(await (deps.delegator as Delegator).runSubAgent(ctx.runId, sub.id, deps.principal, state.question)) };
        } catch (err) {
          return { sub, runId: '', answer: '', costUsd: 0, status: 'failed', error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'succeeded' && r.answer) {
        summaries.push(`${r.sub.name}: ${r.answer.slice(0, 700)}`);
        await deps.emit({ type: 'progress', runId: ctx.runId, message: `${r.sub.name} answered.` });
      } else {
        // §9.3 — partial results are always emitted. One specialist failing is not the
        // supervisor failing, and saying which one failed beats a generic error.
        await deps.emit({
          type: 'notice', runId: ctx.runId, kind: 'partial_success',
          message: `${r.sub.name} could not answer, so this is based on the rest.`,
        });
      }
      deps.store.trace(ctx.runId, s.id, 'subagent', { agentId: r.sub.id, runId: r.runId, status: r.status, costUsd: r.costUsd });
    }

    await s.done('ok', results.reduce((a, r) => a + r.costUsd, 0));
    return { skillSummaries: summaries };
  });

  // -- compose --------------------------------------------------------------
  g.node('compose', async (state, ctx) => {
    const s = await step('model', 'compose', 'Writing the answer', ctx.runId);

    // Addendum C5 — permission revoked mid-run.
    //
    // Retrieval filtered on permission a few milliseconds ago. Between then and now, an
    // entitlement can be revoked: someone leaves a team, a document is reclassified, an
    // access grant expires. Re-checking here closes that window up to the moment the
    // model starts writing, and failing is the right response — this is not a case for
    // quietly answering with less.
    //
    // What this does NOT do, and the limit is worth stating: once tokens are streaming,
    // the run finishes with the context it had. A revocation landing at that instant is
    // caught by the next turn, where memory reads pass through PolicyAdapter.redact
    // (§10.4). Narrowing the window further would mean re-checking per sentence, which
    // buys milliseconds and costs a permission call per sentence.
    if (state.chunks.length > 0) {
      const refs = [...new Set(state.chunks.map((c) => c.ref))];
      const still = await deps.policy.canRead(deps.principal, refs);
      const lost = refs.filter((_, i) => !still[i]);
      if (lost.length) {
        deps.store.trace(ctx.runId, s.id, 'permission_revoked_mid_run', lost);
        await s.done('denied');
        throw new CortexError(
          'permission_denied',
          'Your access to some of the records behind this answer changed while it was being prepared, so it was not sent. Ask again and you will get an answer based on what you can see now.',
          { refs: lost },
        );
      }
    }

    const version = deps.prompts.resolveVersion(deps.agent.prompt.id, deps.agent.prompt.version, deps.principal.id);
    const rendered = deps.prompts.render(deps.agent.prompt.id, version, {
      host_name: deps.hostName,
      locale: deps.principal.locale,
      principal_name: deps.principal.id,
      principal_type: deps.principal.type,
      principal_tz: deps.principal.tz,
      memory: state.memory?.items ?? [],
      sources: state.chunks,
      question: state.question,
    });
    // §7.5 — the rendered prompt is attached to the trace. Hashed where it carries
    // member data, which here it does.
    deps.store.trace(ctx.runId, s.id, 'prompt', { id: rendered.id, version: rendered.version, hash: rendered.hash, chars: rendered.text.length });

    if (state.chunks.length === 0) {
      await deps.emit({ type: 'notice', runId: ctx.runId, kind: 'no_answer', message: `Nothing in ${deps.hostName} that you can see matches that.` });
    }

    const modelClass = deps.agent.modelPolicy.steps?.compose ?? deps.agent.modelPolicy.default;
    const route = await deps.router.complete(
      modelClass,
      {
        messages: [
          { role: 'system', content: rendered.text },
          { role: 'user', content: state.question + (state.skillSummaries.length ? `\n\nTOOL RESULTS\n${state.skillSummaries.join('\n')}` : '') },
        ],
        maxTokens: 700,
      },
      { principal: deps.principal, runId: ctx.runId, surface: deps.surface, retryCount: 0, budgetRemainingUsd: deps.budgetRemainingUsd() },
    );

    if (route.fallbackUsed) {
      await deps.emit({
        type: 'notice',
        runId: ctx.runId,
        kind: 'fallback_model_used',
        message: `The usual model was unavailable; this answer came from ${route.modelRef.provider}/${route.modelRef.model}.`,
      });
    }

    // Everything the model produces goes through the guard before it reaches a socket.
    const guard = new EgressGuard(
      state.chunks,
      state.injectionFindings ?? [],
      [state.question, ...state.chunks.map((c) => c.title)].join(' ').split(/\s+/),
    );
    const seenNotices = new Set<string>();
    const release = async (out: GuardOutput): Promise<void> => {
      if (out.text) await deps.emit({ type: 'token', runId: ctx.runId, text: out.text });
      for (const notice of out.notices) {
        // One notice per kind per answer: the guard fires per sentence, and the user
        // does not need to be told four times that something was removed.
        if (seenNotices.has(notice.kind)) continue;
        seenNotices.add(notice.kind);
        await deps.emit({ type: 'notice', runId: ctx.runId, kind: notice.kind, message: notice.message });
      }
    };

    const parser = new BlockStreamParser();
    // Kept for the trace: what the model produced before the egress guard touched it.
    // A trace that only shows the cleaned answer cannot tell you why a sentence vanished.
    let modelOutput = '';
    for await (const chunk of route.stream) {
      modelOutput += chunk;
      for (const piece of parser.push(chunk)) {
        if (piece.kind === 'text') await release(guard.push(piece.text));
        else await deps.emit({ type: 'block', runId: ctx.runId, block: piece.block });
      }
    }
    for (const piece of parser.flush()) {
      if (piece.kind === 'text') await release(guard.push(piece.text));
      else await deps.emit({ type: 'block', runId: ctx.runId, block: piece.block });
    }
    await release(guard.flush());

    const usage = await route.done;
    deps.store.addCost(ctx.runId, deps.principal.id, usage.costUsd, usage.tokensIn, usage.tokensOut);
    deps.store.trace(ctx.runId, s.id, 'model_usage', { ...usage, text: undefined });

    const stats = guard.stats();
    // The payload the trace viewer exists for: what the model was actually given, and
    // what it gave back — both before and after the egress guard, since the difference
    // between those two is the only way to see why a sentence disappeared. Written to
    // the blob store, redacted in production, expired on a schedule; never inline in a
    // span row.
    await s.done('ok', usage.costUsd, usage.modelId, {
      prompt: rendered.text,
      prompt_id: `${rendered.id}@${rendered.version}`,
      prompt_hash: rendered.hash,
      chunks: state.chunks.map((c) => ({ ref: c.ref, title: c.title, text: c.text, sourceId: c.sourceId, via: c.via })),
      output_raw: modelOutput,
      output_released: stats.released,
      model: usage.modelId,
      provider: usage.provider,
    });
    if (stats.hallucinatedCitations.length) deps.store.trace(ctx.runId, s.id, 'hallucinated_citations', stats.hallucinatedCitations);
    if (stats.strippedUrls.length) deps.store.trace(ctx.runId, s.id, 'stripped_urls', stats.strippedUrls);
    if (stats.redactedSentences.length) deps.store.trace(ctx.runId, s.id, 'redacted_injected_text', stats.redactedSentences);
    deps.store.trace(ctx.runId, s.id, 'quality', {
      grounded_ratio: stats.groundedRatio,
      hallucinated: stats.hallucinatedCitations.length,
      redacted: stats.redactedSentences.length,
    });

    // The answer written to memory is exactly the text the user saw — not a cleaner
    // copy of it. A transcript that disagrees with the screen is its own bug.
    return {
      answer: stats.released,
      groundedRatio: stats.groundedRatio,
      hallucinatedCitations: stats.hallucinatedCitations,
      fallbackUsed: route.fallbackUsed,
    };
  });

  return g;
}

export const initialChatState = (
  question: string,
  history: string[],
  proposedSkill: ChatState['proposedSkill'] = null,
): ChatState => ({
  question,
  history,
  memory: null,
  chunks: [],
  filteredCount: 0,
  skillSummaries: [],
  answer: '',
  groundedRatio: 1,
  hallucinatedCitations: [],
  fallbackUsed: false,
  injectionFindings: [],
  proposedSkill,
});

/**
 * Which specialists to ask. Description similarity, the same mechanism the skill selector
 * uses, for the same reason: it is deterministic, it works with no model configured, and
 * it declines rather than guessing. A real supervisor with a real model would reason about
 * the decomposition; this picks from a declared set, which is the conservative half of
 * that and the half the PRD asks to ship first.
 */
async function pickSubAgents(
  question: string,
  available: { id: string; name: string; description: string }[],
): Promise<{ id: string; name: string; description: string }[]> {
  const q = embedText(question);
  return available
    .map((sub) => ({ sub, score: cosine(q, embedText(`${sub.name}. ${sub.description}`)) }))
    .filter((x) => x.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FAN_OUT)
    .map((x) => x.sub);
}
