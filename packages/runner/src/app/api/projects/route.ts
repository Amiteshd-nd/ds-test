import { NextResponse } from 'next/server';

import { currentUser } from '@/core/auth';
import { getStore } from '@/core/db/store';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ projects: getStore().listProjects(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  // A project is one business. The empty business profile row is created with
  // it, so Phase 1's onboarding has somewhere to write.
  return NextResponse.json({ project: getStore().createProject(user.id, name) }, { status: 201 });
}
