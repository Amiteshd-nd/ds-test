'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion, rise, staggerChildren, tokens, useMotionSafe } from '@cloud-march/motion/react';

import type { OutwardAction } from '@/core/growth/actions';

import styles from './workbench.module.css';

export interface QueueItem {
  id: string;
  label: string;
  summary: string;
  action: OutwardAction;
  status: 'pending' | 'approved' | 'rejected';
  scheduled_for: string | null;
  created_at: string;
  executed_at: string | null;
  error: string | null;
  sent_externally: boolean | null;
}

/**
 * The content calendar, and the approval gate as the owner sees it.
 *
 * Three groups, in the order somebody actually works through them: what needs a
 * decision, what is waiting for its time, and what has happened. Everything
 * else about this screen follows from one fact - approving is the moment
 * something becomes irreversible - so the full text is shown before the button,
 * never behind an expander, and the button says what it will do.
 *
 * Motion: items animate in, because they arrive while the reader is watching
 * the transcript. Deciding does not animate; you are going down a list.
 */
export function Calendar({
  projectId,
  items,
  onChange,
}: {
  projectId: string;
  items: QueueItem[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const item = useMotionSafe(rise());

  const decide = useCallback(
    async (id: string, decision: 'approve' | 'reject', scheduledFor?: string | null) => {
      setBusy(id);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/queue/${id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision, scheduled_for: scheduledFor ?? undefined }),
        });
        const body = (await response.json()) as { error?: string; reason?: string };
        if (!response.ok) setError(body.error ?? 'that did not work');
        else if (body.reason) setError(body.reason);
        onChange();
      } finally {
        setBusy(null);
      }
    },
    [projectId, onChange],
  );

  const groups = useMemo(() => {
    const waiting = items.filter((i) => i.status === 'pending');
    const scheduled = items.filter(
      (i) => i.status === 'approved' && !i.executed_at && i.scheduled_for,
    );
    const done = items.filter((i) => i.executed_at || i.status === 'rejected');
    return { waiting, scheduled, done };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nothing queued.</p>
        <p>
          Ask for some posts or a cold email and the drafts land here. Nothing is ever sent
          until you approve it, one item at a time.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.calendar}>
      {error ? <p className={styles.warn}>{error}</p> : null}

      {groups.waiting.length > 0 ? (
        <section>
          <h2 className={styles.panelHeading}>
            Waiting for you
            <span className={styles.badge}>{groups.waiting.length}</span>
          </h2>

          <motion.ul
            className={styles.queue}
            variants={staggerChildren(groups.waiting.length)}
            initial="hidden"
            animate="visible"
          >
            {groups.waiting.map((queued) => (
              <motion.li
                key={queued.id}
                className={styles.queued}
                variants={item}
                transition={tokens.spring.firm}
              >
                <div className={styles.queuedHead}>
                  <span className={styles.queuedLabel}>{queued.label}</span>
                  {queued.scheduled_for ? (
                    <span className={styles.hint}>{when(queued.scheduled_for)}</span>
                  ) : null}
                </div>

                {/* The whole thing, never truncated. Approving is the
                    irreversible moment; nobody should have to expand
                    something to see what they are agreeing to. */}
                <pre className={styles.queuedBody}>{fullText(queued.action)}</pre>

                <div className={styles.factActions}>
                  <button
                    type="button"
                    className={styles.factYes}
                    disabled={busy === queued.id}
                    onClick={() => void decide(queued.id, 'approve')}
                  >
                    {queued.scheduled_for ? 'Approve for that time' : 'Send it'}
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={busy === queued.id}
                    onClick={() => void decide(queued.id, 'reject')}
                  >
                    Throw it away
                  </button>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      ) : null}

      {groups.scheduled.length > 0 ? (
        <section>
          <h2 className={styles.panelHeading}>Approved, waiting for its time</h2>
          <ul className={styles.queue}>
            {groups.scheduled.map((queued) => (
              <li key={queued.id} className={styles.queuedQuiet}>
                <div className={styles.queuedHead}>
                  <span className={styles.queuedLabel}>{queued.label}</span>
                  <span className={styles.hint}>{when(queued.scheduled_for)}</span>
                </div>
                <p className={styles.factText}>{queued.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.done.length > 0 ? (
        <section>
          <h2 className={styles.panelHeading}>Done</h2>
          <ul className={styles.queue}>
            {groups.done.map((queued) => (
              <li key={queued.id} className={styles.queuedQuiet}>
                <div className={styles.queuedHead}>
                  <span className={styles.queuedLabel}>{queued.label}</span>
                  <span className={queued.error ? styles.warn : styles.hint}>
                    {queued.error
                      ? queued.error
                      : queued.status === 'rejected'
                        ? 'thrown away'
                        : queued.sent_externally
                          ? `sent ${when(queued.executed_at)}`
                          : `recorded ${when(queued.executed_at)}, not actually sent`}
                  </span>
                </div>
                <p className={styles.factText}>{queued.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Exactly what would go out, including the lines the law requires on an email. */
function fullText(action: OutwardAction): string {
  if (action.kind === 'social_post') {
    const parts = [action.text];
    if (action.link) parts.push(action.link);
    if (action.hashtags?.length) parts.push(action.hashtags.map((t) => `#${t}`).join(' '));
    return parts.join('\n\n');
  }
  return [
    `To: ${action.to}`,
    `Subject: ${action.subject}`,
    '',
    action.body,
    '',
    action.from_identity,
    action.opt_out,
  ].join('\n');
}

function when(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  const days = Math.round((at.getTime() - Date.now()) / 86_400_000);
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (days === 0) return `today, ${time}`;
  if (days === 1) return `tomorrow, ${time}`;
  if (days === -1) return `yesterday, ${time}`;
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}
