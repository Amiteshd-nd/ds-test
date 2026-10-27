/**
 * Pulls the first, middle and last frames out of out/teaser-1080p.mp4 as PNGs
 * (out/verify-first.png, -middle, -last) and prints the stream details, so a
 * render can be eyeballed without a video player.   node render/check.ts
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string;
const file = path.join(root, 'out', process.argv[2] ?? 'teaser-1080p.mp4');
if (!existsSync(file)) { console.error(`missing ${file}`); process.exit(1); }

const info = (() => { try { return execFileSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e: any) { return e.stderr as string; } })();
const dur = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
const seconds = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
console.log(info.split('\n').filter((l) => /Duration|Stream/.test(l)).map((l) => l.trim()).join('\n'));

for (const [name, at] of [['first', 0.02], ['middle', seconds / 2], ['last', Math.max(0, seconds - 0.05)]] as const) {
  const out = path.join(root, 'out', `verify-${name}.png`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', out]);
  console.log(`verify-${name}.png @ ${(+at).toFixed(2)}s`);
}
