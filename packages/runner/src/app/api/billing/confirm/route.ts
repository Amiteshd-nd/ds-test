import { NextResponse } from 'next/server';

import { currentUser } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { billingProvider } from '@/core/billing/provider';

export const runtime = 'nodejs';

/**
 * Add credit, locally.
 *
 * Only reachable while `BILLING_PROVIDER=local`. With Stripe the credit comes
 * from the `checkout.session.completed` webhook, because a browser arriving at
 * a success URL means the browser arrived, not that the payment settled - and
 * crediting on a redirect is how an account gets paid for a card that later
 * declines. This refuses rather than quietly becoming free money.
 */
export async function GET(request: Request) {
  const provider = billingProvider();
  if (provider.name !== 'local') {
    return NextResponse.json(
      { error: 'credit is added by the payment webhook, not by this endpoint' },
      { status: 409 },
    );
  }

  const amount = Number(new URL(request.url).searchParams.get('amount') ?? 0);
  if (!(amount > 0) || amount > 500) {
    return NextResponse.json({ error: 'amount must be between 1 and 500' }, { status: 400 });
  }

  const user = await currentUser();
  const balance = getStore().ledger.purchase(user.id, amount, `local:${Date.now()}`);

  return NextResponse.redirect(new URL(`/?credit=${balance.toFixed(2)}`, request.url));
}
