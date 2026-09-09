/**
 * Every user-facing string on the coding surface, in one place, because copy is
 * the thing that gets iterated most and hunting it through JSX is why it stops
 * getting iterated. Wording here is deliberate: "needs you" not "action required",
 * "left alone" not "no results".
 */
export const copy = {
  surface: {
    name: 'Anvaya',
    role: 'Coding Agents',
    tagline: 'A run that goes for forty minutes, and staying in control of it.',
  },

  orient: {
    heading: 'Where it is',
    worryNo: 'Nothing needs you',
    worrySoon: 'Worth a look',
    worryNow: 'Needs you now',
    elapsed: 'Running for',
    sinceProgress: 'Last progress',
    idle: 'No run yet',
    cancelledWith: (n: number) =>
      `Cancelled — ${n} change${n > 1 ? 's' : ''} from before the stop ${n > 1 ? 'are' : 'is'} still on disk`,
    cancelledClean: 'Cancelled before anything was written',
    start: 'Start the run',
    restart: 'Run it again',
    stop: 'Stop',
  },

  phase: {
    idle: 'Not started',
    planning: 'Working out a plan',
    running: 'Working',
    awaiting_input: 'Waiting on you',
    diverged: 'Off the plan',
    stalled: 'No progress',
    succeeded: 'Finished',
    partial: 'Finished, partly',
    failed: 'Stopped',
    cancelled: 'Cancelled',
  } as const,

  step: {
    queued: 'queued',
    running: 'working',
    succeeded: 'done',
    failed: 'failed',
    cancelled: 'cancelled',
    partially_succeeded: 'partly done',
    blocked_on_human: 'needs you',
    blocked_on_upstream: 'waiting on an earlier step',
    blocked_on_permission: 'needs permission',
    retrying: 'retrying',
    stalled: 'no progress',
    speculative: 'provisional',
  } as const,

  plan: {
    heading: 'The plan',
    collapsed: (n: number) => `${n} steps done`,
    expand: 'Show them',
    collapse: 'Fold them up',
    revisedHeading: 'The agent changed its own plan',
    revisedAdded: 'Added',
    revisedDropped: 'Dropped',
    speculativeNote: 'Resting on an assumption that has not been confirmed',
  },

  diverge: {
    heading: 'The work no longer matches the plan',
    expected: 'The plan said',
    observed: 'It is doing',
    evidence: 'Where',
    note: 'Nothing has failed. This is the state everything else on screen calls healthy.',
  },

  steer: {
    heading: 'Change direction',
    placeholder: 'Use the existing adapter instead of a new interface',
    preview: 'What that does to the work already done',
    kept: 'Kept',
    discarded: 'Discarded',
    requeued: 'Done again',
    apply: 'Apply this',
    cancel: 'Leave it running',
    applied: 'Direction changed',
    empty: 'Nothing in flight to steer.',
  },

  ask: {
    permission: 'The agent wants permission',
    blockingRun: 'The whole run is waiting',
    blockingBranch: 'One branch is waiting; the rest carries on',
    answered: 'You answered',
  },

  checkpoints: {
    heading: 'Checkpoints',
    empty: 'No boundary reached yet.',
    acceptTo: 'Accept everything up to here',
    restore: 'Go back to here',
    clean: 'Everything inside this is settled',
    partial: 'Something inside this is still provisional',
    restored: 'Restored to this point',
    diffAgainst: 'Changed since the previous checkpoint',
    loose: 'Not inside a checkpoint yet',
  },

  changes: {
    heading: 'Changes',
    empty: 'Nothing written yet.',
    proposed: 'proposed',
    applied: 'applied',
    applied_unreviewed: 'applied without review',
    reverted: 'reverted',
    conflicts_with_manual_edit: 'you also edited this',
    conflictNote: 'Both versions exist. Neither is authoritative, so nothing here picks for you.',
    unreviewedNote: 'Landed under the envelope while you were away.',
  },

  nonfinding: {
    heading: 'Looked at and left alone',
    absent: 'Not there',
    inaccessible: 'Could not read',
    ambiguous: 'Could not tell',
    illegible: 'Unreadable',
    boundary: 'Where it looked',
  },

  envelope: {
    heading: 'What it may do without asking',
    may: 'On its own',
    mustAsk: 'Asks first',
    floor: 'Confidence floor',
    floorHelp: 'The only place a raw score belongs. Everywhere else, three bands.',
    consequence: (autoApplied: number, asks: number, wrong: number) =>
      `At this floor: about ${autoApplied} changes land on their own, ${asks} come to you, and about ${wrong} of the automatic ones will be wrong.`,
    revoke: 'Revoke and halt',
  },

  spec: {
    heading: 'Standing instructions',
    hard: 'Rules it must not break',
    soft: 'Preferences',
    examples: 'Worked examples',
    tested: 'tested',
    untested: 'never exercised',
    pinning: 'pinned',
  },

  latency: {
    heading: 'Where the time went',
    ttft: 'To first token',
    total: 'Total',
    network: 'network',
    queue: 'queue',
    model: 'model',
    synthesis: 'synthesis',
    distribution: (label: string, n: number) => `${label} — ${n} runs`,
    p50: 'p50',
    p95: 'p95',
    placeholder: 'These timings are placeholders. Nothing has measured this path yet.',
    measured: 'Measured from real calls.',
    oneRun: 'This run',
  },

  errors: {
    /** Keyed by the event's `kind`, which is typed by cause because cause
        determines the UI: auth reads nothing like rate_limit. */
    kind: {
      auth: 'The key was rejected',
      rate_limit: 'Rate limited',
      timeout: 'Timed out',
      network: 'Network',
      stalled: 'No progress',
      unsupported: 'Not supported',
      parse_failed: 'Could not parse the response',
      language_mismatch: 'Wrong language',
      out_of_scope: 'Outside what it was asked to do',
      envelope_breach: 'Tried to act outside its envelope',
    } as Record<string, string | undefined>,
    retryIn: (s: number) => `Retryable in ${s}s`,
    retryable: 'Retryable',
    notRetryable: 'Not retryable',
  },
} as const;
