/**
 * The business profile: what the owner says once and no agent asks again.
 *
 * This is PRD section 3's second goal ("every later task reuses stored business
 * context without re-asking") and section 6.6's source of truth. The table is
 * fixed by section 8, so the two JSON columns carry the fields that do not have
 * one of their own. The shapes are here rather than inline so that "what is in
 * brand_json" has one answer.
 *
 * Everything is optional. A profile half-filled is normal and useful; a flow
 * that refuses to continue without a VAT number is not.
 */

import type { BusinessProfile } from '../types.ts';

/** `brand_json`: the things that describe the business itself. */
export interface BrandFacts {
  /** Where they work. "Bristol and Bath", "nationwide", "within 20 miles of Leeds". */
  area?: string;
  /** "Monday to Friday, 8am to 6pm". */
  hours?: string;
  /** A year, as the owner said it. "2011", "since 1978". */
  since?: string;
  /** Qualifications, memberships, insurance. Only ever what the owner stated. */
  credentials?: string;
  /** The answer to "why you and not the firm down the road". */
  differentiator?: string;
}

/** `links_json`: how to reach them, and anything already online. */
export interface ContactLinks {
  email?: string;
  phone?: string;
  website?: string;
  social?: string[];
}

export function brandFacts(profile: BusinessProfile | null | undefined): BrandFacts {
  return parse<BrandFacts>(profile?.brand_json);
}

export function contactLinks(profile: BusinessProfile | null | undefined): ContactLinks {
  return parse<ContactLinks>(profile?.links_json);
}

function parse<T>(json: string | null | undefined): T {
  if (!json) return {} as T;
  try {
    return JSON.parse(json) as T;
  } catch {
    // A malformed blob is a bug somewhere upstream, but losing the whole
    // profile over it would be worse than losing one field.
    return {} as T;
  }
}

/** True once there is enough to attempt a page without guessing. */
export function isUsable(profile: BusinessProfile | null | undefined): boolean {
  return Boolean(profile?.name && profile?.offer && profile?.audience);
}

/**
 * The interview.
 *
 * Six questions, fixed, asked by the UI rather than by a model. PRD section 9
 * says "onboarding interview (5-7 questions)"; a model-driven one would cost a
 * call per answer, take longer, and can drift off the fields it is supposed to
 * fill. A form fills them every time, for nothing, and the owner can see how
 * many are left. Where a model does earn its place is the gaps afterwards, and
 * the orchestrator still has `ask_user` for those.
 *
 * The questions are written the way a person would ask them out loud.
 */
export type ProfileField =
  | 'name'
  | 'offer'
  | 'audience'
  | 'tone'
  | 'area'
  | 'hours'
  | 'since'
  | 'credentials'
  | 'differentiator'
  | 'email'
  | 'phone'
  | 'website';

export interface InterviewInput {
  field: ProfileField;
  label: string;
  placeholder: string;
  multiline?: boolean;
  optional?: boolean;
  /** Offered as one-tap answers. The owner can still type their own. */
  suggestions?: string[];
}

export interface InterviewStep {
  id: string;
  question: string;
  /** Shown under the question. Says why it is being asked. */
  help: string;
  inputs: InterviewInput[];
}

/**
 * Six steps. Each input maps to exactly one field, so nothing has to be parsed
 * out of a sentence afterwards - a step that asks two things asks them in two
 * boxes.
 */
