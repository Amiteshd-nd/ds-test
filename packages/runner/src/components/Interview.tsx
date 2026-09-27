'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion, rise, tokens, useMotionSafe } from '@cloud-march/motion/react';

import { INTERVIEW, type ProfileField } from '@/core/business/profile';

import styles from './workbench.module.css';

type Answers = Partial<Record<ProfileField, string>>;

/**
 * The onboarding interview: six steps, one screen each.
 *
 * Motion is unusually generous here by this app's standards, and it is the one
 * place that earns it. Someone does this once per business, so the frequency
 * gate that keeps the rest of the UI still does not apply; and a step that
 * replaces another in the same box needs to say which direction it came from,
 * which is orientation rather than decoration. `useMotionSafe` collapses the
 * travel and keeps the fade for anyone who has asked for less motion.
 */
export function Interview({
  projectId,
  initial,
  onDone,
  onSkip,
}: {
  projectId: string;
  initial: Answers;
  onDone: (answers: Answers) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  const current = INTERVIEW[step];
  const isLast = step === INTERVIEW.length - 1;

  const variants = useMotionSafe(rise(tokens.distance.step * direction));

  const canAdvance = useMemo(
    () => current.inputs.every((input) => input.optional || (answers[input.field] ?? '').trim()),
    [current, answers],
  );

  const save = useCallback(
    async (next: Answers) => {
      setSaving(true);
      try {
        await fetch(`/api/projects/${projectId}/profile`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
      } finally {
        setSaving(false);
      }
    },
    [projectId],
  );

  const advance = useCallback(async () => {
    // Saved per step, not at the end. Someone who closes the tab on question
    // five should not be asked the first four again.
    await save(answers);
    if (isLast) {
      onDone(answers);
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  }, [answers, isLast, onDone, save]);

  const back = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  return (
    <div className={styles.interview}>
      <div className={styles.interviewHead}>
        <ol className={styles.progress} aria-label={`Step ${step + 1} of ${INTERVIEW.length}`}>
          {INTERVIEW.map((s, i) => (
            <li
              key={s.id}
              className={`${styles.progressDot} ${i <= step ? styles.progressDotDone : ''}`}
              aria-hidden
            />
          ))}
        </ol>
        <button type="button" className={styles.textButton} onClick={onSkip}>
          Skip for now
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={tokens.spring.firm}
        >
          <h2 className={styles.interviewQuestion}>{current.question}</h2>
          <p className={styles.interviewHelp}>{current.help}</p>

          <div className={styles.interviewFields}>
            {current.inputs.map((input) => (
              <div key={input.field} className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={input.field}>
                  {input.label}
                  {input.optional ? <span className={styles.optional}> optional</span> : null}
                </label>

                {input.multiline ? (
                  <textarea
                    id={input.field}
                    className={styles.input}
                    rows={3}
                    value={answers[input.field] ?? ''}
                    placeholder={input.placeholder}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [input.field]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    id={input.field}
                    className={styles.input}
                    value={answers[input.field] ?? ''}
                    placeholder={input.placeholder}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [input.field]: e.target.value }))
                    }
                  />
                )}

                {input.suggestions ? (
                  <div className={styles.suggestions}>
                    {input.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={styles.suggestion}
                        onClick={() => setAnswers((a) => ({ ...a, [input.field]: s }))}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className={styles.interviewFoot}>
        <button
          type="button"
          className={styles.textButton}
          onClick={back}
          disabled={step === 0}
        >
          Back
        </button>
        <span className={styles.hint}>
          {step + 1} of {INTERVIEW.length}
        </span>
        <button
          type="button"
          className={styles.send}
          onClick={() => void advance()}
          disabled={!canAdvance || saving}
        >
          {isLast ? 'Build my page' : 'Next'}
        </button>
      </div>
    </div>
  );
}
