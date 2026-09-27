/**
 * Getting a deck out: PDF, PPTX, and the measurements in between.
 *
 * PRD section 6.5 wants both formats and is specific that the PPTX is
 * **editable**. So the PDF is the HTML render printed by the same browser that
 * measures it, and the PPTX is built from the deck model directly with real
 * text boxes - not a picture of each slide dropped into a slide. A deck the
 * owner cannot change a word of is a PDF with a different extension.
 *
 * The two renderers will never match pixel for pixel. The PDF is the faithful
 * one; the PPTX is the one somebody can edit on a train. Saying which is which
 * is more useful than pretending they are the same.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hex, PALETTES, TYPE_PAIRINGS } from '../design/palettes.ts';
import type { Deck, Slide } from './deck.ts';
import { renderDeck, SLIDE_HEIGHT, SLIDE_WIDTH } from './render.ts';

/* -------------------------------------------------------------------- pdf */

export interface RenderedDeck {
  html: string;
  pdf: string;
  pptx: string;
  /** One per slide, for the checks and for the UI. */
  screenshots: string[];
  overflow: Array<{ slide: number; by: number }>;
}

export async function exportDeck(deck: Deck, outDir: string, basename: string): Promise<RenderedDeck> {
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${basename}.html`);
  await writeFile(htmlPath, await renderDeck(deck), 'utf8');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const screenshots: string[] = [];
  const overflow: Array<{ slide: number; by: number }> = [];
  const pdfPath = path.join(outDir, `${basename}.pdf`);

  try {
    const context = await browser.newContext({
      viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    /*
     * The failure that actually ruins decks: text running off the slide.
     * A slide is a fixed box, so anything whose content is taller than the box
     * is simply cut off - and neither the model that wrote it nor a reader of
     * the JSON can see that. The browser can, exactly.
     */
    const measured = await page.evaluate(() => {
      return [...document.querySelectorAll('.slide')].map((slide) => {
        const el = slide as HTMLElement;
        return { scroll: el.scrollHeight, client: el.clientHeight };
      });
    });
    measured.forEach((m, i) => {
      if (m.scroll > m.client + 2) overflow.push({ slide: i + 1, by: m.scroll - m.client });
    });

    const slides = await page.locator('.slide').all();
    for (const [i, slide] of slides.entries()) {
      const file = path.join(outDir, `${basename}-slide-${String(i + 1).padStart(2, '0')}.png`);
      await slide.screenshot({ path: file });
      screenshots.push(file);
    }

    await page.pdf({
      path: pdfPath,
      width: `${SLIDE_WIDTH}px`,
      height: `${SLIDE_HEIGHT}px`,
      printBackground: true,
      pageRanges: `1-${deck.slides.length}`,
    });

    await context.close();
  } finally {
    await browser.close();
  }

  const pptxPath = path.join(outDir, `${basename}.pptx`);
  await writePptx(deck, pptxPath);

  return { html: htmlPath, pdf: pdfPath, pptx: pptxPath, screenshots, overflow };
}

/* ------------------------------------------------------------------- pptx */

/**
 * PptxGenJS works in inches. A 16:9 slide is 13.333 by 7.5, and every position
 * below is that grid rather than a translation of the CSS, because the two
 * layout models do not correspond and pretending they do produces a deck where
 * everything is four millimetres out.
 */
const W = 13.333;
const H = 7.5;
const M = 0.92;

async function writePptx(deck: Deck, file: string): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const palette = PALETTES[deck.design.palette] ?? PALETTES.forest;
  const type = TYPE_PAIRINGS[deck.design.type] ?? TYPE_PAIRINGS.grotesk;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.title;

  const ink = hex(palette.ink);
  const muted = hex(palette.muted);
  const accent = hex(palette.accent);

  for (const [index, slide] of deck.slides.entries()) {
    const s = pptx.addSlide();
    s.background = { color: hex(slide.layout === 'closing' ? palette.accent : palette.bg) };
    addSlide(s, slide, index, deck, { ink, muted, accent, palette, type });
  }

  // `write` gives a Buffer rather than touching the filesystem, which keeps the
  // one place that writes files in this module the same as for the PDF.
  const data = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  await writeFile(file, data);
}

type PptxSlide = Awaited<ReturnType<Awaited<typeof import('pptxgenjs')>['default']['prototype']['addSlide']>>;

interface Theme {
  ink: string;
  muted: string;
  accent: string;
  palette: (typeof PALETTES)[keyof typeof PALETTES];
  type: (typeof TYPE_PAIRINGS)[keyof typeof TYPE_PAIRINGS];
}

function addSlide(
  s: PptxSlide,
  slide: Slide,
  index: number,
  deck: Deck,
  theme: Theme,
): void {
  const { ink, muted, accent, palette, type } = theme;
  const onAccent = hex(palette.onAccent);

  const rule = (y = M, color = accent) =>
    s.addShape('rect', { x: M, y, w: 0.75, h: 0.05, fill: { color } });

  const footer = () => {
    s.addText(deck.title, {
      x: M, y: H - 0.72, w: W - M * 2 - 0.6, h: 0.3,
      fontSize: 10, color: muted, fontFace: type.pptxBody,
    });
    s.addText(String(index + 1), {
      x: W - M - 0.6, y: H - 0.72, w: 0.6, h: 0.3,
      fontSize: 10, color: muted, align: 'right', fontFace: type.pptxBody,
    });
  };

  switch (slide.layout) {
    case 'title':
      rule(2.3);
      s.addText(slide.title, {
        x: M, y: 2.5, w: W - M * 2, h: 1.6,
        fontSize: 40, bold: true, color: ink, fontFace: type.pptxDisplay,
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: M, y: 4.15, w: W - M * 2 - 2, h: 0.9,
          fontSize: 16, color: muted, fontFace: type.pptxBody,
        });
      }
      break;

    case 'statement':
      rule(2.4);
      s.addText(slide.text, {
        x: M, y: 2.6, w: W - M * 2 - 1.5, h: 2,
        fontSize: 28, bold: true, color: ink, fontFace: type.pptxDisplay, lineSpacingMultiple: 1.2,
      });
      if (slide.note) {
        s.addText(slide.note, {
          x: M, y: 4.7, w: W - M * 2 - 2, h: 0.8,
          fontSize: 13, color: muted, fontFace: type.pptxBody,
        });
      }
      footer();
      break;

    case 'bullets':
      rule();
      s.addText(slide.title, {
        x: M, y: 1.2, w: W - M * 2, h: 0.8,
        fontSize: 26, bold: true, color: ink, fontFace: type.pptxDisplay,
      });
      s.addText(
        slide.points.map((p) => ({ text: p, options: { breakLine: true } })),
        {
          x: M, y: 2.25, w: W - M * 2 - 1.2, h: 4,
          fontSize: 16, color: ink, fontFace: type.pptxBody,
          bullet: { type: 'bullet' }, lineSpacingMultiple: 1.5, valign: 'top',
        },
      );
      footer();
      break;

    case 'two-column': {
      rule();
      s.addText(slide.title, {
        x: M, y: 1.2, w: W - M * 2, h: 0.8,
        fontSize: 26, bold: true, color: ink, fontFace: type.pptxDisplay,
      });
      const colWidth = (W - M * 2 - 0.7) / 2;
      [slide.left, slide.right].forEach((col, i) => {
        const x = M + i * (colWidth + 0.7);
        s.addText(col.heading, {
          x, y: 2.35, w: colWidth, h: 0.45,
          fontSize: 16, bold: true, color: ink, fontFace: type.pptxDisplay,
        });
        s.addText(col.body, {
          x, y: 2.85, w: colWidth, h: 2.6,
          fontSize: 13, color: muted, fontFace: type.pptxBody, valign: 'top',
        });
      });
      footer();
      break;
    }

    case 'metrics': {
      rule();
      s.addText(slide.title, {
        x: M, y: 1.2, w: W - M * 2, h: 0.8,
        fontSize: 26, bold: true, color: ink, fontFace: type.pptxDisplay,
      });
      const gap = 0.6;
      const width = (W - M * 2 - gap * (slide.metrics.length - 1)) / slide.metrics.length;
      slide.metrics.forEach((metric, i) => {
        const x = M + i * (width + gap);
        s.addShape('rect', { x, y: 2.5, w: width, h: 0.04, fill: { color: accent } });
        s.addText(metric.value, {
          x, y: 2.65, w: width, h: 0.9,
          fontSize: 34, bold: true, color: ink, fontFace: type.pptxDisplay,
        });
        s.addText(metric.label, {
          x, y: 3.55, w: width, h: 0.45,
          fontSize: 13, color: ink, fontFace: type.pptxBody,
        });
        if (metric.note) {
          s.addText(metric.note, {
            x, y: 4, w: width, h: 0.6,
            fontSize: 11, color: muted, fontFace: type.pptxBody,
          });
        }
      });
      footer();
      break;
    }

    case 'quote':
      rule(2.4);
      s.addText(`"${slide.quote}"`, {
        x: M, y: 2.6, w: W - M * 2 - 1.8, h: 2,
        fontSize: 24, color: ink, fontFace: type.pptxDisplay, lineSpacingMultiple: 1.3,
      });
      s.addText(slide.attribution, {
        x: M, y: 4.75, w: W - M * 2, h: 0.4,
        fontSize: 13, color: muted, fontFace: type.pptxBody,
      });
      footer();
      break;

    case 'image':
      // Remote images: PptxGenJS fetches them when the deck is written, and a
      // failed fetch would abort the export. `sizing: cover` keeps the crop the
      // same as the HTML render.
      s.addImage({
        path: slide.image.src,
        x: 0, y: 0, w: W, h: H,
        sizing: { type: 'cover', w: W, h: H },
      });
      if (slide.caption) {
        s.addShape('rect', { x: 0, y: H - 1.1, w: W, h: 1.1, fill: { color: '000000', transparency: 35 } });
        s.addText(slide.caption, {
          x: M, y: H - 0.85, w: W - M * 2, h: 0.5,
          fontSize: 13, color: 'FFFFFF', fontFace: type.pptxBody,
        });
      }
      break;

    case 'closing':
      rule(2.3, onAccent);
      s.addText(slide.title, {
        x: M, y: 2.5, w: W - M * 2, h: 1.1,
        fontSize: 34, bold: true, color: onAccent, fontFace: type.pptxDisplay,
      });
      s.addText(
        slide.lines.map((l) => ({ text: l, options: { breakLine: true } })),
        {
          x: M, y: 3.7, w: W - M * 2, h: 2,
          fontSize: 16, color: onAccent, fontFace: type.pptxBody, lineSpacingMultiple: 1.4,
          valign: 'top',
        },
      );
      break;
  }
}
