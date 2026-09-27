'use client';

import { useCallback, useState } from 'react';

import styles from './workbench.module.css';

export interface CreditState {
  balance_usd: number;
  plan: { id: string; label: string; monthly_grant_usd: number; max_tasks_per_day: number };
  used_today: number;
  provider: string;
}

/**
 * What is left, and what happens when it runs out.
 *
 * Shown before it matters rather than only when a task is refused. PRD section
 * 10 asks for a "hard stop + user notice"; the stop is enforced in the ledger,
 * and this is the part that stops the stop being a surprise.
 *
 * The bar is plain width rather than anything animated. It changes when a task
 * ends, which is a moment the reader is already watching something else, and a
 * balance sliding down is the wrong thing to draw the eye to.
 */
export function Credit({
  credit,
  onChange,
}: {
  credit: CreditState;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grant = credit.plan.monthly_grant_usd;
  const share = grant > 0 ? Math.max(0, Math.min(1, credit.balance_usd / grant)) : 1;
  const low = grant > 0 && credit.balance_usd < grant * 0.2;

  const topUp = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_usd: 10 }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setError(body.error ?? 'could not start that');
        return;
      }
      // Local provider returns a confirm link; Stripe returns a checkout page.
      window.location.href = body.url;
    } finally {
      setBusy(false);
      onChange();
    }
  }, [onChange]);

  return (
    <section>
      <h2 className={styles.panelHeading}>Credit</h2>

      <div className={styles.creditRow}>
        <span className={`${styles.meterValue} ${low ? styles.warn : ''}`}>
          ${credit.balance_usd.toFixed(2)}
        </span>
        <span className={styles.hint}>
          {credit.plan.label}
          {grant > 0 ? ` · $${grant.toFixed(0)} a month` : ''}
        </span>
      </div>

      {grant > 0 ? (
        <div className={styles.creditTrack} aria-hidden>
          <div className={styles.creditFill} style={{ width: `${share * 100}%` }} />
        </div>
      ) : null}

      <p className={styles.creditNote}>
        {credit.balance_usd <= 0
          ? 'Nothing left. Free credit resets at the start of next month.'
          : `${credit.used_today} of ${credit.plan.max_tasks_per_day} tasks today.`}
      </p>

      <button type="button" className={styles.textButton} onClick={() => void topUp()} disabled={busy}>
        {busy ? 'Opening…' : 'Add $10'}
      </button>

      {credit.provider === 'local' ? (
        <p className={styles.creditNote}>
          <span className={styles.warn}>No payment is taken.</span> Credit is added straight to
          the ledger on this machine.
        </p>
      ) : null}

      {error ? <p className={styles.warn}>{error}</p> : null}
    </section>
  );
}
