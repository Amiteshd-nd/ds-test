import { motion } from '@cloud-march/motion/react';
import { SUGGESTIONS } from '../../lib/portfolioBrain';
import { ICONS } from './iconMap';

/* Recommended openers.
 *
 * One component, two densities — a snapping horizontal rail where width is
 * scarce, a two-column grid where it is not. Same markup, same data; the
 * layout rule changes, not the component. (Airbnb's DLS calls this the
 * "universal" principle: adapt the system, do not fork it.)
 */

export default function SuggestionRail({ onPick, variant = 'grid' }) {
  const rail = variant === 'rail';

  return (
    <div
      className={
        rail
          ? 'lg-rail -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1'
          : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3'
      }
      role="list"
      aria-label="Suggested questions"
    >
      {SUGGESTIONS.map((s, i) => {
        const Icon = ICONS[s.icon];
        return (
          <motion.button
            key={s.prompt}
            type="button"
            role="listitem"
            onClick={() => onPick(s.prompt)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i + 0.1, type: 'spring', stiffness: 320, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            className={`lg-surface lg-focus group relative flex items-start gap-3 rounded-2xl p-3.5 text-left ${
              rail ? 'w-[228px] shrink-0 scroll-ml-4 snap-start' : ''
            }`}
          >
            <span
              className="lg-hairline"
              style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
            />
            <span className="mt-0.5 shrink-0 text-white/45 transition-colors group-hover:text-[color:var(--lg-accent-soft)]">
              <Icon size={17} />
            </span>
            <span className="min-w-0">
              <span
                data-lg-kicker=""
                className="block text-[11px] font-medium uppercase tracking-[0.1em] text-white/35"
              >
                {s.label}
              </span>
              <span className="mt-1 block text-[14px] leading-snug text-white/85">{s.prompt}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
