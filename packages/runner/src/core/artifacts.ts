/**
 * Where a task's output lives once its sandbox is gone.
 *
 * Phase 1 needed this for sites and solved it in `site/workspace.ts`, which
 * knows about versions and previews because a site is edited repeatedly. A
 * report or a deck is not: it is produced once and read, so it gets a simpler
 * home here, keyed by task.
 *
 * The `artifacts` table (PRD section 8) is the index; this is the bytes.
 */

import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { Store } from './db/store.ts';
import type { Artifact } from './types.ts';

export function artifactsRoot(): string {
  return path.join(process.cwd(), '.runner', 'artifacts');
}

export function artifactDir(projectId: string, taskId: string): string {
  return path.join(artifactsRoot(), projectId, taskId);
}

export function artifactUrl(projectId: string, taskId: string, filename: string): string {
  return `/api/artifacts/${projectId}/${taskId}/${encodeURIComponent(filename)}`;
}

/** A filename the agent supplied is a filename from a model. Contain it. */
export function safeName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[.-]+/, '');
  return base.slice(0, 80) || 'artifact';
}

export interface SavedArtifact {
  artifact: Artifact;
  file: string;
  href: string;
}

export async function saveText(
  store: Store,
  options: {
    projectId: string;
    taskId: string;
    filename: string;
    contents: string;
    kind: Artifact['kind'];
    publicUrl?: string | null;
  },
): Promise<SavedArtifact> {
  const dir = artifactDir(options.projectId, options.taskId);
  await mkdir(dir, { recursive: true });

  const name = safeName(options.filename);
  const file = path.join(dir, name);
  await writeFile(file, options.contents, 'utf8');

  return {
    artifact: store.addArtifact(options.taskId, options.kind, file, options.publicUrl ?? null),
    file,
    href: artifactUrl(options.projectId, options.taskId, name),
  };
}

/** The same, for something already written to disk (a rendered PDF, say). */
export async function saveFile(
  store: Store,
  options: {
    projectId: string;
    taskId: string;
    from: string;
    filename?: string;
    kind: Artifact['kind'];
  },
): Promise<SavedArtifact> {
  const dir = artifactDir(options.projectId, options.taskId);
  await mkdir(dir, { recursive: true });

  const name = safeName(options.filename ?? path.basename(options.from));
  const file = path.join(dir, name);
  await copyFile(options.from, file);

  return {
    artifact: store.addArtifact(options.taskId, options.kind, file, null),
    file,
    href: artifactUrl(options.projectId, options.taskId, name),
  };
}

export interface ListedArtifact {
  task_id: string;
  filename: string;
  href: string;
  bytes: number;
  modified: string;
}

/** Everything a project has produced, newest first. */
export async function listArtifacts(projectId: string): Promise<ListedArtifact[]> {
  const root = path.join(artifactsRoot(), projectId);
  if (!existsSync(root)) return [];

  const out: ListedArtifact[] = [];
  for (const task of await readdir(root, { withFileTypes: true })) {
    if (!task.isDirectory()) continue;
    for (const entry of await readdir(path.join(root, task.name), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const info = await stat(path.join(root, task.name, entry.name));
      out.push({
        task_id: task.name,
        filename: entry.name,
        href: artifactUrl(projectId, task.name, entry.name),
        bytes: info.size,
        modified: info.mtime.toISOString(),
      });
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}
