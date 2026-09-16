/**
 * Every user-facing string on the voice surface. Meera's vocabulary: "the bot said
 * the wrong thing", not "constraint violation".
 *
 * The wording around the sweep is the hardest writing in the program and the most
 * consequential: it has to make a thousand clean calls read as *evidence* rather
 * than a promise, without hedging into uselessness. Nothing here says "safe",
 * "verified", "ready" or quotes a pass rate.
 */
export const copy = {
  surface: { name: 'Dhvani', role: 'Voice Agents', tagline: 'Find out if it is any good before it calls anyone.' },

  head: {
    spec: 'What you told it to do',
    sweep: 'What happened when it tried',
    start: 'Run a thousand calls',
    again: 'Run them again',
    stop: 'Stop',
    running: (done: number, total: number) => `${done} of ${total}`,
  },

  spec: {
    hard: 'Must never',
    soft: 'Should',
    examples: 'Worked examples',
    pinned: 'pinned — edits must not break this',
    tested: 'a call hit this',
    untested: 'no call hit this',
    untestedNote:
      'A rule nothing exercised is a rule you are trusting on faith. It has not been shown to hold; it has only not been shown to fail.',
    dirty: 'You have edited the spec since this sweep',
    dirtyNote: (lines: string) =>
      `These results describe the agent before you changed ${lines}. They are still evidence — about a different agent.`,
    contradiction: 'This conflicts with a pinned example',
  },

  sweep: {
    /* Shape first, then clusters. No pass rate, anywhere. */
    shape: 'How the thousand calls ended',
    outcomes: {
      resolved: 'sorted it out',
      off_script_but_fine: 'went off script and it was fine',
      escalated: 'passed to a person',
      abandoned: 'caller hung up',
      looped: 'went in circles',
      timed_out: 'ran out',
      constraint_breached: 'said something it must never say',
    },
    clusters: 'What went wrong, grouped by cause',
    count: (n: number) => `${n} calls`,
    worse: (n: number) => `${n} worse than last time`,
    better: (n: number) => `${n} better`,
    same: 'unchanged',
    regressedHeading: 'This run is worse than the last one',
    regressedNote: 'An edit that fixes one thing and breaks another is normal. It is only a problem if you do not see it.',
    tracedTo: 'governed by',
    untraceable: 'no rule explains this group',
    unnameable: 'the grouping found these together and could not say why',
    exemplar: 'One of these calls',
    turnAt: 'at',
    breachHere: 'this is the turn',
    caveats: 'What this sweep cannot tell you',
    partial: (done: number, total: number) =>
      `Stopped at ${done} of ${total}. The shape holds; the small groups are noisy.`,
  },

  /* The sentence that decides whether she over-trusts the number. */
  evidence: {
    heading: 'What these thousand calls are',
    body: 'They are a thousand conversations with callers this system invented. Those callers are more patient, clearer and more cooperative than the people who will actually pick up. Read this as a way to find problems, not as a measure of how it will go.',
  },

  gate: {
    heading: 'Going live',
    consequence:
      'The next step makes a real phone ring in a borrower’s pocket, about money they owe. There is no staging environment that contains that.',
    blocked: 'Not yet',
    capHeading: 'Start with a cap',
    capBody: (n: number, untested: number) =>
      untested > 0
        ? `${untested} of your rules were never exercised. Start with ${n} real calls, then look again with real evidence.`
        : `Start with ${n} real calls, then look again with real evidence.`,
    throttles: 'And the usual throttles',
    cps: (n: number) => `${n} calls per second`,
    window: (from: string, to: string) => `only between ${from} and ${to}`,
    retries: 'retries busy and no-answer once, failed not at all',
    capIsOurs: 'The cap is the addition — the rest is how a campaign normally runs.',
    rent: 'Rent a number',
    pending: 'Number being provisioned',
    goLive: (n: number) => `Go live, capped at ${n} calls`,
    live: 'Live',
    liveWithCap: (used: number, cap: number) => `Live — ${used} of ${cap} calls used`,
    pause: 'Pause it',
    paused: 'Paused',
    diverging: 'Production is not behaving like the simulation',
  },

  /* Added after docs/sarvam-voice-agents-webinar.md — an agent is a prompt
     document plus tools, variables and a goal. See docs/webinar-gap-analysis.md. */
  agent: {
    sections: 'The prompt, by section',
    tools: 'What it can call',
    toolWhen: {
      conversation_start: 'at the start',
      mid_conversation: 'mid-call',
      conversation_end: 'at the end',
    },
    budget: (ms: number) => `${(ms / 1000).toFixed(1)}s budget`,
    budgetOver: 'over the 5s that keeps a conversation feeling live',
    budgetNote:
      'A tool the caller waits on is dead air. Five seconds is the advice; thirty is the hard stop.',
    validator: (regex: string) => `checks the value against ${regex}`,
    validatorNote:
      'Format checking catches a malformed number. Reading it back catches a correctly-formed one it misheard. They are different bugs and you want both.',
    inputs: 'What it knows before it dials',
    outputs: 'What it pulls out afterwards',
    extraction: 'pulled out by',
    goal: 'A call counts when',
  },

  behaviours: {
    heading: 'What you said it should do',
    note: 'Each of these is checked against every simulated call. A group of failures points at the one that broke.',
    held: (held: number, checked: number) => `${held} of ${checked} held`,
    never: 'no call exercised this',
    perfect: 'held everywhere',
    brokenBy: 'broke in',
    inSection: 'in',
  },

  settings: {
    heading: 'How it listens',
    eagerness: 'Eagerness',
    eagernessNote: (v: number) =>
      v < 0.5
        ? 'Low — it answers quickly and listens for less. Fast, and it talks over people who pause.'
        : 'High — it waits longer before answering. Patient, and it feels slow.',
    interruptions: 'Caller can interrupt',
    threshold: 'Interruption threshold',
    thresholdNote: (v: number) =>
      v < 0.3
        ? 'Low enough that traffic noise will stop it mid-sentence.'
        : 'Tuned for a noisy line.',
    nudge: (ms: number, n: number) =>
      `Nudges after ${(ms / 1000).toFixed(0)}s of silence, hangs up after ${n}.`,
    voicemail: 'Detects voicemail and hold music, and cuts rather than burning minutes.',
    ambience: (what: string) => `Plays ${what} behind the call — silence sounds synthetic.`,
    rate: (x: number) => `Speaks at ${x}×`,
  },

  production: {
    heading: 'What the real calls did',
    note: 'The same measures from the simulation, beside the ones from the phone.',
    simulated: 'simulated',
    live: 'live',
    calls: (n: number) => `${n} real calls`,
    goal: 'reached the goal',
    shortCalls: 'ended in under ten seconds',
    turn: 'median turn',
    gap: 'The gap between these two columns is the only thing the simulation could not tell you.',
  },

  fleet: {
    heading: 'The fleet',
    seam: 'the handoff',
    carried: 'carried',
    dropped: 'dropped here',
    inferred: 'guessed',
    conflict: 'Two agents wrote different things',
  },

  latency: {
    heading: 'What a turn costs',
    ttft: 'Before it starts speaking',
    total: 'Whole turn',
    placeholder: 'These timings are placeholders — nothing has measured this path yet.',
  },
} as const;
