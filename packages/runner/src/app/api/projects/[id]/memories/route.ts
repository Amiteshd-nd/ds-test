import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * What the agent has proposed, and what the owner has accepted.
 *
 * Two lists rather than one with a flag, because they mean different things to
 * whoever is reading: the pending list is a queue of decisions, the confirmed
 * list is what every future task will be told.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const memories = getStore().memories;
  return NextResponse.json({
    pending: memories.pending(id),
    confirmed: memories.confirmed(id),
  });
}

/** The owner adding a fact themselves, which arrives already confirmed. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { fact?: unknown };
  const fact = typeof body.fact === 'string' ? body.fact.trim() : '';
  if (!fact) return NextResponse.json({ error: 'fact is required' }, { status: 400 });

  const memories = getStore().memories;
  try {
    const memory = await memories.remember(id, fact, null);
    await memories.confirm(memory.id);
    return NextResponse.json({ memory: { ...memory, confirmed: true } }, { status: 201 });
  } catch (err) {
    // The sensitive-content refusal lands here too, and its message is written
    // to be read by a person.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
