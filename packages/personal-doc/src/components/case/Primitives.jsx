import { motion, useReducedMotion, duration, ease } from '@cloud-march/motion/react';
import { useEnter } from './useEnter';

/*
 * The small pieces every 2.0 case study is assembled from.
 *
 * Motion weighting for these pages is Jakub primary (production polish, the
 * animation should go unnoticed), Jhey selective, and Emil's frequency gate on
 * everything: a reading surface triggers each of these exactly once, which is
 * the only reason any of it is allowed to move at all.
 *
 * The shared enter recipe lives in `useEnter.js`.
 */

/** A titled band of the page. `kicker` is the running label in the margin. */
export function Section({ id, kicker, title, intro, children, wide = false, className = '' }) {
  const enter = useEnter();

  return (
    <motion.section id={id} {...enter} className={`case-shell pt-16 sm:pt-24 ${className}`}>
      <div className={wide ? 'case-wide' : 'case-column'}>
        {(kicker || title) && (
          <header className="mb-7 sm:mb-10">
            {kicker && <p className="case-kicker mb-3">{kicker}</p>}
            {title && <h2 className="case-h2">{title}</h2>}
            {intro && <p className="case-body mt-4">{intro}</p>}
          </header>
        )}
        {children}
      </div>
    </motion.section>
  );
}

/** A hairline that draws itself across once, left to right. */
export function DrawnRule({ accent = false, className = '' }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      aria-hidden="true"
      initial={reduced ? false : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: duration.slow, ease: ease.out }}
      style={{
        originX: 0,
        height: accent ? 2 : 1,
        background: accent ? 'var(--accent)' : 'var(--rule)',
      }}
      className={`w-full ${className}`}
    />
  );
}

/** Label over value. The spine of the metadata grid and the impact table. */
export function Field({ label, value, note }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="case-kicker">{label}</dt>
      <dd className="text-[15px] leading-[1.4] tracking-[-0.01em] text-[var(--ink)]">
        {value}
        {note && <span className="case-caption block mt-1">{note}</span>}
      </dd>
    </div>
  );
}

/** A pull quote sized to interrupt the reading rhythm without shouting. */
export function Pull({ children, cite }) {
  return (
    <figure className="my-8 sm:my-10 border-l-2 border-[var(--accent)] pl-5 sm:pl-6">
      <blockquote className="font-[Roboto_Slab,serif] text-[19px] sm:text-[23px] leading-[1.34] tracking-[-0.025em] text-[var(--ink)]">
        {children}
      </blockquote>
      {cite && <figcaption className="case-caption mt-3">{cite}</figcaption>}
    </figure>
  );
}

/** A quiet aside. Used for provenance and for the things worth admitting. */
export function Aside({ label = 'Note', children }) {
  return (
    <div className="case-panel case-panel--sunk mt-6 p-4 sm:p-5">
      <p className="case-kicker mb-2">{label}</p>
      <p className="case-body text-[15px]">{children}</p>
    </div>
  );
}
