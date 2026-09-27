/**
 * The deck model, and the rules a deck has to satisfy to build.
 *
 * A deck is structured data, not markup. That is what lets the same deck render
 * to HTML (and from there to PDF) and to a PPTX with real, editable text boxes,
 * which is what PRD section 6.5 means by "export editable PPTX and PDF". A deck
 * authored as HTML can be printed but not edited; one authored as PPTX cannot
 * be rendered faithfully in a browser. One model, two renderers.
 *
 * `validate` is the same idea as the landing template's build guard: the rules
 * that decide whether a deck is any good are enforced where they cannot be
 * talked past. They are drawn from PPTAgent's PPTEval framework, which scores a
 * deck on Content, Design and Coherence - with the mechanical parts of each
 * turned into assertions and the rest left to the eval's rubric.
 */

import type { PaletteName, TypeName } from '../design/palettes.ts';

export type SlideLayout =
  | 'title'
  | 'statement'
  | 'bullets'
  | 'two-column'
  | 'metrics'
  | 'quote'
  | 'image'
  | 'closing';

export interface DeckImage {
  src: string;
  alt: string;
}

export type Slide =
  | { layout: 'title'; title: string; subtitle?: string }
  | { layout: 'statement'; text: string; note?: string }
  | { layout: 'bullets'; title: string; points: string[] }
  | {
      layout: 'two-column';
      title: string;
      left: { heading: string; body: string };
      right: { heading: string; body: string };
    }
  | {
      layout: 'metrics';
      title: string;
      metrics: Array<{ value: string; label: string; note?: string }>;
    }
  | { layout: 'quote'; quote: string; attribution: string }
  | { layout: 'image'; title?: string; image: DeckImage; caption?: string }
  | { layout: 'closing'; title: string; lines: string[] };

export interface Deck {
  /** Matched to the business so a deck and its website look related. */
  design: { palette: PaletteName; type: TypeName };
  title: string;
  subtitle?: string;
  slides: Slide[];
}

/* ------------------------------------------------------------- validation */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const FILLER =
  /\b(elevate|seamless|unleash|next-gen|revolutioni[sz]e|cutting-edge|world-class|best-in-class|leverage|synerg|paradigm)/i;
const PLACEHOLDER = /\b(lorem ipsum|acme|jane doe|john doe|your company|company name|xyz corp)\b/i;

export const MIN_SLIDES = 5;
export const MAX_SLIDES = 15;
export const MAX_BULLETS = 6;
export const MAX_BULLET_WORDS = 18;
export const MAX_TITLE_CHARS = 60;

/** Every string the audience reads, with a path for the error message. */
function visibleStrings(deck: Deck): Array<[string, string]> {
  const out: Array<[string, string]> = [['title', deck.title]];
  if (deck.subtitle) out.push(['subtitle', deck.subtitle]);

  deck.slides.forEach((slide, i) => {
    const at = `slides[${i}]`;
    switch (slide.layout) {
      case 'title':
        out.push([`${at}.title`, slide.title]);
        if (slide.subtitle) out.push([`${at}.subtitle`, slide.subtitle]);
        break;
      case 'statement':
        out.push([`${at}.text`, slide.text]);
        if (slide.note) out.push([`${at}.note`, slide.note]);
        break;
      case 'bullets':
        out.push([`${at}.title`, slide.title]);
        slide.points.forEach((p, j) => out.push([`${at}.points[${j}]`, p]));
        break;
      case 'two-column':
        out.push(
          [`${at}.title`, slide.title],
          [`${at}.left.heading`, slide.left.heading],
          [`${at}.left.body`, slide.left.body],
          [`${at}.right.heading`, slide.right.heading],
          [`${at}.right.body`, slide.right.body],
        );
        break;
      case 'metrics':
        out.push([`${at}.title`, slide.title]);
        slide.metrics.forEach((m, j) => {
          out.push([`${at}.metrics[${j}].value`, m.value], [`${at}.metrics[${j}].label`, m.label]);
          if (m.note) out.push([`${at}.metrics[${j}].note`, m.note]);
        });
        break;
      case 'quote':
        out.push([`${at}.quote`, slide.quote], [`${at}.attribution`, slide.attribution]);
        break;
      case 'image':
        if (slide.title) out.push([`${at}.title`, slide.title]);
        out.push([`${at}.image.alt`, slide.image.alt]);
        if (slide.caption) out.push([`${at}.caption`, slide.caption]);
        break;
      case 'closing':
        out.push([`${at}.title`, slide.title]);
        slide.lines.forEach((l, j) => out.push([`${at}.lines[${j}]`, l]));
        break;
    }
  });

  return out;
}

