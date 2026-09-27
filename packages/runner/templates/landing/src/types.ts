/**
 * The shape of a site.
 *
 * Two things are enforced by this type rather than by hoping the agent reads
 * the rules:
 *
 * - **One CTA per intent.** There is a single `cta` at the top level, used by
 *   the nav, the hero and the footer. "Get in touch" in the nav and "Let's
 *   talk" in the hero is the single most common tell in generated pages, and
 *   here it is not expressible.
 * - **No eyebrows.** There is no field for the small uppercase label above a
 *   section headline, because every AI-built page puts one above every section
 *   and the rhythm gives it away immediately.
 *
 * Everything else that cannot be a type is a build-time assertion in `guard.ts`.
 */

export type Palette = 'forest' | 'cobalt' | 'terracotta' | 'olive' | 'ink' | 'signal';
export type TypePairing = 'grotesk' | 'warm' | 'character' | 'heritage';
export type HeroRhythm = 'split' | 'offset' | 'frame';
export type RadiusSystem = 'sharp' | 'soft' | 'pill';

export interface Design {
  palette: Palette;
  type: TypePairing;
  /** How the hero composes. Never centered: a centered hero is the default nobody chose. */
  rhythm: HeroRhythm;
  /** Locked for the whole page. Mixing radii is broken design, not variety. */
  radius: RadiusSystem;
}

export interface Link {
  label: string;
  href: string;
}

export interface Image {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Site {
  design: Design;

  meta: {
    title: string;
    description: string;
  };

  brand: {
    name: string;
    /** One line under the wordmark in the footer. Not a slogan. */
    tagline: string;
  };

  /** The one call to action on the page. Nav, hero and footer all use it. */
  cta: Link;

  nav: {
    links: Link[];
  };

  hero: {
    /** Max 52 characters. Two lines at desktop is the real rule; this is the proxy. */
    headline: string;
    /** Max 20 words. If the value prop needs more, it is not clear yet. */
    subtext: string;
    image: Image;
  };

  /** Sits under the hero, never inside it. Facts, not logos. */
  proof: Array<{ label: string; detail: string }>;

  offer: {
    heading: string;
    /** Two to five. Never rendered as three equal cards. */
    services: Array<{ title: string; body: string }>;
  };

  process: {
    heading: string;
    steps: Array<{ title: string; body: string }>;
  };

  work: {
    heading: string;
    items: Array<{ title: string; place: string; image: Image }>;
  };

  questions: {
    heading: string;
    items: Array<{ q: string; a: string }>;
  };

  contact: {
    heading: string;
    body: string;
    email: string;
    phone: string;
    area: string;
    hours: string;
  };
}
