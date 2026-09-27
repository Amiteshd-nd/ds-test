/**
 * The loop, with the task bookkeeping taken out.
 *
 * Phase 0 had one loop and it lived in `loop.ts`. Phase 1 adds a second agent -
 * the web builder - that needs the same machinery with a different system
 * prompt, a different tool set and, crucially, its own message list (PRD section
 * 6.1, adopt 7: sub-agents get isolated context and return a compressed result).
 *
 * Copying two hundred lines to get that would mean fixing every future bug
 * twice, so the loop lives here and both agents are a spec passed to it. The
 * orchestrator adds task rows on top; the sub-agent adds nothing and hands its
 * summary back to its caller.
 *
 * The invariants from Phase 0 are unchanged and still the thing to protect:
 * append-only messages, a step row written before the work and closed after,
 * tool failures appended rather than thrown, budgets checked before each call.
 */

import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  TraceSink,
} from '../providers/interfaces.ts';
import type { Store } from '../db/store.ts';
import { addUsage, emptyUsage, type TaskStep, type Usage } from '../types.ts';
import { compact } from './compaction.ts';
import type { ToolContext, ToolDef } from './tools.ts';

export interface Budget {
  /** Hard ceiling on model calls. Stops a loop that has started going in circles. */
  max_steps: number;
  /** Hard ceiling in USD. PRD section 10: exceed it and the task stops with a notice. */
  max_cost_usd: number;
  /** Wall-clock ceiling in milliseconds. */
  max_ms: number;
}

export const DEFAULT_BUDGET: Budget = {
  max_steps: 30,
  max_cost_usd: 2,
  max_ms: 10 * 60_000,
};

export interface AgentSpec {
  /** Appears on step rows and in traces. */
  name: string;
  /** Frozen for the life of the run. Everything cacheable lives here. */
  system: string;
  tools: ToolDef[];
  /** Which model tier a given turn should use. */
  tier: (turn: number) => 'plan' | 'step' | 'fast';
}

export type AgentOutcome = 'finished' | 'budget' | 'cancelled' | 'error';

export interface AgentRun {
  outcome: AgentOutcome;
  /** The final assistant text, which is what a sub-agent hands back. */
  text: string;
  messages: LLMMessage[];
  usage: Usage;
  cost_usd: number;
  /** Number of store rows written, so the caller can keep numbering. */
  steps: number;
  error: string | null;
}

export interface EngineDeps {
  store: Store;
  llm: LLMProvider;
  trace: TraceSink;
}

export interface EngineHooks {
  /** Next sequence number for a step row. The caller owns the counter. */
  nextSeq(): number;
  onStepStarted?(step: TaskStep): void;
  onStepFinished?(step: TaskStep): void;
  onText?(delta: string): void;
  onUsage?(usage: Usage, costUsd: number): void;
  /** Called after each tool call, for anything the caller wants to watch. */
  onToolResult?(name: string, input: unknown, result: { content: string; is_error?: boolean; meta?: Record<string, unknown> }): void | Promise<void>;
}

