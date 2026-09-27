import { NextResponse } from 'next/server';

import { currentUser } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { billingProvider } from '@/core/billing/provider';
import { planFor } from '@/core/billing/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The balance, the plan, and where the credit went. */
export async function GET() {
  const user = await currentUser();
  const store = getStore();
  const plan = planFor(user.plan);

  // The monthly grant, if this month's has not been given. Idempotent.
  store.ledger.grantMonthly(user.id, plan);

  return NextResponse.json({
    plan,
    balance_usd: store.ledger.balance(user.id),
    history: store.ledger.history(user.id, 30),
    provider: billingProvider().name,
    used_today: store.countTasksSince(
      user.id,
      new Date(Date.now() - 86_400_000).toISOString(),
    ),
  });
}

/** Start a purchase. Locally this returns a confirm link rather than a checkout. */
export async function POST(request: Request) {
  const user = await currentUser();
  const body = (await request.json().catch(() => ({}))) as { amount_usd?: unknown };
  const amount = typeof body.amount_usd === 'number' ? body.amount_usd : 0;

  if (!(amount > 0) || amount > 500) {
    return NextResponse.json({ error: 'pick an amount between 1 and 500 dollars' }, { status: 400 });
  }

  try {
    const checkout = await billingProvider().checkout(user.id, amount);
    return NextResponse.json(checkout);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
