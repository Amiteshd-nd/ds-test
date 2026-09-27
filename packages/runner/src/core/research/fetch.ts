/**
 * Reading a web page.
 *
 * PRD section 6.4 names Firecrawl or an in-sandbox browser. This is the second:
 * Chromium is already installed for the visual QA loop, so page fetching costs
 * nothing extra and there is no third account.
 *
 * A real browser rather than an HTTP fetch plus a parser, because a large share
 * of the pages a market researcher wants are rendered client side, and an HTTP
 * fetch of those returns an empty shell that reads as "no information found".
 *
 * What comes back is text, capped. The researcher's context is the scarce
 * resource, and the parts of a page that carry the answer are almost never the
 * navigation.
 */

import { browserProvider } from '../providers/browser-playwright.ts';

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

const MAX_CHARS = 12_000;

/** Chrome that is stripped before the text is measured. */
const STRIP = 'nav, header, footer, aside, script, style, noscript, form, iframe, svg';

export async function readPage(url: string): Promise<FetchedPage> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`only http and https URLs can be read, not ${url.slice(0, 80)}`);
  }

  const provider = await browserProvider();
  if (provider.name === 'unavailable') {
    throw new Error('no browser is installed, so pages cannot be read. Run `pnpm --filter runner browsers`.');
  }

  // Reaching past the interface on purpose: `inspect` measures a page against
  // the landing-page rules, which is a different job from reading one. The
  // BrowserProvider interface is about checks; this needs a raw page.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Identify honestly. A page that blocks bots should be allowed to.
      userAgent:
        'Mozilla/5.0 (compatible; RunnerResearch/1.0; +https://github.com/) Chrome/153 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});

    const extracted = await page.evaluate((strip: string) => {
      for (const element of document.querySelectorAll(strip)) element.remove();
      const main = document.querySelector('article, main, [role="main"]') ?? document.body;
      return {
        title: document.title ?? '',
        text: (main as HTMLElement).innerText.replace(/\n{3,}/g, '\n\n').trim(),
      };
    }, STRIP);

    const truncated = extracted.text.length > MAX_CHARS;
    return {
      url,
      title: extracted.title.trim() || url,
      text: truncated ? `${extracted.text.slice(0, MAX_CHARS)}\n\n[…page continues]` : extracted.text,
      truncated,
    };
  } finally {
    await browser.close();
  }
}
