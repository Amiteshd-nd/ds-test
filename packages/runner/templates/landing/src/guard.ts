/**
 * Build-time assertions on the content.
 *
 * These run inside `astro build`, so a violation is a failed build that the
 * agent has to fix before it can preview or deploy anything. That is the whole
 * idea: a design rule written only in a prompt is a suggestion, and a design
 * rule that fails the build is a rule.
 *
 * Every check here corresponds to a specific failure that shows up in
 * AI-generated landing pages. The message says what to do, not just what is
 * wrong, because the thing reading it is going to try to fix it.
 */

import type { Site } from './types';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Every string a visitor can read. */
function visibleStrings(site: Site): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['meta.title', site.meta.title],
    ['meta.description', site.meta.description],
    ['brand.name', site.brand.name],
    ['brand.tagline', site.brand.tagline],
    ['cta.label', site.cta.label],
    ['hero.headline', site.hero.headline],
    ['hero.subtext', site.hero.subtext],
    ['hero.image.alt', site.hero.image.alt],
    ['offer.heading', site.offer.heading],
    ['process.heading', site.process.heading],
    ['work.heading', site.work.heading],
    ['questions.heading', site.questions.heading],
    ['contact.heading', site.contact.heading],
    ['contact.body', site.contact.body],
    ['contact.area', site.contact.area],
    ['contact.hours', site.contact.hours],
  ];
  site.nav.links.forEach((l, i) => out.push([`nav.links[${i}].label`, l.label]));
  site.proof.forEach((p, i) => {
    out.push([`proof[${i}].label`, p.label], [`proof[${i}].detail`, p.detail]);
  });
  site.offer.services.forEach((s, i) => {
    out.push([`offer.services[${i}].title`, s.title], [`offer.services[${i}].body`, s.body]);
  });
  site.process.steps.forEach((s, i) => {
    out.push([`process.steps[${i}].title`, s.title], [`process.steps[${i}].body`, s.body]);
  });
  site.work.items.forEach((w, i) => {
    out.push(
      [`work.items[${i}].title`, w.title],
      [`work.items[${i}].place`, w.place],
      [`work.items[${i}].image.alt`, w.image.alt],
    );
  });
  site.questions.items.forEach((q, i) => {
    out.push([`questions.items[${i}].q`, q.q], [`questions.items[${i}].a`, q.a]);
  });
  return out;
}

/** Phrases that mean the copy was generated and never read back. */
const FILLER = [
  'elevate',
  'seamless',
  'unleash',
  'next-gen',
  'revolutionize',
  'revolutionise',
  'cutting-edge',
  'world-class',
  'best-in-class',
  'take it to the next level',
  'lorem ipsum',
];

const PLACEHOLDER_NAMES = ['acme', 'jane doe', 'john doe', 'your business', 'company name'];

export function assertSite(site: Site): Site {
  const problems: string[] = [];
  const strings = visibleStrings(site);

  // The em-dash ban. Zero, anywhere a visitor can see, including alt text.
  for (const [where, text] of strings) {
    if (text.includes('—')) {
      problems.push(`${where} contains an em dash. Use a period, a comma, parentheses, or " - ".`);
    }
    if (/ – /.test(text)) {
      problems.push(`${where} uses an en dash as a separator. Use a period, a comma, or " - ".`);
    }
  }

  for (const [where, text] of strings) {
    const lower = text.toLowerCase();
    for (const filler of FILLER) {
      if (lower.includes(filler)) {
        problems.push(`${where} contains "${filler}". Say the concrete thing instead.`);
      }
    }
    for (const name of PLACEHOLDER_NAMES) {
      if (lower.includes(name)) {
        problems.push(`${where} still contains the placeholder "${name}".`);
      }
    }
  }

  // The hero is one moment, not a feature list.
  // Characters, not words. The hard rule is two lines at desktop, and a
  // ten-word headline of short words fits on two lines while a six-word one of
  // long words does not. 52 is what the narrowest rhythm's column measured out
  // at, at the size that rhythm uses.
  if (site.hero.headline.length > 52) {
    problems.push(
      `hero.headline is ${site.hero.headline.length} characters. Max 52, or it wraps to a third line at desktop.`,
    );
  }
  if (words(site.hero.subtext) > 20) {
    problems.push(
      `hero.subtext is ${words(site.hero.subtext)} words. Max 20. If the offer needs more, it is not clear yet.`,
    );
  }
  if (words(site.cta.label) > 3) {
    problems.push(`cta.label is ${words(site.cta.label)} words. Max 3, or the button wraps at desktop.`);
  }

  // A single-line nav at desktop. More than five items is a second line.
  if (site.nav.links.length > 5) {
    problems.push(`nav.links has ${site.nav.links.length} items. Max 5, or the nav wraps at desktop.`);
  }

  if (site.offer.services.length < 2 || site.offer.services.length > 5) {
    problems.push(`offer.services has ${site.offer.services.length} items. Use 2 to 5.`);
  }
  if (site.process.steps.length < 3 || site.process.steps.length > 5) {
    problems.push(`process.steps has ${site.process.steps.length} items. Use 3 to 5.`);
  }
  if (site.questions.items.length < 3) {
    problems.push('questions.items needs at least 3. Fewer reads as an afterthought.');
  }

  // Sub-paragraphs stay short. 25 words is roughly three lines at body size.
  for (const [where, text] of strings) {
    if (/\.(body|a|detail)$/.test(where.replace(/\[\d+\]/g, '')) && words(text) > 45) {
      problems.push(`${where} is ${words(text)} words. Keep body copy under about 45.`);
    }
  }

  // Real images, with dimensions, so nothing shifts while the page loads.
  const images = [site.hero.image, ...site.work.items.map((w) => w.image)];
  if (images.length < 3) {
    problems.push('The page needs at least 3 real images. A pure-text page is not minimalism.');
  }
  for (const image of images) {
    if (!image.width || !image.height) {
      problems.push(`image ${image.src} has no width/height. Without both the page shifts as it loads.`);
    }
    if (!image.alt || words(image.alt) < 2) {
      problems.push(`image ${image.src} needs real alt text.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `The content in src/site.ts breaks ${problems.length} rule${problems.length === 1 ? '' : 's'}:\n\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nFix src/site.ts and build again. These are build errors, not warnings.\n',
    );
  }

  return site;
}
