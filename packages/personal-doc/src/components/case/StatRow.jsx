import { motion, useReducedMotion, duration, ease, staggerFor } from '@cloud-march/motion/react';

/*
 * The outcome band.
 *
 * Deliberately not animated numbers. A count-up is the most requested and least
 * defensible effect on a page like this: it is noticeable (which fails Jakub's
 * bar), it withholds the one thing the reader came for for most of a second,
 * and the number is not changing in response to anything. What moves instead is
 * the rule above each figure, which draws left to right and leads the eye across
 * the row. That is the job motion actually has here.
 *
 * Every figure carries its own provenance. A portfolio number without a source
 * is a claim, and the reader has no way to weigh it.
 */

const PROVENANCE = {
  shipped: 'Shipped',
  measured: 'Measured',
  modelled: 'Modelled',
};

export default function StatRow({ stats }) {
  const reduced = useReducedMotion();
  const step = staggerFor(stats.length, 0.36);

  return (
    <ul className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 sm:gap-x-8 list-none p-0 m-0">
      {stats.map((stat, i) => (
        <li key={stat.label} className="flex flex-col">
          <motion.div
            aria-hidden="true"
            initial={reduced ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: duration.slow, ease: ease.out, delay: i * step }}
            style={{ originX: 0, background: 'var(--accent)' }}
            className="h-[2px] w-full mb-4"
          />

          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: duration.gentle, ease: ease.out, delay: i * step + 0.06 }}
          >
            <p className="case-data text-[30px] sm:text-[38px] leading-[1] tracking-[-0.04em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="case-body text-[14px] leading-[1.4] mt-2.5 max-w-[22ch]">{stat.label}</p>
            {stat.source && (
              <p className="case-kicker mt-2.5 text-[10px]">
                {PROVENANCE[stat.source] || stat.source}
              </p>
            )}
          </motion.div>
        </li>
      ))}
    </ul>
  );
}