export async function runAgent(options: {
  taskId: string;
  spec: AgentSpec;
  deps: EngineDeps;
  ctx: ToolContext;
  messages: LLMMessage[];
  budget: Budget;
  hooks: EngineHooks;
  signal?: AbortSignal;
}): Promise<AgentRun> {
  const { taskId, spec, deps, ctx, messages, budget, hooks, signal } = options;
  const { store, llm, trace } = deps;

  const started = Date.now();
  let usage = emptyUsage();
  let cost = 0;
  let stepCount = 0;
  let text = '';
  let outcome: AgentOutcome = 'budget';
  let error: string | null = null;

  // Fixed for the whole run and sorted, because the serialised tool list is
  // part of the cached prefix and a different order is a different prefix.
  const toolDefs = [...spec.tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  const byName = new Map(spec.tools.map((t) => [t.name, t]));

  for (let turn = 0; turn < budget.max_steps; turn += 1) {
    if (signal?.aborted) {
      outcome = 'cancelled';
      break;
    }
    if (cost >= budget.max_cost_usd) {
      outcome = 'budget';
      error = `cost budget exhausted ($${budget.max_cost_usd.toFixed(2)})`;
      break;
    }
    if (Date.now() - started > budget.max_ms) {
      outcome = 'budget';
      error = `time budget exhausted (${Math.round(budget.max_ms / 1000)}s)`;
      break;
    }

    /* --------------------------------------------------------- model call */

    const step = store.beginStep(taskId, hooks.nextSeq(), 'llm', spec.name, null);
    stepCount += 1;
    hooks.onStepStarted?.(step);
    const callStarted = Date.now();

    let response;
    try {
      response = await llm.complete({
        system: spec.system,
        tools: toolDefs,
        messages,
        tier: spec.tier(turn),
        onTextDelta: hooks.onText,
        signal,
      });
    } catch (err) {
      const finished = store.endStep(step.id, { status: 'error', error: message(err) });
      hooks.onStepFinished?.(finished);
      await trace.record({
        task_id: taskId,
        step_id: step.id,
        kind: 'llm',
        name: spec.name,
        status: 'error',
        started_at: step.started_at,
        duration_ms: Date.now() - callStarted,
        error: message(err),
      });
      outcome = 'error';
      error = message(err);
      break;
    }

    usage = addUsage(usage, response.usage);
    cost += response.cost_usd;
    store.addTaskCost(taskId, response.cost_usd);

    const turnText = textOf(response.content);
    if (turnText) text = turnText;

    const finishedStep = store.endStep(step.id, {
      status: 'ok',
      tokens_in: response.usage.input_tokens,
      tokens_cached: response.usage.cache_read_input_tokens,
      tokens_out: response.usage.output_tokens,
      cost_usd: response.cost_usd,
      output_ref: turnText.slice(0, 400) || null,
    });
    hooks.onStepFinished?.(finishedStep);
    hooks.onUsage?.(usage, cost);

    await trace.record({
      task_id: taskId,
      step_id: step.id,
      kind: 'llm',
      name: `${spec.name} (${response.model})`,
      status: 'ok',
      started_at: step.started_at,
      duration_ms: Date.now() - callStarted,
      usage: response.usage,
      cost_usd: response.cost_usd,
      output: response.content,
    });

    messages.push({ role: 'assistant', content: response.content });

    const calls = response.content.filter(
      (b): b is Extract<LLMContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    );

    if (calls.length === 0) {
      outcome = 'finished';
      break;
    }

    /* ---------------------------------------------------------- tool calls */

    const results: LLMContentBlock[] = [];
    for (const call of calls) {
      const def = byName.get(call.name);
      const toolStep = store.beginStep(
        taskId,
        hooks.nextSeq(),
        'tool',
        call.name,
        JSON.stringify(call.input).slice(0, 2_000),
      );
      stepCount += 1;
      hooks.onStepStarted?.(toolStep);
      const toolStarted = Date.now();

      if (!def) {
        // The model invented a tool. Say so plainly rather than failing the
        // run; it usually recovers on the next turn.
        const content = `unknown tool \`${call.name}\`. Available tools: ${toolDefs
          .map((t) => t.name)
          .join(', ')}`;
        results.push({ type: 'tool_result', tool_use_id: call.id, content, is_error: true });
        hooks.onStepFinished?.(store.endStep(toolStep.id, { status: 'error', error: content }));
        continue;
      }

      let result;
      try {
        result = await def.run(call.input as Record<string, unknown>, ctx);
      } catch (err) {
        result = { content: `tool failed: ${message(err)}`, is_error: true };
      }

      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: result.content,
        ...(result.is_error ? { is_error: true } : {}),
      });

      hooks.onStepFinished?.(
        store.endStep(toolStep.id, {
          status: result.is_error ? 'error' : 'ok',
          output_ref: result.content.slice(0, 400),
          error: result.is_error ? result.content.slice(0, 400) : null,
        }),
      );

      await hooks.onToolResult?.(call.name, call.input, result);

      await trace.record({
        task_id: taskId,
        step_id: toolStep.id,
        kind: 'tool',
        name: call.name,
        status: result.is_error ? 'error' : 'ok',
        started_at: toolStep.started_at,
        duration_ms: Date.now() - toolStarted,
        input: call.input,
        output: result.content.slice(0, 4_000),
        error: result.is_error ? result.content.slice(0, 400) : undefined,
      });
    }

    // All results in one user message. Splitting them across several messages
    // silently teaches the model to stop issuing parallel calls.
    messages.push({ role: 'user', content: results });

    const next = compact(messages);
    if (next !== messages) {
      messages.length = 0;
      messages.push(...next);
    }
  }

  if (outcome === 'budget' && error === null) {
    error = `step budget exhausted (${budget.max_steps} turns)`;
  }

  return { outcome, text, messages, usage, cost_usd: cost, steps: stepCount, error };
}

export const textOf = (blocks: LLMContentBlock[]) =>
  blocks
    .filter((b): b is Extract<LLMContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
