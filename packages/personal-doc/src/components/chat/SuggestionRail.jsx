import { motion } from '@cloud-march/motion/react';
import { SUGGESTIONS } from '../../lib/portfolioBrain';
import { ICONS } from './iconMap';

/* Recommended openers, as chips.
 *
 * Each chip shows only its short label — "Start here", "Outcomes" — and sends
 * the full question on click. The question itself used to sit under the label
 * as a second line; a chip cannot carry a sentence and stay a chip.
 *
 * That split means the visible text and the action are no longer the same
 * words, so the accessible name carries both. It is built label-first because
 * WCAG 2.5.3 asks that the accessible name *contain* the visible label —
 * "Outcomes" alone would leave a speech-input user saying a word the button
 * does not answer to, and the prompt alone would strand them the other way.
 *
 * One component, two densities: a scrolling row where width is scarce, a
 * wrapping cluster where it is not. Same markup, same data; the layout rule
 * changes, not the component.
 */

export default function SuggestionRail({ onPick, variant = 'grid' }) {
  const rail = variant === 'rail';

  return (
    <div
      className={
        rail
          ? /* Deliberately not centred. On a scroll container `justify-center`
               overflows in both directions, and the overflow past the start
               edge cannot be scrolled back to — the first chip becomes
               unreachable the moment the row is wider than the viewport, which
               on the rail is the normal case. `margin: auto` on the items has
               the same flaw. */
            'lg-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1'
          : 'flex flex-wrap justify-center gap-2'
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
            aria-label={`${s.label}: ${s.prompt}`}
            title={s.prompt}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i + 0.1, type: 'spring', stiffness: 320, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            className={`lg-surface lg-focus group relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-left ${
              rail ? 'shrink-0 scroll-ml-4 snap-start' : ''
            }`}
          >
            <span
              className="lg-hairline"
              style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
            />
            <span className="shrink-0 text-white/45 transition-colors group-hover:text-[color:var(--lg-accent-soft)]">
              <Icon size={15} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-medium text-white/85">
              {s.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
