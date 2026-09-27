import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const store = getStore();
  return NextResponse.json({
    project: store.getProject(id),
    profile: store.getProfile(id),
    tasks: store.listTasks(id),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const patch = (await request.json().catch(() => ({}))) as Record<string, string>;
  const store = getStore();
  store.updateProfile(id, patch);
  return NextResponse.json({ profile: store.getProfile(id) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  // Rows only. PRD section 10 also requires sandbox files and any deployment to
  // go; there are no deployments until Phase 1, and sandboxes are disposed at
  // the end of every task.
  getStore().deleteProject(id);
  return new NextResponse(null, { status: 204 });
}
