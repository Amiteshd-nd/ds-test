/**
 * A deck, as HTML.
 *
 * One 1280x720 section per slide, self contained, no network. Playwright turns
 * it into the PDF and into the screenshots the checks measure, so it has to
 * render identically without a server and without a font CDN: the fonts are
 * read out of the landing template's `node_modules` and inlined as data URLs.
 *
 * Inlining them is what makes a deck and a website look like the same business
 * rather than two things that happened to pick the same accent colour.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { PALETTES, TYPE_PAIRINGS } from '../design/palettes.ts';
import type { Deck, Slide } from './deck.ts';

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

/** Which fontsource package backs each pairing, for inlining. */
const FONT_PACKAGES: Record<string, string[]> = {
  grotesk: ['space-grotesk', 'archivo'],
  warm: ['outfit', 'instrument-sans'],
  character: ['bricolage-grotesque', 'archivo'],
  heritage: ['eb-garamond', 'archivo'],
};

async function inlineFonts(type: string): Promise<string> {
  const root = path.join(process.cwd(), 'templates', 'landing', 'node_modules', '@fontsource-variable');
  const faces: string[] = [];

  for (const pkg of FONT_PACKAGES[type] ?? []) {
    // The latin subset only. A deck does not need Vietnamese, and each extra
    // subset is another 40KB inlined into every render.
    const file = path.join(root, pkg, 'files', `${pkg}-latin-wght-normal.woff2`);
    if (!existsSync(file)) continue;

    const data = (await readFile(file)).toString('base64');
    const family = pkg
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');

    faces.push(
      `@font-face{font-family:'${family} Variable';font-style:normal;` +
        `font-display:block;font-weight:100 900;` +
        `src:url(data:font/woff2;base64,${data}) format('woff2-variations');}`,
    );
  }

  return faces.join('\n');
}

const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function renderDeck(deck: Deck): Promise<string> {
  const palette = PALETTES[deck.design.palette] ?? PALETTES.forest;
  const type = TYPE_PAIRINGS[deck.design.type] ?? TYPE_PAIRINGS.grotesk;
  const fonts = await inlineFonts(deck.design.type);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(deck.title)}</title>
<style>
${fonts}
:root{
  --bg:${palette.bg}; --surface:${palette.surface}; --ink:${palette.ink};
  --muted:${palette.muted}; --line:${palette.line};
  --accent:${palette.accent}; --on-accent:${palette.onAccent};
  --display:${type.display}; --body:${type.body};
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#111;font-family:var(--body);color:var(--ink)}

/* Exactly one slide per printed page, at the slide's own size. Any margin here
   and the PDF gains a white border that is not in the design. */
@page{size:${SLIDE_WIDTH}px ${SLIDE_HEIGHT}px;margin:0}

.slide{
  position:relative;
  width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;
  padding:72px 88px 108px;
  background:var(--bg);
  display:flex;flex-direction:column;
  /* Content sits in the optical middle rather than piling up at the top. A
     slide with four lines and half a screen of nothing under them reads as
     unfinished, not as restraint. */
  justify-content:center;
  overflow:hidden;
  page-break-after:always;break-after:page;
}
.slide:last-child{page-break-after:auto;break-after:auto}

h1,h2,.stat{font-family:var(--display);font-weight:600;letter-spacing:-0.02em;line-height:1.1}
h1{font-size:64px}
h2{font-size:42px}
p,li{font-family:var(--body);line-height:1.5}

.rule{width:72px;height:4px;background:var(--accent);margin-bottom:28px;flex:none}
.muted{color:var(--muted)}
.foot{
  position:absolute;left:88px;right:88px;bottom:40px;
  font-size:16px;color:var(--muted);
  display:flex;justify-content:space-between;align-items:baseline;
}

/* title */
.title-slide h1{font-size:76px;max-width:22ch}
.title-slide .sub{margin-top:24px;font-size:26px;color:var(--muted);max-width:44ch}

/* statement */
.statement .big{font-family:var(--display);font-size:52px;line-height:1.2;max-width:24ch;font-weight:600}
.statement .note{margin-top:28px;font-size:20px;color:var(--muted);max-width:50ch}

/* bullets */
.points{list-style:none;margin-top:36px;display:flex;flex-direction:column;gap:22px}
.points li{font-size:26px;display:flex;gap:18px;align-items:baseline;max-width:46ch}
.points .dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--accent);transform:translateY(-4px)}

