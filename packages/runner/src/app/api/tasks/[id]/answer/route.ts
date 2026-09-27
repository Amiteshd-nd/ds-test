import { NextResponse } from 'next/server';

import { getRun } from '@/core/agent/bus';
import { getStore } from '@/core/db/store';
import { assertOwnsProject } from '@/core/auth';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Answer the question an `ask_user` call is parked on. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const task = getStore().getTask(id);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    await assertOwnsProject(task.project_id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const run = getRun(id);
  if (!run?.pendingQuestion) {
    return NextResponse.json({ error: 'this task is not waiting on an answer' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (!answer) return NextResponse.json({ error: 'answer is required' }, { status: 400 });

  run.pendingQuestion.resolve(answer);
  return NextResponse.json({ ok: true });
}
