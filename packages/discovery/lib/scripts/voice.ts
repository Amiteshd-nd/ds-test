/** The voice surface's cases, one per interesting state in projects/voice/states.md. */
import { scripts, type FaultKind, type Script } from '../agent-runtime';

export type VoiceCase = { id: string; state: string; shows: string; script: Script; faults: FaultKind[] };

const base = scripts.voiceAuthoring;

export const voiceCases: VoiceCase[] = [
  {
    id: 'clean',
    state: 'SECTIONED_PROMPT · TOOL_DEFINED · VALIDATOR_BOUND · INPUT_VARIABLE · OUTPUT_VARIABLE · GOAL_DEFINED · BEHAVIOUR_EXPECTED · BEHAVIOUR_BROKEN · EAGERNESS_SET · NUDGING · SWEEP_COMPLETE · SWEEP_REGRESSED · CLUSTER_NAMED · CLUSTER_TRACED · CONSTRAINT_BREACHED · OFF_SCRIPT_BUT_FINE · SPEC_CONSTRAINT_UNTESTED',
    shows: 'The whole agent — prompt sections, tools with budgets, variables, the goal — then a thousand calls, the clusters, and one exemplar turn with the breach marked.',
    script: base,
    faults: [],
  },
  {
    id: 'dirty',
    state: 'SPEC_DIRTY · SWEEP_STALE',
    shows: 'She edited the spec after the sweep. These results describe a different agent, and the gate refuses.',
    script: base,
    faults: ['spec_dirty'],
  },
  {
    id: 'untested',
    state: 'SPEC_CONSTRAINT_UNTESTED · BEHAVIOUR_UNEXERCISED',
    shows: 'Two hard rules no call exercised. Believed rather than shown — and the reason the cap exists.',
    script: base,
    faults: ['constraint_untested'],
  },
  {
    id: 'regressed',
    state: 'SWEEP_REGRESSED',
    shows: 'A cluster got much worse since the last run. Reserved treatment, above the clusters, impossible to miss.',
    script: base,
    faults: ['sweep_regressed'],
  },
  {
    id: 'partial',
    state: 'SWEEP_PARTIAL',
    shows: 'Stopped at 414 of 1000. Still informative, and it does not present as a failure.',
    script: base,
    faults: ['sweep_partial'],
  },
  {
    id: 'unnameable',
    state: 'CLUSTER_UNNAMEABLE · CLUSTER_UNTRACEABLE',
    shows: 'Twenty-two calls group together and nothing explains why. Saying so beats inventing a label.',
    script: base,
    faults: ['cluster_unnameable'],
  },
  {
    id: 'live-diverging',
    state: 'LIVE · CALL_CAP_ACTIVE · LIVE_DIVERGING · PRODUCTION_SIGNAL',
    shows: 'Live under a cap, and production is not behaving like the simulation. Her actual fear.',
    script: base,
    faults: ['live_diverging'],
  },
  {
    id: 'fleet',
    state: 'HANDOFF_LOSSY',
    shows: 'Context dropped at the seam between the explainer and the negotiator.',
    script: base,
    faults: ['handoff_lossy_voice'],
  },
  {
    id: 'contradiction',
    state: 'SPEC_CONTRADICTION',
    shows: 'An edit conflicts with a pinned worked example. Both shown; nothing resolved for her.',
    script: scripts.voiceSweep,
    faults: [],
  },
  {
    id: 'fleet-full',
    state: 'MEMORY_CONFLICT',
    shows: 'Two agents wrote contradictory facts into shared memory. Both writers named.',
    script: scripts.voiceFleet,
    faults: [],
  },
  {
    id: 'interruption',
    state: 'INTERRUPTION_MISFIRE',
    shows: 'The interruption threshold is wrong for a noisy line, so it stops mid-sentence and never resumes.',
    script: base,
    faults: ['interruption_misfire'],
  },
  {
    id: 'tool-slow',
    state: 'TOOL_OVER_BUDGET',
    shows: 'A ten-second lookup. The caller hears dead air — a latency failure wearing a tool as a costume.',
    script: base,
    faults: ['tool_too_slow'],
  },
  {
    id: 'on-hold',
    state: 'HELD_ON_HOLD',
    shows: '38 calls parked on hold music and cut by the harness. They are not in the shape, and the caveat says why.',
    script: base,
    faults: ['held_on_hold'],
  },
  {
    id: 'everything',
    state: 'compound',
    shows: 'Stale spec, untested rules, a regression and production diverging, all at once.',
    script: base,
    faults: ['spec_dirty', 'constraint_untested', 'sweep_regressed', 'live_diverging', 'tool_too_slow'],
  },
];
