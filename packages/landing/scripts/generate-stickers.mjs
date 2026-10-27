/**
 * Generates the landmark stickers with the Gemini API, one image per landmark,
 * then cuts them out of their white backgrounds into public/stickers/.
 *
 *   GEMINI_API_KEY=... node scripts/generate-stickers.mjs            # all
 *   GEMINI_API_KEY=... node scripts/generate-stickers.mjs taj-mahal  # one
 *
 * Reads the key from the environment or from .env.local. Skips landmarks that
 * already have a raw render unless --force is passed. Raw renders are kept in
 * .stickers-raw/ (gitignored) so a re-run of the cut-out step costs nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const RAW = path.join(root, '.stickers-raw');
const OUT = path.join(root, 'public', 'stickers');

import { LANDMARKS } from '../src/lib/landmarks.ts';

const prompt = (what) =>
  `A single cute kawaii sticker of ${what}. ` +
  'Black and white line art only: thick, even, bold black outlines, pure white fill, no shading, no gray tones, no color, no gradients. ' +
  'Simplified, slightly chubby, rounded proportions, recognisable at a glance. No face, no eyes, no smile, no characters: just the building. ' +
  'Clean flat vector sticker style, centered, isolated on a plain pure white background, nothing else in the image, no text, no watermark.';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = path.join(root, '.env.local');
  if (existsSync(env)) {
    const m = readFileSync(env, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('GEMINI_API_KEY is not set (environment or .env.local)');
}

const key = loadKey();
const API = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' };

/** The configured model, or the first image model the API lists. */
async function resolveModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return process.env.GEMINI_IMAGE_MODEL;
  const res = await fetch(`${API}/models?pageSize=200`, { headers });
  if (!res.ok) throw new Error(`models: ${res.status} ${await res.text()}`);
  const { models = [] } = await res.json();
  const names = models.map((m) => m.name.replace(/^models\//, ''));
  const preferred = ['gemini-3.1-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
  const pick = preferred.find((p) => names.includes(p)) ?? names.find((n) => /image/.test(n) && !/embedding/.test(n));
  if (!pick) throw new Error(`no image model found among: ${names.join(', ')}`);
  return pick;
}

async function generate(model, what) {
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(what) }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
  });
  if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 300)}`);
  return Buffer.from(part.inlineData.data, 'base64');
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const slugs = only.length ? only : Object.keys(LANDMARKS);

mkdirSync(RAW, { recursive: true });
const model = await resolveModel();
console.log(`model: ${model}`);

for (const slug of slugs) {
  const what = LANDMARKS[slug]?.what;
  if (!what) throw new Error(`unknown landmark ${slug}`);
  const file = path.join(RAW, `${slug}.png`);
  if (existsSync(file) && !force) {
    console.log(`${slug}: kept`);
    continue;
  }
  process.stdout.write(`${slug}: generating… `);
  writeFileSync(file, await generate(model, what));
  console.log('ok');
}

console.log('cutting out…');
execFileSync('python3', [path.join(root, 'scripts', 'cutout-stickers.py'), RAW, OUT], { stdio: 'inherit' });
