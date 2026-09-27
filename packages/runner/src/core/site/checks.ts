/**
 * The page checks, as they run inside the browser.
 *
 * This file is serialised and evaluated in the page, so it must not import
 * anything and must not reference anything outside its own scope. That is the
 * reason for the shape: one big function that returns plain data.
 *
 * Every check here is a **measurement**, not a judgement. "Is this heading
 * three lines" and "is this text 3.9:1 against its background" are things a
 * browser knows exactly and a vision model guesses at, and they are the ones
 * that decide whether a page is broken. The model's opinion is worth having
 * about whether the page is any *good*, which is a different question and runs
 * separately.
 */

export interface RawCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  blocking: boolean;
}

/** Runs in the page. Returns plain JSON. */
export function pageChecks(viewport: 'desktop' | 'mobile'): RawCheck[] {
  const out: RawCheck[] = [];
  const add = (id: string, label: string, passed: boolean, detail = '', blocking = true) =>
    out.push({ id, label, passed, detail, blocking });

  const isDesktop = viewport === 'desktop';
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  /**
   * How many lines of text an element actually renders.
   *
   * Measured from the range's client rects rather than from height over
   * line-height: a button with vertical padding is taller than one line box
   * while still being one line, and dividing by line-height reports every
   * padded button on the page as wrapped. The rects are grouped by their top
   * edge because an element with inline children returns one rect per child
   * per line.
   */
  const lineCount = (el: Element): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) return 1;
    const tops = new Set(rects.map((r) => Math.round(r.top * 2) / 2));
    return Math.max(1, tops.size);
  };

  /* ----------------------------------------------------------- the basics */

  add(
    'no-horizontal-scroll',
    'No sideways scrolling',
    document.documentElement.scrollWidth <= vw + 1,
    `page is ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport`,
  );

  const title = document.title.trim();
  add('has-title', 'Page has a title', title.length > 5 && title.length < 70, `"${title}"`);

  const description =
    document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
  add(
    'has-description',
    'Page has a meta description',
    description.length > 40 && description.length < 200,
    `${description.length} characters`,
  );

  /* -------------------------------------------------------------- the hero */

  const h1 = document.querySelector('h1');
  if (!h1) {
    add('has-h1', 'Page has one h1', false, 'no h1 on the page');
  } else {
    const h1s = document.querySelectorAll('h1').length;
    add('has-h1', 'Page has exactly one h1', h1s === 1, `${h1s} found`);

    const lines = lineCount(h1);
    const cap = isDesktop ? 2 : 4;
    add(
      'headline-lines',
      `Headline is ${cap} lines or fewer`,
      lines <= cap,
      `${lines} lines at ${vw}px`,
    );

    /*
     * "The hero fits the viewport" is a rule about the *message*, not about
     * the section box. A hero image that runs past the fold is normal and
     * invites the scroll; a headline whose call to action is below the fold is
     * the actual failure. So this measures the copy block - everything from the
     * headline down to and including the first button - and the separate
     * cta-above-fold check covers the button itself.
     */
    const heroSection = h1.closest('section') ?? h1.parentElement!;
    const heroCta = heroSection.querySelector('a[href], button');
    const copyBottom = heroCta
      ? Math.max(h1.getBoundingClientRect().bottom, heroCta.getBoundingClientRect().bottom)
      : heroSection.getBoundingClientRect().bottom;
    add(
      'hero-fits',
      'The hero message fits the first screen',
      copyBottom <= vh + 8,
      `headline and call to action end ${Math.round(copyBottom)}px down in a ${vh}px viewport`,
    );
  }

  /* --------------------------------------------------------------- the CTA */

  const buttons = [...document.querySelectorAll('a[href], button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const primary = buttons.find((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  });

  if (primary) {
    add(
      'cta-above-fold',
      'A call to action is visible without scrolling',
      primary.getBoundingClientRect().top < vh,
      `first solid button is ${Math.round(primary.getBoundingClientRect().top)}px down`,
    );
  } else {
    add('cta-above-fold', 'A call to action is visible without scrolling', false, 'no solid button found');
  }

  const wrapped = buttons.filter((el) => lineCount(el) > 1);
  add(
    'cta-single-line',
    'No button label wraps',
    wrapped.length === 0,
    wrapped.map((el) => `"${el.textContent?.trim().slice(0, 30)}"`).join(', '),
  );

  // One label per intent. Two buttons that mean "contact us" worded differently
  // is the single most common tell in a generated page.
  const INTENTS: Array<[string, RegExp]> = [
    ['contact', /get in touch|contact|let'?s talk|reach out|start a project|say hello|enquire|enquiry/i],
    ['book', /book|schedule|arrange|make an appointment/i],
    ['quote', /get a quote|free quote|request a quote|pricing/i],
  ];
  const labels = [...new Set(buttons.map((b) => b.textContent?.trim() ?? '').filter(Boolean))];
  const duplicates: string[] = [];
  for (const [intent, re] of INTENTS) {
    const matching = [...new Set(labels.filter((l) => re.test(l)))];
    if (matching.length > 1) duplicates.push(`${intent}: ${matching.join(' / ')}`);
  }
  add('one-label-per-intent', 'One call to action, one label', duplicates.length === 0, duplicates.join('; '));

  /* ------------------------------------------------------------- the nav */

  const nav = document.querySelector('header nav, nav');
  if (nav && isDesktop) {
    const height = nav.getBoundingClientRect().height;
    add('nav-height', 'Navigation is one line', height <= 80, `${Math.round(height)}px tall`);
  }

  /* -------------------------------------------------- copy and AI tells */

  const visible = (document.body.innerText ?? '').replace(/\s+/g, ' ');

  const emDashes = (visible.match(/—/g) ?? []).length;
  add('no-em-dash', 'No em dashes in the copy', emDashes === 0, `${emDashes} found`);

  // The eyebrow rule, measured rather than eyeballed: small uppercase
  // wide-tracked labels sitting above a heading.
  const sections = document.querySelectorAll('section').length || 1;
  const eyebrows = [...document.querySelectorAll('section *')].filter((el) => {
    if (el.children.length > 0) return false;
    const text = el.textContent?.trim() ?? '';
    if (!text || text.length > 40) return false;
    const s = getComputedStyle(el);
    return (
      s.textTransform === 'uppercase' &&
      parseFloat(s.fontSize) <= 14 &&
      parseFloat(s.letterSpacing) > 0.5
    );
  }).length;
  const eyebrowCap = Math.ceil(sections / 3);
  add(
    'eyebrow-restraint',
    'Not an uppercase label above every section',
    eyebrows <= eyebrowCap,
    `${eyebrows} eyebrow-style labels across ${sections} sections (cap ${eyebrowCap})`,
  );

  const FILLER = /\b(elevate|seamless|unleash|next-gen|revolutioni[sz]e|cutting-edge|world-class|best-in-class|synerg)/i;
  const filler = FILLER.exec(visible);
  add('no-filler-verbs', 'No filler marketing verbs', filler === null, filler ? `"${filler[0]}"` : '');

  const PLACEHOLDER = /\b(lorem ipsum|acme|jane doe|john doe|your business here|company name)\b/i;
  const placeholder = PLACEHOLDER.exec(visible);
  add(
    'no-placeholders',
    'No placeholder copy left in',
    placeholder === null,
    placeholder ? `"${placeholder[0]}"` : '',
  );

  /* ----------------------------------------------------------- the images */

  const images = [...document.querySelectorAll('img')];
  add('has-images', 'The page uses real images', images.length >= 3, `${images.length} images`);

  const noAlt = images.filter((img) => !img.getAttribute('alt')?.trim());
  add('images-have-alt', 'Every image has alt text', noAlt.length === 0, `${noAlt.length} without`);

  const noDimensions = images.filter((img) => !img.getAttribute('width') || !img.getAttribute('height'));
  add(
    'images-have-dimensions',
    'Images reserve their space',
    noDimensions.length === 0,
    `${noDimensions.length} without width and height, which makes the page jump as it loads`,
  );

  const broken = images.filter((img) => img.complete && img.naturalWidth === 0);
  add('images-load', 'Images actually load', broken.length === 0, `${broken.length} broken`, false);

  /* ---------------------------------------------------------- the contrast */

  const parseRgb = (value: string): [number, number, number, number] | null => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(',').map((p) => parseFloat(p));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };

  const effectiveBackground = (el: Element): [number, number, number] => {
    let node: Element | null = el;
    while (node) {
      const rgb = parseRgb(getComputedStyle(node).backgroundColor);
      if (rgb && rgb[3] > 0.5) return [rgb[0], rgb[1], rgb[2]];
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  const luminance = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const ratio = (a: [number, number, number], b: [number, number, number]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const textNodes = [...document.querySelectorAll('p, li, a, button, span, dd, dt, summary, figcaption, label')]
    .filter((el) => (el.textContent?.trim().length ?? 0) > 3 && el.children.length === 0)
    .slice(0, 120);

  const lowContrast: string[] = [];
  for (const el of textNodes) {
    const style = getComputedStyle(el);
    const fg = parseRgb(style.color);
    if (!fg) continue;
    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    // WCAG AA: 3:1 for large text (18pt / 24px, or 14pt bold), 4.5:1 otherwise.
    const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const r = ratio([fg[0], fg[1], fg[2]], effectiveBackground(el));
    if (r < required) {
      lowContrast.push(`"${el.textContent?.trim().slice(0, 28)}" ${r.toFixed(1)}:1`);
    }
  }
  add(
    'text-contrast',
    'Text meets WCAG AA contrast',
    lowContrast.length === 0,
    lowContrast.slice(0, 4).join('; '),
  );

  /* -------------------------------------------------------- tap targets */

  if (!isDesktop) {
    const small = buttons.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height < 40 && (el.textContent?.trim().length ?? 0) > 0;
    });
    add(
      'tap-targets',
      'Tappable things are big enough on a phone',
      small.length === 0,
      `${small.length} under 40px tall`,
      false,
    );
  }

  return out;
}
