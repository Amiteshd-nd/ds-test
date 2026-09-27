import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; memory: string }> };

/** Confirm or reject one proposed fact. This is the gate in PRD section 6.6. */
export async function POST(request: Request, { params }: Params) {
  const { id, memory } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { decision?: unknown };
  const decision = body.decision;
  if (decision !== 'confirm' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be confirm or reject' }, { status: 400 });
  }

  const memories = getStore().memories;
  if (decision === 'confirm') await memories.confirm(memory);
  else await memories.reject(memory);

  return NextResponse.json({
    pending: memories.pending(id),
    confirmed: memories.confirmed(id),
  });
}
