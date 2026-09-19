// A state graph. PRD §9.1 Mode A — explicit nodes, deterministic, cheap, debuggable,
// and adequate for roughly 80% of real agents.
//
// The PRD specifies LangGraph. docs/DECISIONS.md D-5 explains why this is 120 lines
// instead: the node signature is LangGraph's own, `(state, ctx) => Partial<state>`, so
// the migration is mechanical if Mode B ever makes a real graph framework worth its
// state, callback, and tracing model.
//
// What this does that matters: it checkpoints after every node. That is what makes
// "kill the process mid-run" a recoverable event rather than a lost conversation, and
// it is the same mechanism that lets an `awaiting_approval` run sit for days.

import type { RunStore } from '../runtime/store.ts';
import { CortexError, asCortexError } from '../errors.ts';

export interface GraphContext {
  runId: string;
  store: RunStore;
  signal?: AbortSignal;
}

/** Returning `{ __halt: true }` stops the graph without failing it — that is a gate. */
export type NodeResult<S> = Partial<S> & { __goto?: string; __halt?: boolean };
export type NodeFn<S> = (state: S, ctx: GraphContext) => Promise<NodeResult<S>>;

interface NodeDef<S> {
  name: string;
  fn: NodeFn<S>;
  next?: (state: S) => string | null;
}

export class StateGraph<S extends object> {
  #nodes = new Map<string, NodeDef<S>>();
  #order: string[] = [];
  #maxSteps: number;

  constructor(maxSteps = 24) {
    this.#maxSteps = maxSteps;
  }

  node(name: string, fn: NodeFn<S>, next?: (state: S) => string | null): this {
    this.#nodes.set(name, { name, fn, next });
    this.#order.push(name);
    return this;
  }

  /**
   * Runs from `startAt` (or the entry node), checkpointing after each node.
   * `halted` distinguishes a run that stopped at a gate from one that finished.
   */
  async run(initial: S, ctx: GraphContext, startAt?: string): Promise<{ state: S; halted: boolean; lastNode: string }> {
    let state = initial;
    let current: string | null = startAt ?? this.#order[0];
    let steps = 0;
    let lastNode = current;

    while (current) {
      if (steps++ > this.#maxSteps) {
        // §14.4 item 6 — a pathological prompt that induces an unbounded tool loop hits
        // a ceiling here, as a typed error the UI can render.
        throw new CortexError('budget_exceeded', `Run exceeded ${this.#maxSteps} steps.`, { runId: ctx.runId });
      }
      const node = this.#nodes.get(current);
      if (!node) throw new CortexError('internal', `graph: no node named ${current}`);
      if (ctx.signal?.aborted) return { state, halted: true, lastNode: current };

      let result: NodeResult<S>;
      try {
        result = await node.fn(state, ctx);
      } catch (err) {
        const e = asCortexError(err);
        ctx.store.trace(ctx.runId, null, 'node_error', { node: current, kind: e.kind, message: e.message });
        throw e;
      }

      const { __goto, __halt, ...patch } = result;
      state = { ...state, ...(patch as Partial<S>) };
      lastNode = current;

      // Checkpoint after the node, not before: a resumed run re-enters at the node
      // *after* the last one that actually completed, so no side effect runs twice.
      const nextName: string | null = __halt ? current : (__goto ?? node.next?.(state) ?? this.#order[this.#order.indexOf(current) + 1] ?? null);
      ctx.store.checkpoint(ctx.runId, nextName ?? '__done', state);

      if (__halt) return { state, halted: true, lastNode };
      current = nextName;
    }

    return { state, halted: false, lastNode };
  }
}