export const INTERVIEW: InterviewStep[] = [
  {
    id: 'identity',
    question: 'What is the business called, and what do you do?',
    help: 'Say it the way you would to someone at a bus stop.',
    inputs: [
      { field: 'name', label: 'Business name', placeholder: 'Halstead & Rowe' },
      {
        field: 'offer',
        label: 'What you do',
        placeholder:
          'Damp and timber surveys on old houses, mostly for people about to buy one.',
        multiline: true,
      },
    ],
  },
  {
    id: 'audience',
    question: 'Who are your customers, and where are they?',
    help: 'Both matter. A page for homeowners in one city reads nothing like a page for developers nationwide.',
    inputs: [
      {
        field: 'audience',
        label: 'Who you work for',
        placeholder: 'Homeowners and buying agents, usually mid purchase.',
        multiline: true,
      },
      { field: 'area', label: 'Where you work', placeholder: 'Bristol, Bath and north Somerset' },
    ],
  },
  {
    id: 'differentiator',
    question: 'Why should someone pick you over the firm down the road?',
    help: 'The real reason, not the brochure one. This usually becomes the headline.',
    inputs: [
      {
        field: 'differentiator',
        label: 'What makes you different',
        placeholder:
          'We do not do the remedial work, so we have nothing to gain from saying you need it.',
        multiline: true,
      },
    ],
  },
  {
    id: 'credibility',
    question: 'How long have you been doing this, and are you accredited?',
    help: 'Only things that are true. Anything you leave blank stays off the page rather than being invented.',
    inputs: [
      { field: 'since', label: 'Trading since', placeholder: '2011', optional: true },
      {
        field: 'credentials',
        label: 'Qualifications or memberships',
        placeholder: 'RICS members, registered with the PCA',
        optional: true,
      },
    ],
  },
  {
    id: 'tone',
    question: 'How should the page sound?',
    help: 'Pick the closest, or write your own.',
    inputs: [
      {
        field: 'tone',
        label: 'Tone',
        placeholder: 'Plain and direct. No sales language.',
        multiline: true,
        suggestions: [
          'Plain and direct. No sales language.',
          'Warm and personal. It is a small team and it should feel like it.',
          'Calm and reassuring. People arrive here worried.',
          'Precise and technical. The customers know the subject.',
        ],
      },
    ],
  },
  {
    id: 'contact',
    question: 'How do people get hold of you?',
    help: 'Email and phone go on the page. Hours tell people when it is worth calling.',
    inputs: [
      { field: 'email', label: 'Email', placeholder: 'hello@halsteadrowe.co.uk' },
      { field: 'phone', label: 'Phone', placeholder: '0117 214 8830' },
      {
        field: 'hours',
        label: 'Hours',
        placeholder: 'Monday to Friday, 8am to 6pm',
        optional: true,
      },
    ],
  },
];

/** Which column each field lives in, so the API does not have to guess. */
export const FIELD_LOCATION: Record<ProfileField, 'column' | 'brand_json' | 'links_json'> = {
  name: 'column',
  offer: 'column',
  audience: 'column',
  tone: 'column',
  area: 'brand_json',
  hours: 'brand_json',
  since: 'brand_json',
  credentials: 'brand_json',
  differentiator: 'brand_json',
  email: 'links_json',
  phone: 'links_json',
  website: 'links_json',
};

export const INTERVIEW_FIELDS: ProfileField[] = INTERVIEW.flatMap((step) =>
  step.inputs.map((input) => input.field),
);

/**
 * Turn a profile into the brief the web builder gets.
 *
 * The builder cannot see the conversation or the database (PRD section 6.1,
 * adopt 7), so this is the whole of what it knows. Fields the owner left blank
 * are omitted rather than filled with a placeholder: a blank the builder can
 * see is a blank it writes around, and a placeholder is a fact it will print.
 */
export function profileBrief(profile: BusinessProfile | null | undefined): string {
  if (!profile) return '';
  const brand = brandFacts(profile);
  const links = contactLinks(profile);

  const lines: string[] = [];
  const say = (label: string, value: string | undefined | null) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  say('Business', profile.name);
  say('What they do', profile.offer);
  say('Customers', profile.audience);
  say('Area covered', brand.area);
  say('Why them and not a competitor', brand.differentiator);
  say('Trading since', brand.since);
  say('Accreditations', brand.credentials);
  say('How the page should sound', profile.tone);
  say('Email', links.email);
  say('Phone', links.phone);
  say('Hours', brand.hours);
  say('Existing website', links.website);

  if (lines.length === 0) return '';

  return [
    ...lines,
    '',
    'Only what is listed above is known to be true. Do not add review counts, client names, ' +
      'staff numbers, awards or certifications that are not here.',
  ].join('\n');
}

/**
 * Everything known about the business, as one block of text.
 *
 * The profile plus whatever the owner has confirmed since. This is what PRD
 * section 3's second goal actually means: "every later task reuses stored
 * business context without re-asking". Unconfirmed memories are absent by
 * construction, because `recall` does not return them.
 */
export async function businessBrief(
  profile: BusinessProfile | null | undefined,
  memories: Array<{ text: string }>,
): Promise<string> {
  const base = profileBrief(profile);
  if (memories.length === 0) return base;

  const facts = ['## Also known about this business', ...memories.map((m) => `- ${m.text}`)];

  if (!base) {
    return [...facts, '', 'Nothing else is known. Do not invent the rest.'].join('\n');
  }

  // The "do not invent" line belongs at the end, after everything it governs.
  const [body, caution] = splitCaution(base);
  return [body, '', ...facts, '', caution].join('\n');
}

function splitCaution(brief: string): [string, string] {
  const marker = brief.indexOf('Only what is listed above');
  if (marker === -1) return [brief, ''];
  return [brief.slice(0, marker).trimEnd(), brief.slice(marker).trim()];
}
