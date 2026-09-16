import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { TYPED_PROMPTS } from '../../lib/portfolioBrain';

/* The hero line: a prompt typing itself, with the untyped remainder showing
 * through as a ghost — the inline-autocomplete look from the reference.
 *
 * It is a real control, not decoration. Clicking it drops that prompt into the
 * input, so the demonstration and the affordance are the same object.
 */

const TYPE_MS = 52;
const ERASE_MS = 22;
const HOLD_MS = 1750;

export default function TypedHeadline({ onPick, paused }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(reduce ? TYPED_PROMPTS[0].length : 0);
  const [erasing, setErasing] = useState(false);
  const timer = useRef(null);

  const phrase = TYPED_PROMPTS[index];

  useEffect(() => {
    if (reduce || paused) return undefined;

    const step = () => {
      if (!erasing) {
        if (count < phrase.length) {
          setCount((c) => c + 1);
          timer.current = setTimeout(step, TYPE_MS);
        } else {
          timer.current = setTimeout(() => setErasing(true), HOLD_MS);
        }
      } else if (count > 0) {
        setCount((c) => c - 1);
        timer.current = setTimeout(step, ERASE_MS);
      } else {
        setErasing(false);
        setIndex((i) => (i + 1) % TYPED_PROMPTS.length);
      }
    };

    timer.current = setTimeout(step, erasing ? ERASE_MS : TYPE_MS);
    return () => clearTimeout(timer.current);
  }, [count, erasing, phrase.length, reduce, paused]);

  const typed = phrase.slice(0, count);
  const ghost = phrase.slice(count);

  return (
    <button
      type="button"
      onClick={() => onPick(phrase)}
      aria-label={`Use this prompt: ${phrase}`}
      className="lg-focus group block w-full rounded-2xl px-2 py-1 text-left"
    >
      <span
        className="block text-[25px] leading-[1.22] text-white sm:text-[30px] md:text-[35px]"
        style={{
          fontFamily: 'var(--lg-font-display)',
          fontWeight: 'var(--lg-display-weight)',
          letterSpacing: 'var(--lg-tracking-tight)',
          textTransform: 'var(--lg-display-transform)',
          textShadow: 'var(--lg-display-shadow)',
        }}
      >
        {typed}
        {!reduce && <span className="lg-caret h-[0.95em]" />}
        <span className="text-white/25 transition-colors group-hover:text-white/35">{ghost}</span>
      </span>
    </button>
  );
}
