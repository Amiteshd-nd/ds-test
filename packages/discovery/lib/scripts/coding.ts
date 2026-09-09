/**
 * The coding surface's scripts, one per interesting state in
 * projects/coding/states.md. A state with no script is a state you can't design,
 * so this file and that file are meant to stay in step.
 *
 * Each entry is (script, faults). The faults do the work: the base run is one
 * script and every failure state is that script transformed deterministically,
 * which is why the same seed always produces the same failure at the same moment.
 */
import { scripts, type FaultKind, type Script } from '../agent-runtime';

export type CodingCase = {
  id: string;
  /** The state this case exists to show, as named in projects/coding/states.md. */
  state: string;
  /** What a person is supposed to learn from looking at it. */
  shows: string;
  script: Script;
  faults: FaultKind[];
};

const base = scripts.codingRun;

export const codingCases: CodingCase[] = [
  {
    id: 'clean',
    state: 'RUNNING → SUCCEEDED (partial outcome)',
    shows: 'The happy path: plan, work, two checkpoints, one non-finding, one provisional change.',
    script: base,
    faults: [],
  },
  {
    id: 'plan-revised',
    state: 'PLAN_REVISED',
    shows: 'The agent rewrites its own plan mid-run. Rendered as an event, never a silent update.',
    script: base,
    faults: ['plan_revised'],
  },
  {
    id: 'diverged',
    state: 'DIVERGED',
    shows: 'Work no longer matches the plan and nothing has failed. Everything still looks fine.',
    script: base,
    faults: ['diverged_run'],
  },
  {
    id: 'blocked-permission',
    state: 'BLOCKED_ON_PERMISSION',
    shows: 'The reserved attention channel: the one state that costs him something if missed.',
    script: base,
    faults: ['permission_block'],
  },
  {
    id: 'manual-conflict',
    state: 'CONFLICTS_WITH_MANUAL_EDIT',
    shows: 'He edited a file the agent was writing. Both versions exist; neither is authoritative.',
    script: base,
    faults: ['manual_edit_conflict'],
  },
  {
    id: 'speculative-discard',
    state: 'SPECULATIVE → REVERTED',
    shows: 'Provisional work dropped when its assumption failed. The treatment has to earn that.',
    script: base,
    faults: ['speculative_discard'],
  },
  {
    id: 'stalled',
    state: 'STALLED',
    shows: 'Running, no progress, no error. Healthy-looking everywhere it matters.',
    script: base,
    faults: ['stalled_node'],
  },
  {
    id: 'slow-ttft',
    state: 'RUNNING (slow first token)',
    shows: 'Latency as a design material: 4.5s to first token, and what the waterfall says about it.',
    script: base,
    faults: ['slow_ttft'],
  },
  {
    id: 'rate-limited',
    state: 'FAILED — rate_limit',
    shows: 'A retryable failure with a stated wait, arriving mid-run.',
    script: base,
    faults: ['rate_limited'],
  },
  {
    id: 'auth-failed',
    state: 'FAILED — auth',
    shows: 'The most-hit error in any API product. It replaces the run rather than decorating it.',
    script: base,
    faults: ['auth_failed'],
  },
  {
    id: 'succeeded',
    state: 'SUCCEEDED · CHECKPOINT_CLEAN',
    shows: 'The finished run: every step done, three clean boundaries, nothing provisional left.',
    script: scripts.codingRunComplete,
    faults: [],
  },
  {
    id: 'awaiting-steering',
    state: 'AWAITING_STEERING',
    shows: 'Paused for direction, blocking the whole run — not one branch. Same channel, different words.',
    script: base,
    faults: ['awaiting_steering'],
  },
  {
    id: 'retrying',
    state: 'RETRYING',
    shows: 'A second attempt, with what changed between them stated rather than implied.',
    script: base,
    faults: ['retrying_step'],
  },
  {
    id: 'blocked-upstream',
    state: 'BLOCKED_ON_UPSTREAM',
    shows: 'Waiting on an earlier step. Reads as waiting, not as idle and not as broken.',
    script: base,
    faults: ['upstream_blocked'],
  },
  {
    id: 'partial-step',
    state: 'PARTIALLY_SUCCEEDED',
    shows: 'The step half-worked. Deliberately not foldable — the part that failed is the information.',
    script: base,
    faults: ['partial_step'],
  },
  {
    id: 'envelope-breach',
    state: 'ENVELOPE_BREACH',
    shows: 'It tried to act outside its authority. Loud, logged, and never something it can widen itself.',
    script: base,
    faults: ['envelope_breach'],
  },
  {
    id: 'cancelled',
    state: 'CANCELLED',
    shows: 'Stopped by hand mid-run. What survived the cancel is the whole question.',
    script: base,
    faults: ['cancelled_midrun'],
  },
  {
    id: 'everything',
    state: 'compound',
    shows: 'Plan revision, divergence, a manual-edit conflict and a permission block at once.',
    script: base,
    faults: ['plan_revised', 'diverged_run', 'manual_edit_conflict', 'permission_block'],
  },
];

export const codingCaseById = (id: string) => codingCases.find((c) => c.id === id);