export function validate(deck: Deck): string[] {
  const problems: string[] = [];
  const strings = visibleStrings(deck);

  /* --------------------------------------------------------------- content */

  if (deck.slides.length < MIN_SLIDES) {
    problems.push(`the deck has ${deck.slides.length} slides. At least ${MIN_SLIDES}.`);
  }
  if (deck.slides.length > MAX_SLIDES) {
    problems.push(
      `the deck has ${deck.slides.length} slides. At most ${MAX_SLIDES}: past that nobody is listening.`,
    );
  }

  if (deck.slides[0]?.layout !== 'title') {
    problems.push('the first slide must be a `title` slide.');
  }
  if (deck.slides.at(-1)?.layout !== 'closing') {
    problems.push('the last slide must be a `closing` slide, so the deck ends on what happens next.');
  }

  for (const [where, text] of strings) {
    if (text.includes('—')) {
      problems.push(`${where} contains an em dash. Use a period, a comma, or " - ".`);
    }
    const filler = FILLER.exec(text);
    if (filler) problems.push(`${where} contains "${filler[0]}". Say the concrete thing instead.`);

    const placeholder = PLACEHOLDER.exec(text);
    if (placeholder) problems.push(`${where} still contains the placeholder "${placeholder[0]}".`);

    if (/\.(title)$/.test(where.replace(/\[\d+\]/g, '')) && text.length > MAX_TITLE_CHARS) {
      problems.push(`${where} is ${text.length} characters. Max ${MAX_TITLE_CHARS}, or it wraps badly.`);
    }
  }

  deck.slides.forEach((slide, i) => {
    const at = `slides[${i}]`;
    if (slide.layout === 'bullets') {
      if (slide.points.length === 0) problems.push(`${at} has no points.`);
      if (slide.points.length > MAX_BULLETS) {
        problems.push(
          `${at} has ${slide.points.length} points. Max ${MAX_BULLETS}. Split it across two slides.`,
        );
      }
      slide.points.forEach((point, j) => {
        if (words(point) > MAX_BULLET_WORDS) {
          problems.push(
            `${at}.points[${j}] is ${words(point)} words. Max ${MAX_BULLET_WORDS}: a bullet is a line, not a sentence.`,
          );
        }
      });
    }

    if (slide.layout === 'metrics') {
      if (slide.metrics.length < 2 || slide.metrics.length > 4) {
        problems.push(`${at} has ${slide.metrics.length} metrics. Use 2 to 4.`);
      }
      slide.metrics.forEach((m, j) => {
        if (!/\d/.test(m.value)) {
          problems.push(`${at}.metrics[${j}].value is "${m.value}", which has no number in it.`);
        }
      });
    }

    if (slide.layout === 'statement' && words(slide.text) > 25) {
      problems.push(`${at}.text is ${words(slide.text)} words. A statement slide is one thought.`);
    }

    if (slide.layout === 'quote' && words(slide.quote) > 40) {
      problems.push(`${at}.quote is ${words(slide.quote)} words. Trim it to the part that matters.`);
    }

    if (slide.layout === 'image' && (!slide.image.alt || words(slide.image.alt) < 2)) {
      problems.push(`${at}.image needs real alt text.`);
    }
  });

  /* -------------------------------------------------- design and coherence */

  const layouts = deck.slides.map((s) => s.layout);
  const distinct = new Set(layouts);
  if (deck.slides.length >= 6 && distinct.size < 4) {
    problems.push(
      `the deck uses only ${distinct.size} layouts (${[...distinct].join(', ')}). ` +
        'Use at least 4, or every slide looks like the last one.',
    );
  }

  for (let i = 2; i < layouts.length; i += 1) {
    if (layouts[i] === layouts[i - 1] && layouts[i] === layouts[i - 2]) {
      problems.push(
        `slides ${i - 1} to ${i + 1} are all \`${layouts[i]}\`. Three in a row reads as a list, not a deck.`,
      );
      break;
    }
  }

  const bulletSlides = layouts.filter((l) => l === 'bullets').length;
  if (deck.slides.length >= 6 && bulletSlides > deck.slides.length / 2) {
    problems.push(
      `${bulletSlides} of ${deck.slides.length} slides are bullet lists. That is a document, not a deck.`,
    );
  }

  return problems;
}

/**
 * Parse and validate in one step.
 *
 * The deck arrives as JSON the agent wrote, so it is untrusted in the ordinary
 * way: the shape has to be checked before the renderer touches it, or a missing
 * field becomes a stack trace instead of a message the agent can act on.
 */
export function parseDeck(json: string): { deck: Deck } | { problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    return { problems: [`deck.json is not valid JSON: ${(err as Error).message}`] };
  }

  const problems = shapeProblems(raw);
  if (problems.length > 0) return { problems };

  const deck = raw as Deck;
  const rules = validate(deck);
  return rules.length > 0 ? { problems: rules } : { deck };
}

function shapeProblems(raw: unknown): string[] {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) return ['deck.json must be a JSON object.'];

  const deck = raw as Partial<Deck>;
  if (!deck.design?.palette) problems.push('deck.design.palette is missing.');
  if (!deck.design?.type) problems.push('deck.design.type is missing.');
  if (typeof deck.title !== 'string' || !deck.title.trim()) problems.push('deck.title is missing.');
  if (!Array.isArray(deck.slides)) {
    problems.push('deck.slides must be an array.');
    return problems;
  }

  const LAYOUTS: SlideLayout[] = [
    'title', 'statement', 'bullets', 'two-column', 'metrics', 'quote', 'image', 'closing',
  ];

  deck.slides.forEach((slide, i) => {
    const layout = (slide as Slide | undefined)?.layout;
    if (!layout || !LAYOUTS.includes(layout)) {
      problems.push(`slides[${i}].layout is "${layout}". Use one of: ${LAYOUTS.join(', ')}.`);
      return;
    }

    const required: Record<SlideLayout, string[]> = {
      title: ['title'],
      statement: ['text'],
      bullets: ['title', 'points'],
      'two-column': ['title', 'left', 'right'],
      metrics: ['title', 'metrics'],
      quote: ['quote', 'attribution'],
      image: ['image'],
      closing: ['title', 'lines'],
    };

    for (const field of required[layout]) {
      if ((slide as Record<string, unknown>)[field] === undefined) {
        problems.push(`slides[${i}] is a \`${layout}\` slide and needs \`${field}\`.`);
      }
    }
  });

  return problems;
}
