import { assertOwnsProject } from '@/core/auth';
import { distDir } from '@/core/site/workspace';
import { serveFromDirectory } from '@/core/site/serve-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Optional catch-all: `/api/sites/<id>/1/` has no path segments at all, and a
// required catch-all does not match it. That is the URL the iframe loads.
type Params = { params: Promise<{ project: string; version: string; path?: string[] }> };

/**
 * The live preview: a built version, served from the workspace.
 *
 * PRD section 9 describes this as "sandbox port to iframe". It is a directory
 * to iframe instead, because the sandbox is destroyed when the task ends and a
 * preview that dies with it is not a preview. What the owner sees is the exact
 * bytes that would be deployed.
 */
export async function GET(_request: Request, { params }: Params) {
  const { project, version, path: segments } = await params;

  try {
    await assertOwnsProject(project);
  } catch {
    return new Response('not found', { status: 404 });
  }

  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) return new Response('not found', { status: 404 });

  return serveFromDirectory(distDir(project, n), segments ?? [], {
    prefix: `/api/sites/${project}/${n}/`,
  });
}
