import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { actionOf, execute } from '@/core/growth/gate';
import { describeAction } from '@/core/growth/actions';
import { growthProviders } from '@/core/providers/registry';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; approval: string }> };

/**
 * The owner's decision on one queued action.
 *
 * Approving is the logged approval PRD section 9 requires, and it is the only
 * thing that makes the action executable - `execute` refuses a row that is not
 * approved, so there is no path around this endpoint.
 *
 * An approved item with no scheduled time is due immediately, so it is executed
 * here rather than waiting up to a minute for the ticker. Either path goes
 * through the same gate, and the gate's conditional claim is what stops them
 * both firing it.
 */
export async function POST(request: Request, { params }: Params) {
  const { id, approval } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const store = getStore();
  const row = store.getApproval(approval);
  if (!row || row.project_id !== id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (row.executed_at) {
    return NextResponse.json({ error: 'that has already gone out' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    decision?: unknown;
    scheduled_for?: unknown;
  };

  if (body.decision === 'reschedule') {
    const when = typeof body.scheduled_for === 'string' ? body.scheduled_for : null;
    if (when && Number.isNaN(Date.parse(when))) {
      return NextResponse.json({ error: 'scheduled_for is not a date' }, { status: 400 });
    }
    store.rescheduleApproval(approval, when ? new Date(when).toISOString() : null);
    return NextResponse.json({ ok: true });
  }

  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json(
      { error: 'decision must be approve, reject or reschedule' },
      { status: 400 },
    );
  }

  if (body.decision === 'reject') {
    store.decideApproval(approval, 'rejected');
    return NextResponse.json({ ok: true, executed: false });
  }

  if (typeof body.scheduled_for === 'string' && body.scheduled_for) {
    if (Number.isNaN(Date.parse(body.scheduled_for))) {
      return NextResponse.json({ error: 'scheduled_for is not a date' }, { status: 400 });
    }
    store.rescheduleApproval(approval, new Date(body.scheduled_for).toISOString());
  }

  store.decideApproval(approval, 'approved');

  const after = store.getApproval(approval)!;
  if (after.scheduled_for && Date.parse(after.scheduled_for) > Date.now()) {
    return NextResponse.json({
      ok: true,
      executed: false,
      scheduled_for: after.scheduled_for,
    });
  }

  let providers;
  try {
    providers = growthProviders();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const outcome = await execute(approval, { store, db: store.connection, providers });
  return NextResponse.json({
    ok: outcome.ok,
    executed: outcome.ok,
    reason: outcome.reason,
    label: describeAction(actionOf(row)),
    sent_externally: outcome.result ? !outcome.result.local : false,
  });
}