/* two column */
.cols{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:56px}
.cols h3{font-family:var(--display);font-size:24px;margin-bottom:14px}
.cols p{font-size:20px;color:var(--muted)}

/* metrics */
.metrics{margin-top:48px;display:flex;gap:56px}
.metric{flex:1;border-top:3px solid var(--accent);padding-top:20px}
.metric .stat{font-size:58px}
.metric .label{margin-top:10px;font-size:19px}
.metric .note{margin-top:6px;font-size:16px;color:var(--muted)}

/* quote */
.quote blockquote{font-family:var(--display);font-size:40px;line-height:1.3;max-width:26ch;font-weight:500}
.quote .by{margin-top:28px;font-size:20px;color:var(--muted)}

/* image */
.image-slide{padding:0}
.image-slide img{width:100%;height:100%;object-fit:cover}
.image-slide .cap{
  position:absolute;left:0;right:0;bottom:0;
  padding:32px 88px;font-size:20px;
  color:#fff;background:linear-gradient(to top,rgba(0,0,0,.72),transparent);
}

/* closing */
.closing{background:var(--accent);color:var(--on-accent)}
.closing h1{font-size:60px}
.closing .lines{margin-top:32px;display:flex;flex-direction:column;gap:12px;font-size:24px}
.closing .rule{background:var(--on-accent)}
</style>
</head>
<body>
${deck.slides.map((slide, i) => renderSlide(slide, i, deck)).join('\n')}
</body>
</html>`;
}

function renderSlide(slide: Slide, index: number, deck: Deck): string {
  const number = index + 1;
  const foot = `<div class="foot"><span>${escape(deck.title)}</span><span>${number}</span></div>`;

  switch (slide.layout) {
    case 'title':
      return `<section class="slide title-slide">
  <div class="rule"></div>
  <h1>${escape(slide.title)}</h1>
  ${slide.subtitle ? `<p class="sub">${escape(slide.subtitle)}</p>` : ''}
</section>`;

    case 'statement':
      return `<section class="slide statement">
  <div class="rule"></div>
  <p class="big">${escape(slide.text)}</p>
  ${slide.note ? `<p class="note">${escape(slide.note)}</p>` : ''}
  ${foot}
</section>`;

    case 'bullets':
      return `<section class="slide">
  <div class="rule"></div>
  <h2>${escape(slide.title)}</h2>
  <ul class="points">
    ${slide.points.map((p) => `<li><span class="dot"></span><span>${escape(p)}</span></li>`).join('\n    ')}
  </ul>
  ${foot}
</section>`;

    case 'two-column':
      return `<section class="slide">
  <div class="rule"></div>
  <h2>${escape(slide.title)}</h2>
  <div class="cols">
    <div><h3>${escape(slide.left.heading)}</h3><p>${escape(slide.left.body)}</p></div>
    <div><h3>${escape(slide.right.heading)}</h3><p>${escape(slide.right.body)}</p></div>
  </div>
  ${foot}
</section>`;

    case 'metrics':
      return `<section class="slide">
  <div class="rule"></div>
  <h2>${escape(slide.title)}</h2>
  <div class="metrics">
    ${slide.metrics
      .map(
        (m) => `<div class="metric">
      <div class="stat">${escape(m.value)}</div>
      <div class="label">${escape(m.label)}</div>
      ${m.note ? `<div class="note">${escape(m.note)}</div>` : ''}
    </div>`,
      )
      .join('\n    ')}
  </div>
  ${foot}
</section>`;

    case 'quote':
      return `<section class="slide quote">
  <div class="rule"></div>
  <blockquote>${escape(slide.quote)}</blockquote>
  <p class="by">${escape(slide.attribution)}</p>
  ${foot}
</section>`;

    case 'image':
      return `<section class="slide image-slide">
  <img src="${escape(slide.image.src)}" alt="${escape(slide.image.alt)}">
  ${slide.caption ? `<div class="cap">${escape(slide.caption)}</div>` : ''}
</section>`;

    case 'closing':
      return `<section class="slide closing">
  <div class="rule"></div>
  <h1>${escape(slide.title)}</h1>
  <div class="lines">
    ${slide.lines.map((l) => `<div>${escape(l)}</div>`).join('\n    ')}
  </div>
</section>`;
  }
}
