import { NextResponse } from 'next/server';
import path from 'node:path';

import { assertOwnsProject } from '@/core/auth';
import { assetsDir, removeAsset } from '@/core/site/assets';
import { serveFromDirectory } from '@/core/site/serve-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; file: string }> };

/** The uploaded file itself, for the thumbnail in the asset list. */
export async function GET(_request: Request, { params }: Params) {
  const { id, file } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return new Response('not found', { status: 404 });
  }
  return serveFromDirectory(assetsDir(id), [path.basename(file)]);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, file } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await removeAsset(id, file);
  return new NextResponse(null, { status: 204 });
}
