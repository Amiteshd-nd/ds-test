/**
 * Every string a visitor or subscriber can read lives here.
 *
 * Rendered copy avoids em-dashes on purpose (repo design rule, see
 * .claude/skills/taste-skill). Use a period, comma, or colon instead.
 */

/** Placeholder product name. Change it here and everywhere follows. */
const productName = 'Plinth';
/** Shown in the footer mailto link and the email's contact line. */
const contactEmail = 'hello@plinth.example';

export const content = {
  productName,
  contactEmail,

  meta: {
    title: `${productName}: describe a building, get the drawings`,
    description:
      `${productName} turns a sentence into editable CAD, plans, sections and schedules, and puts you in a room with the architects, engineers and builders who make them real. Leave your email and we will write once, when we open.`,
  },

  header: {
    /** Quiet status at the right of the header. It is a launch page, so saying so is honest. */
    status: 'Waitlist open',
    contact: 'Contact',
  },

  hero: {
    /** Small mono line above the headline. */
    eyebrow: 'Prompt to CAD, and the people who build',
    /** Three parts so the middle one can be set in italic. */
    headline: {
      before: 'Describe the building. ',
      italic: 'The drawings follow.',
      after: '',
    },
    /** One sentence under the headline. */
    lede: 'A sentence in, editable plans, sections and schedules out. And a room full of the architects, engineers and builders who make them real.',
    /** Alt text for the framed render. */
    imageAlt:
      'A cream 1980s computer on top of a grassy hill under a pale sky, its screen showing a hand-drafted floor plan.',
  },

  form: {
    label: 'Email address',
    placeholder: 'you@studio.com',
    submit: 'Notify me',
    pending: 'Sending',
    support: 'Be first in when we open the doors. No spam, one email at launch.',
    invalid: 'That does not look like an email address.',
    success: 'Check your inbox. We just sent you a note.',
    error: 'Something went wrong. Try again in a minute.',
  },

  teaser: {
    /**
     * The teaser film, rendered by packages/teaser (out/teaser-1080p.mp4, copied
     * here). To replace it, drop the new file in public/teaser/ and update `src`,
     * `poster` and `duration`. `isPlaceholder` adds a "Placeholder" tag.
     */
    src: '/teaser/plinth-teaser.mp4',
    type: 'video/mp4',
    poster: '/teaser/poster.jpg',
    isPlaceholder: false,
    label: 'Watch the teaser',
    duration: '1:25',
    /** Mono caption in the frame's title block (iteration 1). */
    caption: 'First look',
    dialogTitle: `${productName}, a first look`,
    close: 'Close video',
    placeholderTag: 'Placeholder',
  },


  footer: {
    contact: 'Contact',
  },

  email: {
    subject: 'You’re on the list',
    preview: 'Thanks for signing up. We will write once, when we open.',
    heading: 'You’re on the list',
    thanks: 'Thanks for signing up early.',
    pitch:
      `${productName} turns a sentence into editable CAD, plans, sections and schedules, and puts you in a room with the architects, engineers and builders who make them real.`,
    promise: 'We’ll email you once when we open. That’s it.',
    footer:
      `Did not sign up, or want off the list? Reply to this email, or write to ${contactEmail}, and we will remove you.`,
  },
} as const;
