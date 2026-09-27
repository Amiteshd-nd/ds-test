import type { TaskStatus } from '@/core/types';

import styles from './workbench.module.css';

const LABELS: Record<TaskStatus, string> = {
  queued: 'queued',
  running: 'running',
  awaiting_user: 'needs you',
  succeeded: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function StatusPill({ status, detail }: { status: TaskStatus; detail?: string }) {
  const tone =
    status === 'succeeded'
      ? styles.pillOk
      : status === 'failed' || status === 'cancelled'
        ? styles.pillError
        : status === 'running' || status === 'awaiting_user'
          ? styles.pillRunning
          : '';

  return (
    <span className={`${styles.pill} ${tone}`}>
      {LABELS[status]}
      {detail ? <span className={styles.railItemMeta}>{detail}</span> : null}
    </span>
  );
}
