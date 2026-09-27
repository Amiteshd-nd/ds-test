/**
 * Getting a working site project into a sandbox, fast.
 *
 * PRD section 10 wants a sandbox ready in under five seconds and a first
 * preview in under three minutes. `npm install` for an Astro project is forty
 * to sixty of those seconds, every task, for a dependency tree that is
 * identical every time. Section 6.2's answer is a sandbox template with the
 * scaffolds preinstalled; this is the local equivalent.
 *
 * `templates/landing/node_modules` is installed once by
 * `scripts/seed-template.ts`. Each task gets its own copy of the project and
 * shares that tree by the cheapest mechanism the filesystem offers:
 *
 *   1. APFS/Btrfs clone (`cp -c` / `--reflink`) - instant, and each sandbox
 *      still has its own copy as far as writes are concerned.
 *   2. Hardlink farm (`cp -al`) - near instant, shares inodes, so a task that
 *      writes *into* node_modules would affect the template.
 *   3. Symlink - always works, shares everything.
 *
 * Options 2 and 3 weaken the sandbox boundary, which on a local sandbox that is
 * not isolation anyway is a small addition to an already-stated compromise. On
 * E2B this whole file is replaced by a custom template image.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Sandbox } from '../providers/interfaces.ts';
import { copyAssetsInto, type Asset } from './assets.ts';
import { restoreInto, SITE_DIR } from './workspace.ts';

const run = promisify(execFile);

export function templateDir(name = 'landing'): string {
  return path.join(process.cwd(), 'templates', name);
}

export function templateIsSeeded(name = 'landing'): boolean {
  return existsSync(path.join(templateDir(name), 'node_modules', 'astro'));
}

/** Everything a task does not need a copy of. */
const SKIP = new Set(['node_modules', 'dist', '.astro', 'package-lock.json']);

export interface SeedResult {
  /** Path to the project inside the sandbox, relative to its working directory. */
  dir: string;
  /** The version it was restored from, or null for a fresh template. */
  from_version: number | null;
  how: 'template' | 'version';
  /** The owner's own photographs, now sitting in the project's public/assets. */
  assets: Asset[];
}

/**
 * Put a site project at `site/` in the sandbox.
 *
 * With `fromVersion`, the project is the source of that version, which is what
 * makes "change the headline" an edit rather than a rebuild from scratch.
 */
export async function seedSite(
  sandbox: Sandbox,
  options: { projectId: string; fromVersion?: number | null; template?: string } = {
    projectId: '',
  },
): Promise<SeedResult> {
  const target = path.join(sandbox.workdir, SITE_DIR);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const source = templateDir(options.template);
  if (!templateIsSeeded(options.template)) {
    throw new Error(
      `the site template has no node_modules. Run \`node scripts/seed-template.ts\` once, ` +
        `then tasks start in under a second instead of a minute.`,
    );
  }

  let from: number | null = null;
  if (options.fromVersion && options.projectId) {
    const restored = await restoreInto(options.projectId, options.fromVersion, target);
    if (restored) from = options.fromVersion;
  }

  if (from === null) {
    await cp(source, target, {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)),
    });
  }

  await shareNodeModules(path.join(source, 'node_modules'), path.join(target, 'node_modules'));

  // Into `public/`, which Astro copies into `dist/` verbatim, so `/assets/x.jpg`
  // is a working path in the preview, in the deployment and in an export.
  const assets = options.projectId
    ? await copyAssetsInto(options.projectId, path.join(target, 'public'))
    : [];

  return {
    dir: SITE_DIR,
    from_version: from,
    how: from === null ? 'template' : 'version',
    assets,
  };
}

async function shareNodeModules(source: string, target: string): Promise<void> {
  if (existsSync(target)) return;

  // Copy-on-write clone. Instant on APFS and on Btrfs/XFS, and the task still
  // gets its own copy where writes are concerned.
  const clone = process.platform === 'darwin' ? ['-Rc', source, target] : ['-a', '--reflink=always', source, target];
  try {
    await run('cp', clone);
    return;
  } catch {
    /* the filesystem does not support cloning */
  }

  // Hardlink farm. Near instant, shares inodes.
  try {
    await run('cp', ['-al', source, target]);
    return;
  } catch {
    /* not GNU cp, or a cross-device link */
  }

  // Always works. Shares everything, including writes.
  await symlink(source, target, 'dir');
}
