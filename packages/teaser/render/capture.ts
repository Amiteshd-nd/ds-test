/**
 * Renders the mockup frame by frame with headless Chromium.
 *
 *   node render/capture.ts [--scale 2] [--workers 4] [--format png|jpeg] [--out frames] [--from 0 --to N]
 *
 * For every frame i in 0..(duration*fps): seek(i/fps), wait a frame, screenshot.
 * --scale 2 renders at deviceScaleFactor 2 (3840x2160) for the 4K pass; 1 for 1080p.
 * Frames are split across --workers pages (one browser, N contexts), each seeking
 * forward only within its own contiguous slice, so GSAP's state is always reached by
 * moving forward from zero. Fully headless; runs in CI.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serve } from './serve.ts';

const root = path.join(import.meta.dirname, '..');
const script = JSON.parse(readFileSync(path.join(root, 'demo', 'script.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (name: string, def: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };

const scale = Number(opt('scale', '2'));
const workers = Number(opt('workers', String(Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2))))));
const format = opt('format', 'png') as 'png' | 'jpeg';
const outDir = path.resolve(root, opt('out', 'frames'));
const fps: number = script.video.fps;

const { width, height } = script.video;

mkdirSync(outDir, { recursive: true });
const { url, close } = await serve(path.join(root, 'demo'));
const browser = await chromium.launch({ headless: true, args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'] });

// The timeline owns the duration and the audio cues: read both from the page once.
const probe = await browser.newPage({ viewport: { width, height } });
await probe.goto(url, { waitUntil: 'domcontentloaded' });
await probe.waitForFunction(() => (window as any).ready === true, null, { timeout: 60_000 });
const meta = await probe.evaluate(() => ({ duration: (window as any).duration as number, events: (window as any).events as { t: number; kind: string }[] }));
await probe.close();
const total = Math.round(meta.duration * fps);
mkdirSync(path.join(root, 'out'), { recursive: true });
writeFileSync(path.join(root, 'out', 'events.json'), JSON.stringify({ duration: meta.duration, fps, events: meta.events }, null, 1));
console.log(`timeline: ${meta.duration.toFixed(2)}s, ${meta.events.length} audio cues -> out/events.json`);
const from = Number(opt('from', '0'));
const to = Number(opt('to', String(total - 1)));

const t0 = Date.now();
let done = 0;
const count = to - from + 1;
const per = Math.ceil(count / workers);
const slices = Array.from({ length: workers }, (_, w) => [from + w * per, Math.min(to, from + (w + 1) * per - 1)]).filter(([a, b]) => a <= b);

const frameName = (i: number) => path.join(outDir, `f${String(i).padStart(5, '0')}.${format === 'png' ? 'png' : 'jpg'}`);

async function runSlice([a, b]: number[]) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  for (let i = a; i <= b; i++) {
    const file = frameName(i);
    if (existsSync(file) && args.includes('--resume')) { done++; continue; }
    await page.evaluate(async (t) => {
      (window as any).seek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, i / fps);
    await page.screenshot({ path: file, type: format, ...(format === 'jpeg' ? { quality: 95 } : {}), animations: 'disabled', caret: 'hide' });
    done++;
    if (done % 60 === 0 || done === count) {
      const el = (Date.now() - t0) / 1000;
      const eta = (el / done) * (count - done);
      process.stdout.write(`\r${done}/${count} frames  ${el.toFixed(0)}s elapsed  ~${eta.toFixed(0)}s left   `);
    }
  }
  await context.close();
}

console.log(`capture: ${count} frames @ ${fps}fps, ${width * scale}x${height * scale} ${format}, ${slices.length} worker(s) -> ${path.relative(root, outDir)}/`);
await Promise.all(slices.map(runSlice));
await browser.close();
close();
console.log(`\ncapture done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
