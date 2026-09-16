/** The work surface's cases, one per interesting state in projects/work/states.md. */
import { scripts, type FaultKind, type Script } from '../agent-runtime';

export type WorkCase = { id: string; state: string; shows: string; script: Script; faults: FaultKind[] };

const base = scripts.morningBrief;

export const workCases: WorkCase[] = [
  {
    id: 'clean',
    state: 'PROPOSED · AUTO_EXECUTED · BLOCKED_ON_HUMAN · BLOCKED_ON_PERMISSION · ACTED_AS_USER · HANDOFF_LOSSY',
    shows: 'The overnight run as he finds it: what it did, what went out in his name, what needs him.',
    script: base,
    faults: [],
  },
  {
    id: 'failed-midway',
    state: 'FAILED_MIDWAY · COMPENSATION_OFFERED · COMPENSATION_IMPOSSIBLE',
    shows: 'Three systems, two landed, one did not — and the email cannot be unsent.',
    script: base,
    faults: ['failed_midway'],
  },
  {
    id: 'unknown-leg',
    state: 'SYSTEM_UNKNOWN',
    shows: 'The write may or may not have landed. Retrying could duplicate; assuming failure leaves a gap.',
    script: base,
    faults: ['unknown_leg'],
  },
  {
    id: 'scope-expired',
    state: 'SCOPE_EXPIRED',
    shows: 'A grant lapsed on its own. Renewing is a different action from granting it again.',
    script: base,
    faults: ['scope_expired_work'],
  },
  {
    id: 'scope-breach',
    state: 'SCOPE_BREACH_ATTEMPTED · ACCESSED_SENSITIVE',
    shows: 'It tried to read the finance workspace. Logged loudly, never a silent deny.',
    script: base,
    faults: ['scope_breach'],
  },
  {
    id: 'residency',
    state: 'RESIDENCY_CONSTRAINED',
    shows: 'An action is impossible because the data cannot leave the region. A procurement blocker, designed.',
    script: base,
    faults: ['residency_block'],
  },
  {
    id: 'source-gone',
    state: 'SOURCE_UNAVAILABLE',
    shows: 'The message a claim rests on was deleted. The claim stands and the evidence does not.',
    script: base,
    faults: ['source_unavailable'],
  },
  {
    id: 'empty',
    state: 'BRIEF_EMPTY',
    shows: 'Nothing needed him — stated with its boundary, which is the highest-trust thing this product says.',
    script: base,
    faults: ['empty_brief'],
  },
  {
    id: 'planted',
    state: 'appropriate distrust',
    shows: 'A plausible, wrong action already sent in his name: the right customer, a discount nobody approved.',
    script: base,
    faults: ['planted_wrong_action'],
  },
  {
    id: 'disputed',
    state: 'ATTRIBUTION_DISPUTED · IRREVERSIBLE_DONE',
    shows: 'He says he did not send it. The ledger says he did. The state an audit exists for.',
    script: base,
    faults: ['attribution_disputed'],
  },
  {
    id: 'everything',
    state: 'compound',
    shows: 'A half-finished action, a lapsed scope, a breach attempt and a residency block at once.',
    script: base,
    faults: ['failed_midway', 'scope_expired_work', 'scope_breach', 'residency_block'],
  },
];
