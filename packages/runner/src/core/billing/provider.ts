/**
 * Buying credit.
 *
 * `BillingProvider` is the seam PRD section 7 asks for. The local
 * implementation adds credit straight to the ledger and is the one that runs:
 * the whole metering path - grant, hold, spend, settle, refuse, top up - is
 * exercisable without an account, because the money is the last part of it and
 * the least interesting.
 *
 * The Stripe adapter is written and has never run. No account has been
 * authorised (PRD rule 7), and there is a specific reason not to guess at this
 * one: the thing that makes a payment integration correct is webhook handling,
 * and a webhook handler nobody has ever received a webhook for is a guess.
 */

export interface Checkout {
  /** Where to send the owner to pay. */
  url: string;
  /** Our reference, which the webhook carries back. */
  reference: string;
}

export interface BillingProvider {
  readonly name: string;
  /** Start a purchase of `amountUsd` of credit. */
  checkout(userId: string, amountUsd: number): Promise<Checkout>;
}

/**
 * No payment. Credit is added directly and the ledger records where it came
 * from, so a local top-up cannot be mistaken for a real one later.
 */
export class LocalBillingProvider implements BillingProvider {
  readonly name = 'local';

  async checkout(userId: string, amountUsd: number): Promise<Checkout> {
    return {
      url: `/api/billing/confirm?amount=${amountUsd}`,
      reference: `local:${userId}:${Date.now()}`,
    };
  }
}

/**
 * Stripe Checkout. **Written, never run.**
 *
 * Credit is added by the `checkout.session.completed` webhook, not here and not
 * by the browser coming back to a success URL. That is the part people get
 * wrong: a success redirect means the customer's browser reached a page, which
 * is not the same as the payment settling, and treating it as payment is how an
 * account gets credited for a card that later declines.
 *
 * Before this is switched on: the webhook endpoint needs its signature verified
 * against `STRIPE_WEBHOOK_SECRET`, and the handler needs to be idempotent on
 * the event id, because Stripe retries.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe';
  private readonly secretKey: string;
  private readonly origin: string;

  constructor(secretKey: string, origin: string) {
    this.secretKey = secretKey;
    this.origin = origin.replace(/\/$/, '');
  }

  async checkout(userId: string, amountUsd: number): Promise<Checkout> {
    const reference = `credit:${userId}:${Date.now()}`;

    // Form-encoded: Stripe's API does not take JSON.
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `${amountUsd} dollars of Runner credit`,
      'line_items[0][price_data][unit_amount]': String(Math.round(amountUsd * 100)),
      'line_items[0][quantity]': '1',
      success_url: `${this.origin}/?credit=pending`,
      cancel_url: `${this.origin}/`,
      client_reference_id: reference,
      'metadata[user_id]': userId,
      'metadata[amount_usd]': String(amountUsd),
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Stripe deduplicates on this, so a retried request cannot create two
        // sessions for one intent to buy.
        'Idempotency-Key': reference,
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Stripe returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    const session = (await response.json()) as { url?: string };
    if (!session.url) throw new Error('Stripe created a session with no checkout URL');

    return { url: session.url, reference };
  }
}

export function billingProvider(): BillingProvider {
  const choice = process.env.BILLING_PROVIDER ?? 'local';

  if (choice === 'stripe') {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY');
    return new StripeBillingProvider(key, process.env.RUNNER_ORIGIN ?? 'http://localhost:6184');
  }

  if (choice === 'local') return new LocalBillingProvider();

  throw new Error(`unknown BILLING_PROVIDER: ${choice}`);
}
