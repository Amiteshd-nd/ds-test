import path from 'node:path';

import { assertOwnsProject } from '@/core/auth';
import { artifactDir } from '@/core/artifacts';
import { serveFromDirectory } from '@/core/site/serve-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ project: string; task: string; file: string }> };

/**
 * A report or a deck, downloaded.
 *
 * Behind the owner check, unlike a published site: this is working material,
 * not something meant to be handed out. A deck goes to an investor because the
 * owner sent it, not because its URL was guessable.
 */
export async function GET(_request: Request, { params }: Params) {
  const { project, task, file } = await params;

  try {
    await assertOwnsProject(project);
  } catch {
    return new Response('not found', { status: 404 });
  }

  // `task` comes from the URL and is joined into a path. Anything that is not a
  // plain uuid-shaped segment is refused rather than resolved.
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(task)) return new Response('not found', { status: 404 });

  return serveFromDirectory(artifactDir(project, task), [path.basename(file)]);
}
