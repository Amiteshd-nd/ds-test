/**
 * Where a site lives once the sandbox that built it is gone.
 *
 * A task's sandbox is destroyed the moment the task ends, which is correct and
 * also means that without this module every site would be delivered and then
 * immediately deleted. So on success the built site and its source are copied
 * into `.runner/sites/<project>/v<N>/` and recorded as an artifact row.
 *
 * Keeping the **source** as well as `dist/` is what makes the second task
 * possible: "make the headline shorter" seeds a fresh sandbox from version N's
 * source rather than starting from the template again. It is also the undo -
 * every version stays, and restoring one is copying it forward.
 *
 * Deploy uploads from here. Preview serves from here. Nothing reads the
 * sandbox after the task ends.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

import type { Sandbox } from '../providers/interfaces.ts';
import type { Store } from '../db/store.ts';

/** Where the agent builds, relative to the sandbox working directory. */
export const SITE_DIR = 'site';

export interface VersionMeta {
  version: number;
  task_id: string;
  created_at: string;
  /** Pulled out of the built HTML, so the version list says something useful. */
  title: string;
  headline: string;
  deployed_url: string | null;
}

export function sitesRoot(): string {
  return path.join(process.cwd(), '.runner', 'sites');
}

export function projectDir(projectId: string): string {
  return path.join(sitesRoot(), projectId);
}

export function versionDir(projectId: string, version: number): string {
  return path.join(projectDir(projectId), `v${version}`);
}

export function distDir(projectId: string, version: number): string {
  return path.join(versionDir(projectId, version), 'dist');
}

export function previewUrl(projectId: string, version: number): string {
  return `/api/sites/${projectId}/${version}/`;
}

export async function listVersions(projectId: string): Promise<VersionMeta[]> {
  const root = projectDir(projectId);
  if (!existsSync(root)) return [];

  const metas: VersionMeta[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^v\d+$/.test(entry.name)) continue;
    try {
      metas.push(JSON.parse(await readFile(path.join(root, entry.name, 'meta.json'), 'utf8')));
    } catch {
      // A half-written version from a crash. Skipping it is better than
      // failing the whole listing.
    }
  }
  return metas.sort((a, b) => b.version - a.version);
}

export async function latestVersion(projectId: string): Promise<VersionMeta | null> {
  return (await listVersions(projectId))[0] ?? null;
}

async function nextVersionNumber(projectId: string): Promise<number> {
  const versions = await listVersions(projectId);
  return (versions[0]?.version ?? 0) + 1;
}

/**
 * Copy a finished site out of a sandbox. Returns null when the task did not
 * build one, which is most tasks.
 */
export async function captureVersion(
  projectId: string,
  taskId: string,
  sandbox: Sandbox,
  store: Store,
): Promise<{ version: number; preview_url: string } | null> {
  if (!sandbox.exportDir) {
    // E2B will need a tar-and-download path here. Failing loudly beats
    // silently delivering nothing.
    throw new Error(
      `the ${sandbox.constructor.name} sandbox cannot export directories, so a built site cannot be kept`,
    );
  }

  const built = await sandbox
    .readFile(`${SITE_DIR}/dist/index.html`)
    .catch(() => null);
  if (!built) return null;

  const version = await nextVersionNumber(projectId);
  const dir = versionDir(projectId, version);
  await mkdir(dir, { recursive: true });

  // `dist` is what gets served and deployed; `src` is what the next edit task
  // starts from. node_modules is excluded: it is 300MB, it is reproducible, and
  // the template seed provides it.
  await sandbox.exportDir(`${SITE_DIR}/dist`, path.join(dir, 'dist'));
  await sandbox.exportDir(SITE_DIR, path.join(dir, 'src'), ['node_modules', 'dist', '.astro']);

  const meta: VersionMeta = {
    version,
    task_id: taskId,
    created_at: new Date().toISOString(),
    title: firstMatch(built, /<title>([^<]*)<\/title>/) ?? 'Untitled',
    headline: stripTags(firstMatch(built, /<h1[^>]*>([\s\S]*?)<\/h1>/) ?? ''),
    deployed_url: null,
  };
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  store.addArtifact(taskId, 'site', dir, null);
  return { version, preview_url: previewUrl(projectId, version) };
}

/** Seed a sandbox from a previous version's source, for an edit task. */
export async function restoreInto(
  projectId: string,
  version: number,
  destination: string,
): Promise<boolean> {
  const source = path.join(versionDir(projectId, version), 'src');
  if (!existsSync(source)) return false;
  await cp(source, destination, { recursive: true });
  return true;
}

export async function recordDeployment(
  projectId: string,
  version: number,
  url: string,
): Promise<void> {
  const file = path.join(versionDir(projectId, version), 'meta.json');
  const meta = JSON.parse(await readFile(file, 'utf8')) as VersionMeta;
  meta.deployed_url = url;
  await writeFile(file, JSON.stringify(meta, null, 2), 'utf8');
}

const firstMatch = (text: string, re: RegExp) => re.exec(text)?.[1]?.trim();
const stripTags = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
