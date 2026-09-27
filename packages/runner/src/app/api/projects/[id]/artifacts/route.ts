import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { listArtifacts } from '@/core/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ artifacts: await listArtifacts(id) });
}
