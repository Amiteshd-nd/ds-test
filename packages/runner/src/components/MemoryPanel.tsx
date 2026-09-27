'use client';

import { useCallback, useState } from 'react';
import { motion, rise, staggerChildren, tokens, useMotionSafe } from '@cloud-march/motion/react';

import styles from './workbench.module.css';

export interface StoredFact {
  id: string;
  text: string;
  confirmed: boolean;
  created_at: string;
}

/**
 * The gate in PRD section 6.6, as a screen.
 *
 * Batched rather than blocking: the agent proposes facts as it works and they
 * queue here, so a task is never interrupted to ask whether something is worth
 * remembering. Nothing in the queue reaches a prompt - `recall` returns
 * confirmed rows only - so leaving it unread is safe, which is what makes
 * batching defensible rather than merely convenient.
 *
 * Motion: the pending list animates in, because facts arrive while the reader
 * is watching the transcript rather than this panel, and something appearing
 * silently in a side column goes unnoticed. Accepting or rejecting does not
 * animate: the reader triggered it, they are going down a list, and at that
 * frequency motion is in the way.
 */
export function MemoryPanel({
  projectId,
  pending,
  confirmed,
  onChange,
}: {
  projectId: string;
  pending: StoredFact[];
  confirmed: StoredFact[];
  onChange: (next: { pending: StoredFact[]; confirmed: StoredFact[] }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const item = useMotionSafe(rise());

  const decide = useCallback(
    async (id: string, decision: 'confirm' | 'reject') => {
      setBusy(id);
      try {
        const response = await fetch(`/api/projects/${projectId}/memories/${id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        if (response.ok) onChange(await response.json());
      } finally {
        setBusy(null);
      }
    },
    [projectId, onChange],
  );

  if (pending.length === 0 && confirmed.length === 0) {
    return (
      <section>
        <h2 className={styles.panelHeading}>What Runner knows</h2>
        <p className={styles.placeholder}>
          Facts it picks up about the business collect here for you to confirm. Nothing is used
          until you do.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className={styles.panelHeading}>
        What Runner knows
        {pending.length > 0 ? <span className={styles.badge}>{pending.length} to check</span> : null}
      </h2>

      {pending.length > 0 ? (
        <motion.ul
          className={styles.facts}
          variants={staggerChildren(pending.length)}
          initial="hidden"
          animate="visible"
        >
          {pending.map((fact) => (
            <motion.li
              key={fact.id}
              className={styles.factPending}
              variants={item}
              transition={tokens.spring.firm}
            >
              <p className={styles.factText}>{fact.text}</p>
              <div className={styles.factActions}>
                <button
                  type="button"
                  className={styles.factYes}
                  disabled={busy === fact.id}
                  onClick={() => void decide(fact.id, 'confirm')}
                >
                  That is right
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy === fact.id}
                  onClick={() => void decide(fact.id, 'reject')}
                >
                  No
                </button>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      ) : null}

      {confirmed.length > 0 ? (
        <ul className={styles.facts} style={{ marginTop: pending.length ? 'var(--step)' : 0 }}>
          {confirmed.map((fact) => (
            <li key={fact.id} className={styles.fact}>
              <span className={styles.factText}>{fact.text}</span>
              <button
                type="button"
                className={styles.factForget}
                onClick={() => void decide(fact.id, 'reject')}
                aria-label={`Forget: ${fact.text}`}
                title="Forget this"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
