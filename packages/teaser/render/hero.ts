/**
 * Optional hero still for the open and close, generated once with the Gemini
 * image model. Only runs when a key is available; otherwise it says so and
 * exits 0, and assemble.sh starts straight on the UI.
 *
 *   node render/hero.ts [--force]
 *
 * The key is read from GEMINI_API_KEY, then packages/teaser/.env.local, then
 * packages/landing/.env.local (the landing stickers use the same key).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const out = path.join(root, 'assets', 'hero.jpg');
const force = process.argv.includes('--force');

const PROMPT =
  'A single rounded grassy hill under a clear pale sky, distant blue-grey mountains, out-of-focus red wildflowers in the foreground. ' +
  'On the hilltop sits a cream-coloured 1980s all-in-one personal computer, its CRT glowing softly with a thin-line architectural floor plan on it. ' +
  'Photoreal 3D render, soft daylight, shallow depth of field, lots of empty sky in the upper third, no text.';

function loadKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const env of [path.join(root, '.env.local'), path.join(root, '..', 'landing', '.env.local')]) {
    if (!existsSync(env)) continue;
    const m = readFileSync(env, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

if (existsSync(out) && !force) { console.log('hero: assets/hero.jpg exists, keeping it (pass --force to regenerate)'); process.exit(0); }
const key = loadKey();
if (!key) { console.log('hero: no GEMINI_API_KEY, skipping the hero open/close'); process.exit(0); }

const API = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' };

async function resolveModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return process.env.GEMINI_IMAGE_MODEL;
  const res = await fetch(`${API}/models?pageSize=200`, { headers });
  if (!res.ok) throw new Error(`models: ${res.status} ${await res.text()}`);
  const { models = [] } = await res.json();
  const names: string[] = models.map((m: any) => m.name.replace(/^models\//, ''));
  const preferred = ['gemini-3.1-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
  const pick = preferred.find((p) => names.includes(p)) ?? names.find((n) => /image/.test(n) && !/embedding/.test(n));
  if (!pick) throw new Error(`no image model found among: ${names.join(', ')}`);
  return pick;
}

const model = await resolveModel();
console.log(`hero: generating with ${model}`);
const res = await fetch(`${API}/models/${model}:generateContent`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '4K' } },
  }),
});
if (!res.ok) {
  const text = await res.text();
  // some models reject imageSize; retry without it
  if (/imageSize|image_size/i.test(text)) {
    const res2 = await fetch(`${API}/models/${model}:generateContent`, { method: 'POST', headers, body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } } }) });
    if (!res2.ok) throw new Error(`${model}: ${res2.status} ${await res2.text()}`);
    await save(await res2.json());
  } else throw new Error(`${model}: ${res.status} ${text}`);
} else await save(await res.json());

async function save(data: any) {
  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!part) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 300)}`);
  const raw = Buffer.from(part.inlineData.data, 'base64');
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = path.join(root, 'out', 'hero-raw.bin');
  mkdirSync(path.dirname(tmp), { recursive: true });
  writeFileSync(tmp, raw);
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', tmp, '-q:v', '2', out]);
  console.log(`hero: ${part.inlineData.mimeType}, ${(raw.length / 1024).toFixed(0)} KB -> assets/hero.jpg`);
}
