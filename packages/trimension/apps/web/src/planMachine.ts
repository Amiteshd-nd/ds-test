/**
 * The plan approval loop as a finite state machine (PRD §4.8, invariant I7).
 *
 * A CAD command handling events across multiple states *is* an FSM, and the useful
 * consequence the PRD names is that an FSM's input alphabet is already a tool schema —
 * so an agent enters the same machine a human's mouse enters. This one governs the
 * approval gate: an agent's writes are impossible until this machine reaches `approved`,
 * and it returns to `idle` the moment the plan finishes or is rejected.
 *
 * Approval is per-plan and never standing. That is why `applied` transitions back to
 * `idle` rather than staying approved for the next plan.
 */
import { assign, setup } from 'xstate'
import type { Plan } from './doc'

export interface PlanContext {
  plan: Plan | null
  error: string | null
  appliedCommits: string[]
}

export type PlanEvent =
  | { type: 'PROPOSE'; plan: Plan }
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason?: string }
  | { type: 'APPLIED'; commit: string }
  | { type: 'FAILED'; error: string }
  | { type: 'DONE' }

export const planMachine = setup({
  types: {
    context: {} as PlanContext,
    events: {} as PlanEvent,
  },
}).createMachine({
  id: 'plan',
  initial: 'idle',
  context: { plan: null, error: null, appliedCommits: [] },
  states: {
    /** No plan in flight. Agent writes are refused by the Rust layer in this state. */
    idle: {
      on: {
        PROPOSE: {
          target: 'proposed',
          actions: assign({
            plan: ({ event }) => event.plan,
            error: null,
            appliedCommits: () => [],
          }),
        },
      },
    },

    /** A human is looking at the plan. Still nothing applied. */
    proposed: {
      on: {
        APPROVE: 'approved',
        REJECT: {
          target: 'idle',
          actions: assign({
            plan: null,
            error: ({ event }) => event.reason ?? 'rejected by the reviewer',
          }),
        },
      },
    },

    /** Approved. This is the only state in which an agent commit can land. */
    approved: {
      on: {
        APPLIED: {
          actions: assign({
            appliedCommits: ({ context, event }) => [...context.appliedCommits, event.commit],
          }),
        },
        FAILED: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error }),
        },
        DONE: 'idle',
        // A reviewer can withdraw approval mid-run. Commits already applied stay —
        // history is append-only — but nothing further lands.
        REJECT: {
          target: 'idle',
          actions: assign({
            plan: null,
            error: 'approval withdrawn mid-plan',
          }),
        },
      },
    },

    failed: {
      on: {
        DONE: {
          target: 'idle',
          actions: assign({ plan: null }),
        },
        PROPOSE: {
          target: 'proposed',
          actions: assign({
            plan: ({ event }) => event.plan,
            error: null,
            appliedCommits: () => [],
          }),
        },
      },
    },
  },
})
