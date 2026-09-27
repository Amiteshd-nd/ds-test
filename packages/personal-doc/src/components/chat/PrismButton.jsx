import { memo, useState } from 'react';
import { motion } from '@cloud-march/motion/react';
import { Link } from 'react-router-dom';
import { IconHome } from './Icons';

/* The primary CTA, built to the reference: a dark glass pill whose circular
 * icon well is rimmed by a prism ring — a conic spectrum, blurred just enough
 * to read as light refracting through a bevel rather than as a printed border.
 *
 * Three layers do the work:
 *   1. a blurred conic spectrum, oversized   -> the refraction
 *   2. a crisp conic spectrum at low opacity -> the hard edge glint
 *   3. an opaque inner disc                  -> punches the well out
 *
 * Whether the ring moves is the theme's call, not this component's. It is a
 * plain `animation` shorthand in a token, so a theme that says nothing gets a
 * still ring. Original sweeps its two layers — the gradient's centre travels,
 * the layer does not turn — at periods that do not divide into each other.
 * See --lg-ring-motion, and the sweep note in liquid-glass.css where the
 * keyframes and the reduced-motion override live.
 *
 * What it must never go back to is one layer turning at a constant rate:
 * that reads as a spinner, and a spinner in a fixed header says the page is
 * loading when it is not.
 *
 * The spectrum, its blur radius and the well are all tokens, so a flat theme
 * gets the same three layers with a hard four-stop wheel and no bloom, and the
 * Original theme gets a polished-steel wheel — the component's structure is
 * the constant, its material is not.
 */

const POP = { type: 'spring', stiffness: 420, damping: 26 };

/* The bloom lifts on hover rather than snapping to it. Opacity and blur only:
 * nothing moves, so this stays appropriate under reduced motion. */
const BLOOM = 'opacity 180ms ease-out, filter 180ms ease-out';

function PrismButton({
  to = '/',
  label = 'Home',
  icon: Icon = IconHome,
  onClick,
  showLabel = true,
  className = '',
  ...rest
}) {
  const [hover, setHover] = useState(false);

  const content = (
    <motion.span
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      whileTap={{ scale: 0.97 }}
      animate={{ scale: hover ? 1.02 : 1 }}
      transition={POP}
      className={`lg-surface lg-focus relative inline-flex items-center gap-3 rounded-full py-2 ${
        showLabel ? 'pl-2 pr-5' : 'px-2'
      } ${className}`}
      /* The pill reads its own tokens rather than `lg-surface`'s directly, and
         they are all off: a round surface behind a round bezel only ever comes
         out as a band around it. `border` is in the set because `lg-surface`
         paints one too, and in the bordered themes that ring was the loudest
         part of what had to go. See --lg-pill-* in themes.css. */
      style={{
        background: 'var(--lg-pill-bg)',
        border: 'var(--lg-pill-border)',
        boxShadow: 'var(--lg-pill-shadow)',
        backdropFilter: 'var(--lg-pill-blur)',
        WebkitBackdropFilter: 'var(--lg-pill-blur)',
      }}
    >
      <span
        className="lg-hairline"
        style={{
          display: 'var(--lg-pill-hairline)',
          background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))',
        }}
      />

      {/* icon well */}
      <span className="relative grid h-11 w-11 shrink-0 place-items-center">
        {/* 1 — refracted bloom */}
        <span
          aria-hidden="true"
          className="lg-ring-layer absolute rounded-full"
          style={{
            inset: 'var(--lg-bloom-inset)',
            /* `backgroundImage`, not `background`. The shorthand resets every
               other background longhand, so pairing it with backgroundSize
               here made React warn and let the two fight on re-render. */
            backgroundImage: 'var(--lg-bloom-image)',
            backgroundSize: 'var(--lg-bloom-bg-size)',
            filter: `blur(var(${
              hover ? '--lg-spectrum-blur-hover' : '--lg-spectrum-blur'
            })) contrast(var(--lg-bloom-contrast)) saturate(var(--lg-bloom-saturate))`,
            opacity: `var(${hover ? '--lg-bloom-opacity-hover' : '--lg-bloom-opacity'})`,
            mixBlendMode: 'var(--lg-bloom-blend)',
            transition: BLOOM,
            animation: 'var(--lg-bloom-motion)',
          }}
        />
        {/* 2 — hard glint */}
        <span
          aria-hidden="true"
          className="lg-ring-layer absolute rounded-full"
          style={{
            inset: 'var(--lg-ring-inset)',
            backgroundImage: 'var(--lg-spectrum)',
            backgroundSize: 'var(--lg-ring-bg-size)',
            /* A theme may paint the ring as several layers — Original splits
               the colour channels — so they need recombining. */
            backgroundBlendMode: 'var(--lg-ring-blend)',
            opacity: `var(${hover ? '--lg-ring-opacity-hover' : '--lg-ring-opacity'})`,
            transition: BLOOM,
            animation: 'var(--lg-ring-motion)',
          }}
        />
        {/* 3 — the well itself */}
        <span
          className="absolute inset-0 grid place-items-center rounded-full"
          style={{
            background: 'var(--lg-well-fill)',
            boxShadow: 'var(--lg-well-shadow)',
          }}
        >
          <Icon size={19} style={{ color: 'var(--lg-on-well)', filter: 'var(--lg-well-emboss)' }} />
        </span>
      </span>

      {showLabel && (
        <span
          className="text-[15px] text-white/90"
          style={{ fontWeight: 'var(--lg-weight-strong)', letterSpacing: 'var(--lg-tracking-tight)' }}
        >
          {label}
        </span>
      )}
    </motion.span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={showLabel ? undefined : label}
        className="appearance-none bg-transparent p-0"
        {...rest}
      >
        {content}
      </button>
    );
  }

  return <Link to={to} aria-label={label} {...rest}>{content}</Link>;
}

// The page around it re-renders on every streaming tick; this does not need to.
export default memo(PrismButton);
