/**
 * The outward-facing actions, and the rules a draft has to satisfy.
 *
 * "Outward-facing" is the whole category PRD section 3 rules out doing
 * autonomously: sending, publishing, spending. Everything in this union leaves
 * the machine and cannot be taken back, which is why none of it is executable
 * except through `gate.ts`.
 *
 * The validation here is the same idea as the landing template's build guard
 * and the deck's rules: the things that make a post or an email bad are
 * checkable, so they are checked rather than hoped for. Two of them are not
 * style rules at all - a cold email that does not identify the sender or offer
 * a way out is unlawful under PECR in the UK and the GDPR in the EU, so the
 * draft simply does not pass.
 */

export type Platform = 'x' | 'linkedin' | 'instagram' | 'facebook';

export interface SocialPost {
  kind: 'social_post';
  platform: Platform;
  text: string;
  /** Without the leading hash. */
  hashtags?: string[];
  /** Absolute URL, or a path inside the project's published site. */
  link?: string;
}

export interface ColdEmail {
  kind: 'email';
  to: string;
  to_name?: string;
  subject: string;
  /** Plain text. A cold email that arrives as HTML looks like a mailshot. */
  body: string;
  /** Who it is from, in full. Required: an unidentified sender is unlawful. */
  from_identity: string;
  /** How the recipient stops receiving these. Required, same reason. */
  opt_out: string;
}

export type OutwardAction = SocialPost | ColdEmail;

/** Character ceilings, from each platform's published limits. */
export const PLATFORM_LIMITS: Record<Platform, { chars: number; hashtags: number }> = {
  x: { chars: 280, hashtags: 3 },
  linkedin: { chars: 3_000, hashtags: 5 },
  instagram: { chars: 2_200, hashtags: 10 },
  facebook: { chars: 5_000, hashtags: 5 },
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const FILLER =
  /\b(elevate|seamless|unleash|next-gen|revolutioni[sz]e|cutting-edge|world-class|best-in-class|game-?changer|synerg)/i;
const PLACEHOLDER = /\b(lorem ipsum|acme|jane doe|john doe|\[name\]|\{name\}|your company|xyz)\b/i;
/** The shapes of a claim nobody in the brief authorised. */
const UNBACKED_SUPERLATIVE = /\b(the best|number one|#1|the leading|unrivalled|unbeatable|guaranteed)\b/i;

export function describeAction(action: OutwardAction): string {
  return action.kind === 'social_post' ? `${action.platform} post` : `email to ${action.to}`;
}

/** A one-line summary for the calendar and the approval prompt. */
export function summariseAction(action: OutwardAction): string {
  return action.kind === 'social_post'
    ? action.text.slice(0, 110)
    : `${action.subject} - ${action.body.slice(0, 80)}`;
}

export function validateAction(action: OutwardAction): string[] {
  const problems: string[] = [];

  const checkCopy = (where: string, text: string) => {
    if (text.includes('—')) {
      problems.push(`${where} contains an em dash. Use a period, a comma, or " - ".`);
    }
    const filler = FILLER.exec(text);
    if (filler) problems.push(`${where} contains "${filler[0]}". Say the concrete thing instead.`);

    const placeholder = PLACEHOLDER.exec(text);
    if (placeholder) problems.push(`${where} still contains the placeholder "${placeholder[0]}".`);

    const superlative = UNBACKED_SUPERLATIVE.exec(text);
    if (superlative) {
      problems.push(
        `${where} claims "${superlative[0]}". Do not make a claim the business has not given you evidence for.`,
      );
    }
  };

  if (action.kind === 'social_post') {
    const limits = PLATFORM_LIMITS[action.platform];
    if (!limits) {
      problems.push(
        `unknown platform "${action.platform}". Use one of: ${Object.keys(PLATFORM_LIMITS).join(', ')}.`,
      );
      return problems;
    }

    checkCopy('the post', action.text);
    if (action.text.trim().length < 20) problems.push('the post is too short to say anything.');

    // The link and the hashtags are part of what a platform counts.
    const rendered = renderPost(action);
    if (rendered.length > limits.chars) {
      problems.push(
        `the post is ${rendered.length} characters with its link and hashtags. ` +
          `${action.platform} allows ${limits.chars}.`,
      );
    }

    const tags = action.hashtags ?? [];
    if (tags.length > limits.hashtags) {
      problems.push(
        `${tags.length} hashtags. ${action.platform} posts read as spam above ${limits.hashtags}.`,
      );
    }
    for (const tag of tags) {
      if (/[^a-z0-9]/i.test(tag)) {
        problems.push(`hashtag "${tag}" has characters that will not render as a tag.`);
      }
    }

    if (action.link && !/^https?:\/\//i.test(action.link) && !action.link.startsWith('/')) {
      problems.push(`the link "${action.link}" is neither a URL nor a path on the site.`);
    }
  } else {
    checkCopy('the subject', action.subject);
    checkCopy('the body', action.body);

    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(action.to)) {
      problems.push(`"${action.to}" is not an email address.`);
    }
    if (action.subject.trim().length < 5) problems.push('the subject is empty or nearly so.');
    if (action.subject.length > 70) {
      problems.push(
        `the subject is ${action.subject.length} characters. Over about 60 it is cut off in most inboxes.`,
      );
    }
    if (words(action.body) > 200) {
      problems.push(
        `the body is ${words(action.body)} words. A cold email over about 150 does not get read.`,
      );
    }
    if (words(action.body) < 20) problems.push('the body is too short to be worth sending.');

    // Not style. Sending a marketing email without identifying yourself or
    // offering a way out is unlawful under PECR and the GDPR.
    if (!action.from_identity || words(action.from_identity) < 2) {
      problems.push('from_identity is missing. An unsolicited email has to say who is sending it, by law.');
    }
    if (!action.opt_out || action.opt_out.trim().length < 10) {
      problems.push(
        'opt_out is missing. An unsolicited email has to tell the recipient how to stop receiving them, by law.',
      );
    }
  }

  return problems;
}

/** What actually goes out, link and hashtags included. */
export function renderPost(post: SocialPost): string {
  const parts = [post.text.trim()];
  if (post.link) parts.push(post.link);
  if (post.hashtags?.length) parts.push(post.hashtags.map((t) => `#${t}`).join(' '));
  return parts.join('\n\n');
}

/** What actually goes out, with the two required lines appended. */
export function renderEmail(email: ColdEmail): string {
  return [email.body.trim(), '', email.from_identity.trim(), email.opt_out.trim()].join('\n');
}

/** Parses an action the agent wrote. Returns problems rather than throwing. */
export function parseAction(raw: unknown): { action: OutwardAction } | { problems: string[] } {
  if (typeof raw !== 'object' || raw === null) return { problems: ['each item must be an object.'] };

  const kind = (raw as { kind?: unknown }).kind;
  if (kind !== 'social_post' && kind !== 'email') {
    return { problems: [`kind is "${String(kind)}". Use "social_post" or "email".`] };
  }

  const required =
    kind === 'social_post'
      ? ['platform', 'text']
      : ['to', 'subject', 'body', 'from_identity', 'opt_out'];

  const missing = required.filter((f) => typeof (raw as Record<string, unknown>)[f] !== 'string');
  if (missing.length > 0) {
    return { problems: [`a ${kind} needs: ${missing.join(', ')}.`] };
  }

  const action = raw as OutwardAction;
  const problems = validateAction(action);
  return problems.length > 0 ? { problems } : { action };
}
