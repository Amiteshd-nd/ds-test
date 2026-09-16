/**
 * Every user-facing string on the work surface. Anand's words: "sent", "needs you",
 * "in your name" — never "action executed" or "permission denied".
 *
 * The wording around `as_user` is the most careful writing in this surface. The
 * decision was ledger-only disclosure, so the copy has to be blunt about what the
 * recipient can and cannot tell, and must never imply the recipient was informed.
 */
export const copy = {
  surface: { name: 'Sahaya', role: 'Work Agents', tagline: 'Agents acting inside your working life.' },

  brief: {
    heading: (date: string) => `Overnight, ${date}`,
    did: (n: number) => `${n} done`,
    needsYou: (n: number) => (n === 1 ? '1 needs you' : `${n} need you`),
    asHim: (n: number) => (n === 1 ? '1 went out as you' : `${n} went out as you`),
    broken: (n: number) => (n === 1 ? '1 half-finished' : `${n} half-finished`),
    read: (read: number, total: number) => `${read} of ${total} read`,
    checked: 'What it looked at',
    start: 'Open the brief',
    again: 'Run it again',
    stop: 'Stop',
    resume: 'Pick up where you left off',
    markRead: 'Read',
    emptyHeading: 'Nothing needed you',
    emptyBody: 'It went through everything below and none of it needed a decision from you.',
  },

  needs: {
    nothing: 'handled',
    decision: 'needs a decision',
    permission: 'needs permission',
  },

  action: {
    heading: 'The ledger',
    empty: 'Nothing yet.',
    /* State names as he would say them. */
    proposed: 'drafted, not sent',
    auto_executed: 'done without asking',
    executed_approved: 'done, you approved it',
    blocked_on_human: 'needs you',
    blocked_on_permission: 'not allowed',
    reversed: 'undone',
    irreversible_done: 'sent',
    failed_midway: 'half-finished',
    queued_behind_approval: 'waiting on an earlier one',

    approve: 'Send it',
    edit: 'Edit first',
    reject: 'Do not send',
    undo: 'Undo',
    undoWindow: (seconds: number) => `Can be pulled back for ${seconds}s`,
    undoGone: 'Past the point where it can be pulled back',
    sources: 'From',
    sourceGone: 'the message this came from is no longer there',
  },

  attribution: {
    as_user: 'in your name',
    as_agent: 'as the assistant',
    ambiguous: 'you edited it, so both',
    /* The blunt one. No euphemism, and no implication the recipient was told. */
    asUserNote: 'The recipient sees this as coming from you. Nothing tells them otherwise.',
    ambiguousNote: 'You edited a draft before it went. The trail records both hands.',
    channelOptIn: (channel: string) => `Sending as you is on for ${channel}.`,
    turnOff: 'Turn that off',
  },

  legs: {
    heading: 'What landed and what did not',
    done: 'landed',
    failed: 'did not land',
    unknown: 'no answer',
    unknownNote:
      'It sent the write and never heard back. It may have landed. Retrying could duplicate it, and assuming it failed could leave a gap — so it is neither, until someone looks.',
    check: 'Check it yourself',
    compensation: 'What can be undone',
    impossible: 'cannot be undone',
  },

  scope: {
    heading: 'What it can reach',
    granted: 'until',
    expired: 'lapsed',
    revoked: 'withdrawn',
    expiredNote: 'It lapsed on its own. Renewing is a different action from granting it again.',
    ceiling: 'Your admin has ruled out',
    ceilingNote: 'You cannot widen past this, and neither can the assistant.',
    sensitive: 'read something flagged',
    breach: 'tried to go outside its envelope',
    residency: (region: string) => `Blocked: the data cannot leave ${region}.`,
  },

  taper: {
    heading: 'It is asking to stop asking',
    body: (kind: string, clean: number, since: string) =>
      `${kind}: ${clean} in a row since ${since}, none of them pulled back.`,
    widen: (to: string) => `It wants to: ${to}`,
    accept: 'Let it',
    decline: 'Keep asking me',
    accepted: 'you let it',
    declined: 'you said keep asking',
    note: 'You can narrow this again at any time, and narrowing stops anything in flight.',
  },

  handoff: {
    heading: 'Between assistants',
    carried: 'carried across',
    dropped: 'dropped at the seam',
    inferred: 'guessed',
  },

  nonfinding: { heading: 'Looked at and left alone', where: 'Where it looked' },

  envelope: {
    heading: 'What it may do without asking',
    may: 'On its own',
    mustAsk: 'Asks you first',
    consequence: (auto: number, asks: number, wrong: number) =>
      `About ${auto} things a week land on their own, ${asks} come to you, and about ${wrong} of the automatic ones will be wrong.`,
    revoke: 'Stop everything',
  },
} as const;
