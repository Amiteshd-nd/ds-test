/**
 * The whole pipeline: fonts (if missing) -> hero (if a key is set) -> capture
 * -> audio -> assemble -> check.   node render/pipeline.ts [--scale 1|2] [--workers N] [--skip-capture] [--hw]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const t0 = Date.now();
const step = (name: string, cmd: string, cmdArgs: string[]) => {
  const t = Date.now();
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${name} failed (${r.status})`); process.exit(r.status ?? 1); }
  console.log(`== ${name} done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
};

if (!existsSync(path.join(root, 'demo', 'fonts.css'))) step('fonts', 'node', ['render/fonts.ts']);
step('hero', 'node', ['render/hero.ts']);
if (!args.includes('--skip-capture')) {
  rmSync(path.join(root, 'frames'), { recursive: true, force: true });
  step('capture', 'node', ['render/capture.ts', ...args.filter((a) => a !== '--skip-capture' && a !== '--hw')]);
}
step('audio', 'node', ['render/audio.ts']);
step('assemble', 'bash', ['render/assemble.sh', ...(args.includes('--hw') ? ['--hw'] : [])]);
step('check', 'node', ['render/check.ts']);
console.log(`\npipeline done in ${((Date.now() - t0) / 60000).toFixed(1)} min -> out/teaser-1080p.mp4, out/teaser-4k.mp4`);
