'use client';

import { motion, rise, tokens, useMotionSafe } from '@cloud-march/motion/react';

import { describeTool } from '@/core/agent/tool-labels';
import type { TaskStep } from '@/core/types';

import styles from './workbench.module.css';

/**
 * One line per step, appended as the run goes.
 *
 * Motion: entrance only, opacity plus an 8px rise on `tokens.spring.firm`.
 * Steps arrive while the reader is looking somewhere else on the page, and the
 * movement is what tells them something new landed — that is orientation, which
 * is a reason to animate. There is no exit animation because steps never leave,
 * and no hover motion because a log line is not a control.
 *
 * `useMotionSafe` strips the travel and keeps the fade when the reader has asked
 * for reduced motion, so nothing appears without warning.
 */
export function StepCard({ step }: { step: TaskStep }) {
  const variants = useMotionSafe(rise());
  const { label } = step.kind === 'tool' ? describeTool(step.name) : { label: 'Thinking' };

  const tone =
    step.status === 'ok'
      ? styles.stepDotOk
      : step.status === 'error'
        ? styles.stepDotError
        : '';

  const elapsed =
    step.finished_at && step.started_at
      ? Date.parse(step.finished_at) - Date.parse(step.started_at)
      : null;

  return (
    <motion.div
      className={`${styles.step} ${step.status === 'error' ? styles.stepError : ''}`}
      variants={variants}
      initial="hidden"
      animate="visible"
      transition={tokens.spring.firm}
    >
      <span className={`${styles.stepDot} ${tone}`} aria-hidden />
      <span className={styles.stepName}>{label}</span>
      <span className={`${styles.stepDetail} mono`}>{detailOf(step)}</span>
      {elapsed !== null ? (
        <span className={styles.stepTiming}>{formatMs(elapsed)}</span>
      ) : null}
    </motion.div>
  );
}

function detailOf(step: TaskStep): string {
  if (step.status === 'error' && step.error) return firstLine(step.error);
  if (step.kind === 'llm') {
    return step.tokens_in || step.tokens_cached
      ? `${step.tokens_in + step.tokens_cached} in · ${step.tokens_out} out`
      : '';
  }
  // The input is what a reader wants to see for a tool call: the command, the
  // path. The output is usually long and already summarised by the next turn.
  if (!step.input_ref) return '';
  try {
    const input = JSON.parse(step.input_ref) as Record<string, unknown>;
    const interesting = input.command ?? input.path ?? input.question;
    return typeof interesting === 'string' ? interesting : step.input_ref;
  } catch {
    return step.input_ref;
  }
}

const firstLine = (s: string) => s.split('\n')[0] ?? '';

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
