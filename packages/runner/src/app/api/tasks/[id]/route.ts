import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** The durable view of a task: what the UI renders on a cold load or a refresh. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  const task = store.getTask(id);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    await assertOwnsProject(task.project_id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    task,
    steps: store.listSteps(id),
    artifacts: store.listArtifacts(id),
  });
}
