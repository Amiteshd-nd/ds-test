/**
 * The headless browser: screenshots and measurements.
 *
 * PRD section 6.3's "do better" is a visual QA loop - screenshot at mobile and
 * desktop, critique, fix, at most two iterations. This is the half of it that
 * does not involve a model.
 *
 * Splitting it that way is deliberate. A vision model is good at "this looks
 * cramped" and unreliable at "this heading is three lines"; a browser is exact
 * about the second and has no opinion about the first. So the browser measures
 * and the model judges, and the measurements are the part that can block a
 * build.
 *
 * One browser process is shared across a run. Launching Chromium costs about a
 * second, and a visual QA pass opens six pages.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Browser } from 'playwright';

import type { PageCheck } from '../types.ts';
import { pageChecks } from '../site/checks.ts';

export type Viewport = 'desktop' | 'mobile';

export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

export interface PageReport {
  viewport: Viewport;
  checks: PageCheck[];
  /** Absolute path to the screenshot on disk. */
  screenshot: string;
  console_errors: string[];
}

export interface BrowserProvider {
  readonly name: string;
  inspect(url: string, viewport: Viewport, screenshotPath: string): Promise<PageReport>;
  close(): Promise<void>;
}

export class PlaywrightBrowser implements BrowserProvider {
  readonly name = 'playwright';
  private browser: Browser | null = null;

  private async page() {
    if (!this.browser) {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch();
    }
    return this.browser;
  }

  async inspect(url: string, viewport: Viewport, screenshotPath: string): Promise<PageReport> {
    const browser = await this.page();
    const context = await browser.newContext({
      viewport: VIEWPORTS[viewport],
      deviceScaleFactor: 2,
      // The checks include a reduced-motion path; measuring a page mid-entrance
      // animation produces line counts that are true for 300ms and false after.
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
      // Images are the thing most likely to still be arriving, and half the
      // checks are about them. A short settle beats a flaky measurement.
      await page
        .waitForLoadState('networkidle', { timeout: 6_000 })
        .catch(() => {
          /* a page with a long-poll never goes idle; measure it anyway */
        });

      const raw = await page.evaluate(
        // Passed as source text: the function is evaluated inside the page, so
        // it cannot close over anything in this module.
        `(${pageChecks.toString()})(${JSON.stringify(viewport)})`,
      );

      await mkdir(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });

      const checks: PageCheck[] = (raw as Array<Omit<PageCheck, 'viewport'>>).map((c) => ({
        ...c,
        viewport,
      }));

      return { viewport, checks, screenshot: screenshotPath, console_errors: errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        viewport,
        checks: [
          {
            id: 'page-loads',
            label: 'The page loads',
            viewport,
            passed: false,
            detail: message,
            blocking: true,
          },
        ],
        screenshot: screenshotPath,
        console_errors: errors,
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

/**
 * Used when Chromium is not installed. Reports honestly rather than passing.
 *
 * A skipped check that reads as a pass is worse than no check: it turns "we did
 * not look" into "we looked and it was fine".
 */
export class UnavailableBrowser implements BrowserProvider {
  readonly name = 'unavailable';

  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  async inspect(_url: string, viewport: Viewport, screenshotPath: string): Promise<PageReport> {
    return {
      viewport,
      checks: [
        {
          id: 'browser-available',
          label: 'A browser was available to check the page',
          viewport,
          passed: false,
          detail: this.reason,
          blocking: false,
        },
      ],
      screenshot: screenshotPath,
      console_errors: [],
    };
  }

  async close(): Promise<void> {}
}

export async function browserProvider(): Promise<BrowserProvider> {
  if (process.env.BROWSER_PROVIDER === 'none') {
    return new UnavailableBrowser('BROWSER_PROVIDER=none');
  }
  try {
    const { chromium } = await import('playwright');
    // executablePath() throws when the browser binary was never downloaded,
    // which is a different failure from the package being absent and deserves
    // a different message.
    chromium.executablePath();
    return new PlaywrightBrowser();
  } catch (err) {
    return new UnavailableBrowser(
      `Chromium is not installed: ${err instanceof Error ? err.message : String(err)}. ` +
        'Run `pnpm --filter runner browsers`.',
    );
  }
}

/** Write a screenshot out as a data URL, for streaming into the UI. */
export async function screenshotDataUrl(file: string): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(file);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export { writeFile };
