import path from 'node:path';

import { deploymentsRoot } from '@/core/providers/deploy-local';
import { serveFromDirectory } from '@/core/site/serve-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

/**
 * A locally published site.
 *
 * Deliberately not behind the owner check: a published site is meant to be
 * openable by whoever is given the link, and that is the whole point of the
 * step. It is still only reachable from this machine, which is the honest
 * limit of what a local deployment is. Publishing somewhere genuinely public
 * goes through the approval gate in `core/site/deploy.ts`.
 */
export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params;
  const [slug, ...rest] = segments ?? [];
  if (!slug || slug.includes('.') || slug.includes('/')) {
    return new Response('not found', { status: 404 });
  }
  return serveFromDirectory(path.join(deploymentsRoot(), slug), rest, {
    prefix: `/s/${slug}/`,
  });
}
