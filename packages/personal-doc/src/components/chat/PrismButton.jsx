import { memo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { IconHome } from './Icons';

/* The primary CTA, built to the reference: a dark glass pill whose circular
 * icon well is rimmed by a prism ring — a conic spectrum, blurred just enough
 * to read as light refracting through a bevel rather than as a printed border.
 *
 * Three layers do the work:
 *   1. a blurred conic spectrum, oversized, rotating   -> the refraction
 *   2. a crisp conic spectrum at low opacity           -> the hard edge glint
 *   3. an opaque inner disc                            -> punches the well out
 *
 * Hover pushes rotation speed and bloom up on a spring, so it accelerates into
 * motion instead of snapping.
 */

const SPECTRUM =
  'conic-gradient(from 0deg, #ff2d55, #ff9500, #ffd60a, #34c759, #32ade6, #5e5ce6, #bf5af2, #ff2d55)';

// Stable references: the parent re-renders continuously while an answer
// streams, and a fresh `animate` object each time would restart the rotation
// from 0 forever, leaving the ring visually stuck.
const SPIN = { rotate: 360 };
const STILL = {};
const SPIN_FAST = { duration: 2.6, ease: 'linear', repeat: Infinity };
const SPIN_SLOW = { duration: 7, ease: 'linear', repeat: Infinity };
const POP = { type: 'spring', stiffness: 420, damping: 26 };

function PrismButton({
  to = '/',
  label = 'Home',
  icon: Icon = IconHome,
  onClick,
  className = '',
}) {
  const [hover, setHover] = useState(false);
  const reduce = useReducedMotion();

  const spin = reduce ? STILL : SPIN;
  const spinTransition = hover ? SPIN_FAST : SPIN_SLOW;

  const content = (
    <motion.span
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      whileTap={{ scale: 0.97 }}
      animate={{ scale: hover ? 1.02 : 1 }}
      transition={POP}
      className={`lg-surface lg-focus relative inline-flex items-center gap-3 rounded-full py-2 pl-2 pr-5 ${className}`}
    >
      <span className="lg-hairline" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.04))' }} />

      {/* icon well */}
      <span className="relative grid h-11 w-11 shrink-0 place-items-center">
        {/* 1 — refracted bloom */}
        <motion.span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            inset: -5,
            background: SPECTRUM,
            filter: `blur(${hover ? 9 : 6}px)`,
            opacity: hover ? 1 : 0.8,
          }}
          animate={spin}
          transition={spinTransition}
        />
        {/* 2 — hard glint */}
        <motion.span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ inset: -1.5, background: SPECTRUM, opacity: hover ? 0.75 : 0.5 }}
          animate={spin}
          transition={spinTransition}
        />
        {/* 3 — the well itself */}
        <span
          className="absolute inset-0 grid place-items-center rounded-full"
          style={{
            background: 'radial-gradient(120% 120% at 50% 0%, #26262c 0%, #121216 60%, #0d0d10 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), inset 0 -2px 6px rgba(0,0,0,.7)',
          }}
        >
          <Icon size={19} className="text-white" />
        </span>
      </span>

      <span className="text-[15px] font-medium tracking-[-0.01em] text-white/90">{label}</span>
    </motion.span>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="appearance-none bg-transparent p-0">
        {content}
      </button>
    );
  }

  return <Link to={to} aria-label={label}>{content}</Link>;
}

// The page around it re-renders on every streaming tick; this does not need to.
export default memo(PrismButton);
