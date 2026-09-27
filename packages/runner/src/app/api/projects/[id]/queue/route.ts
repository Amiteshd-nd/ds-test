import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { actionOf } from '@/core/growth/gate';
import { describeAction, summariseAction } from '@/core/growth/actions';
import { ensureScheduler } from '@/core/growth/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The content calendar: everything queued, scheduled, sent or rejected. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await ensureScheduler();

  const items = getStore()
    .listApprovals(id)
    .map((row) => {
      const action = actionOf(row);
      return {
        id: row.id,
        label: describeAction(action),
        summary: summariseAction(action),
        action,
        status: row.status,
        scheduled_for: row.scheduled_for,
        created_at: row.created_at,
        executed_at: row.executed_at,
        error: row.error,
        // Whether it actually left the machine, which is not the same thing as
        // whether it was executed.
        sent_externally: row.result_json
          ? !(JSON.parse(row.result_json) as { local?: boolean }).local
          : null,
      };
    });

  return NextResponse.json({ items });
}
