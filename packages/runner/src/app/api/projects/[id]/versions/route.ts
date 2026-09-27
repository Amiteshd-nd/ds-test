import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { listVersions, previewUrl } from '@/core/site/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Every version of this project's site, newest first. This is also the undo list. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const versions = await listVersions(id);
  return NextResponse.json({
    versions: versions.map((v) => ({ ...v, preview_url: previewUrl(id, v.version) })),
  });
}
