/**
 * Every user-facing string on the doc surface. Kavitha's words, not the system's:
 * "sent back" rather than "validation failure", "looked at" rather than "reviewed",
 * "couldn't read it" rather than "OCR failure".
 *
 * Two of these are load-bearing and shouldn't be softened without thinking:
 * `accept.partialWarning` has to be honest about what she didn't check without
 * implying she did something wrong, and `band.*` never contains a number.
 */
export const copy = {
  surface: {
    name: 'Nirvaha',
    role: 'Doc Agents',
    tagline: 'Reviewing what an agent read out of a document you did not.',
  },

  head: {
    fields: (n: number) => `${n} fields`,
    lookedAt: (checked: number, total: number) => `${checked} of ${total} looked at`,
    needsEyes: (n: number) => (n === 1 ? '1 needs your eyes' : `${n} need your eyes`),
    clear: 'Nothing left that needs your eyes',
    start: 'Read the document',
    rereading: 'Read it again',
    stop: 'Stop',
    ttft: (ms: number) => `First value in ${(ms / 1000).toFixed(1)}s`,
  },

  /* Three bands, no percentages, ever. The words carry the band; the treatment
     carries it a second time; the behaviour carries it a third. */
  band: {
    committed: 'read clearly',
    check: 'check this',
    failed: "couldn't read it",
  },

  origin: {
    extracted: 'read from the document',
    inferred: 'worked out from other values',
    inferredShort: 'worked out',
  },

  medium: {
    handwriting: 'hand-filled',
    print: 'printed',
  },

  field: {
    unreviewed: 'not looked at',
    reviewed: 'you agreed',
    corrected: 'you changed it',
    lookedAndAgreed: 'This is right',
    change: 'Change it',
    cancel: 'Leave it',
    typeYourOwn: 'Type it yourself',
    save: 'Save',
    alternates: 'What else it might say',
    noAlternates: 'It has nothing else to offer. Type it or send the document back.',
    exhausted: 'Two tries on this field. Send it back rather than guessing a third time.',
    was: 'was',
    correctedBy: (by: string) => `changed by ${by}`,
  },

  conflict: {
    heading: 'Two sources, two answers',
    note: 'Neither is a misread. One of these documents is out of date, and choosing which is your call.',
    pick: 'Use this one',
    chosen: 'you chose this',
  },

  confusable: {
    heading: 'One mark, two readings',
    note: 'The model is confident about what it saw and the mark itself is ambiguous. Those are different problems, and only looking at it solves this one.',
    reading: (glyph: string) => `reads as ${glyph}`,
  },

  struck: {
    heading: 'Crossed out on the form',
    note: 'Both values are on the paper. The struck one is evidence too — the auditor may want to know it was changed.',
    void: 'crossed out',
    current: 'written instead',
  },

  range: {
    heading: 'Read correctly, and impossible',
    note: 'No confidence score catches this one: the reading was right and the value cannot be true.',
  },

  nonfinding: {
    heading: 'Looked for and did not find',
    absent: 'Not in the document',
    illegible: 'On the page, unreadable',
    inaccessible: 'Could not open it',
    ambiguous: 'Could not tell',
    where: 'Where it looked',
    nextAbsent: 'Ask the applicant for it',
    nextIllegible: 'Ask for a clearer scan',
  },

  systematic: {
    heading: 'This is not just this document',
    body: (field: string, n: number, type: string) =>
      `The same field — ${field} — has been corrected on ${n} documents of this type (${type}).`,
    note: 'Fixing it here fixes one document. Someone should look at the extraction rule.',
    flag: 'Flag the rule',
    dismiss: 'Not now',
  },

  source: {
    none: 'No document',
    unreadable: 'unreadable on the page',
    showing: (field: string, page: number) => `Showing where ${field} was read, page ${page}`,
    notOnPage: (page: number) => `That value is not on page ${page}`,
    pageOnly: 'It knows the page this came from, not the exact place on it.',
    noProvenance: 'No location for this value. It may still be right — but you cannot check it here.',
    /* A conflict is not a missing location: it is two locations, in two documents
       that are not this one. Saying "no location" there would be a lie of omission. */
    elsewhere: (sources: string[]) =>
      `Both readings come from other documents — ${sources.join(' and ')} — not from this form.`,
    degraded: (kinds: string[]) =>
      `This is a ${kinds.join(' and ')} scan. Highlighting still works; reading it may not.`,
  },

  accept: {
    heading: 'What happens when you accept',
    /* The count comes from the state. A hardcoded number here was wrong the moment
       the field list changed, and a wrong number in the sentence that describes a
       credit decision is the worst place in the surface to be sloppy. */
    consequence: (n: number) =>
      `Accepting these ${n} values sends them into the credit decision. Nobody reads them again.`,
    blocked: (n: number) =>
      `${n} field${n > 1 ? 's' : ''} still need your eyes. These cannot be cleared in bulk.`,
    bulk: (n: number) => `Agree with ${n} clearly-read field${n > 1 ? 's' : ''}`,
    accept: 'Accept',
    accepted: 'Accepted',
    partialWarning: (checked: number, total: number) =>
      `You looked at ${checked} of ${total}. The rest were read clearly and go in as they are — the trail records exactly that.`,
    reject: 'Send it back',
    rejected: 'Sent back',
    escalate: 'Escalate',
    escalated: 'Escalated',
    trail: 'The trail',
  },

  exportPanel: {
    heading: 'Where this goes next',
    note: 'The format decides what survives. Pick by what happens to the file, not by habit.',
    lossless: 'keeps everything',
    loses: 'drops',
    blocked: 'Not yet',
    pick: 'Export',
  },

  scriptFallback: {
    heading: 'A glyph did not render',
    body: (lang: string, codepoint: string) =>
      `The font has no mark for ${codepoint} in ${lang}. On screen it is a blank box, and someone who does not read the script cannot tell.`,
  },
} as const;
