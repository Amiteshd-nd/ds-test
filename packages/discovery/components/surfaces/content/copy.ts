/**
 * Every user-facing string on the content surface.
 *
 * Two rules bear hardest here. **Never over-claim about evidence**: a clean
 * back-translation is not a certificate, and none of this copy may imply it is.
 * And **the consent wording** — the interface allows what it cannot clear, so the
 * words have to carry what a disabled button would have.
 */
export const copy = {
  surface: {
    name: 'Anuvada',
    role: 'Content Agents',
    tagline: 'Approving media in a language you cannot evaluate.',
  },

  head: {
    source: 'The source',
    languages: (n: number) => `${n} languages`,
    flagged: (n: number) => (n === 1 ? '1 needs a look' : `${n} need a look`),
    clean: (n: number) => `${n} came back clean`,
    waiting: (n: number) => `${n} still running`,
    start: 'Dub it',
    again: 'Run it again',
    stop: 'Stop',
    duration: (ms: number) => {
      const s = Math.round(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  },

  /* The two axes. Separate questions, separate words, never a combined score. */
  axis: {
    fluency: 'Reads naturally',
    fidelity: 'Says the same thing',
    committed: 'yes',
    check: 'not sure',
    failed: 'no',
    /* Deliberately not a label for the corner where fluency is high and fidelity
       is low — see the decision log. The row shows both and lets them speak. */
  },

  board: {
    heading: 'Nine languages',
    cleanRow: (n: number) => `${n} clean, nothing flagged`,
    expand: 'Show them',
    collapse: 'Fold them up',
    waiting: 'not back yet',
    open: 'Open',
    close: 'Close',
    approved: 'approved',
    approvedUnverified: 'approved without checking',
    inReview: 'with a native reviewer',
  },

  mirror: {
    heading: 'What it says, translated back',
    note: 'This is a round trip, not a certificate. It shows where meaning moved — it cannot tell you the rest is right.',
    source: 'The source said',
    back: 'The dub says, back in English',
    added: 'added',
    removed: 'missing',
    moved: 'changed',
    held: 'held',
    noDrift: 'Nothing moved on the round trip.',
    driftHeading: 'Where the meaning moved',
  },

  term: {
    heading: 'A protected term got translated',
    body: (term: string, renderedAs: string) => `"${term}" came out as "${renderedAs}".`,
    note: 'These have accepted English forms in Indian usage. Translating them makes the copy read as foreign.',
    pin: 'Pin the English form',
    pinned: 'pinned',
  },

  clause: {
    heading: 'A clause is missing',
    regulated: 'This one is regulated. A missing exclusion is a legal problem, not a tone problem.',
    at: 'At',
  },

  pronunciation: {
    heading: 'A name probably came out wrong',
    note: 'You cannot hear this one. Below is what it should sound like and what it actually said, written in scripts you read.',
    expected: 'Should sound like',
    actual: 'Actually said',
    latin: 'Latin',
    kannada: 'Kannada',
    unverified: 'These transliterations are generated and unchecked. They are evidence, so treat them as a lead, not a finding.',
  },

  voice: {
    heading: 'The voice changes partway',
    at: 'Between',
  },

  timing: {
    heading: 'It does not fit the shot',
    overrun: (ms: number) => `${(ms / 1000).toFixed(1)}s too long`,
    underrun: (ms: number) => `${(ms / 1000).toFixed(1)}s short — dead air over a moving picture`,
    fits: 'fits',
    expansion: (ratio: number) => `${Math.round((ratio - 1) * 100)}% wider than English`,
  },

  typography: {
    overflow: (container: string, over: number) =>
      `The subtitle is ${Math.round(over * 100)}% wider than ${container.replace(/_/g, ' ')}.`,
    clipped: 'The line box is clipping its own descenders. Per-script line height is wrong.',
    fallback: (codepoint: string) =>
      `The font has no glyph for ${codepoint}. On screen it is a blank box, and a reader who does not know the script cannot tell.`,
  },

  audio: {
    heading: 'Nothing plays',
    body: 'There is no audio in this prototype and it has not been faked. This surface exists to judge pronunciation and voice, and a stand-in voice would misrepresent the thing under review.',
    proxy: 'Waveform below is a placeholder shape, not this dub.',
  },

  consent: {
    heading: 'The voice',
    onFile: (name: string, forWhat: string, until: string) =>
      `${name}, granted for ${forWhat}, until ${until}.`,
    missing: (name: string) =>
      `No consent record for ${name}. Nothing about this voice has been cleared, and this tool is not checking.`,
    expired: (name: string, until: string) =>
      `${name}'s consent lapsed on ${until}. It was granted for something else.`,
    scope: (name: string, forWhat: string) =>
      `${name}'s consent covers ${forWhat}. This is not that.`,
    proceed: 'Use it anyway',
    proceeded: (by: string) => `${by} chose to use it anyway`,
    /* No green tick, no "verified", nothing that reads as clearance. */
  },

  review: {
    heading: 'Send it to someone who reads it',
    note: 'One question, one timecode. A reviewer with no context can answer that; "please review" they cannot.',
    question: 'The question',
    send: 'Send it',
    sent: 'with a native reviewer',
    timedOut: (since: string) => `Sent ${since}. No answer yet.`,
    approvedBy: (by: string) => `${by} says it is right`,
    rejectedBy: (by: string) => `${by} sent it back`,
  },

  approve: {
    heading: 'Approving',
    canCheck: 'You read this one. Approving it means you checked it.',
    cannotCheck: 'You do not read this language. Approving it records that you could not check it.',
    approve: 'Approve',
    approveUnverified: 'Approve without checking',
    approved: 'approved',
    publish: 'Publish all nine',
    publishBlocked: (n: number) => `${n} cannot go out yet.`,
    publishConsequence: 'Publishing sends these to customers in a regulated category. A mistranslated exclusion is a legal problem.',
    unverifiedCount: (n: number) =>
      `${n} of these were approved without being checked. The trail says so.`,
  },

  nonfinding: {
    heading: 'Looked for and did not find',
    where: 'Where it looked',
  },

  trail: 'The trail',
} as const;
