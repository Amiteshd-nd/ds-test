import { useMemo, useState, useId } from 'react';
import { motion, useReducedMotion, ease } from '@cloud-march/motion/react';

/*
 * The FMCSA log graph: four duty rows across twenty four hours.
 *
 * Drawn in ink, not in colour, because that is what the artefact actually is.
 * The paper log a driver has kept since 1938 is a black step line on a printed
 * grid, and every ELD on the market redraws it. Giving each duty status its own
 * hue would be inventing a categorical palette for a single series, which is the
 * classic chart mistake: identity here comes from vertical position and from the
 * row label, so it survives greyscale, print and every form of colour blindness.
 *
 * The one accent on the chart marks the single event the case study is about.
 * Spending the page's only colour on the thing being argued is the whole point
 * of rationing it.
 */

const ROWS = [
  { key: 'OFF', label: 'Off duty' },
  { key: 'SB', label: 'Sleeper' },
  { key: 'D', label: 'Driving' },
  { key: 'ON', label: 'On duty' },
];

const W = 760;
const H = 208;
const PAD_L = 62;
const PAD_R = 16;
const PLOT_T = 44;
const ROW_H = 36;
const PLOT_W = W - PAD_L - PAD_R;

const xOf = (hour) => PAD_L + (hour / 24) * PLOT_W;
const yOf = (key) => PLOT_T + ROWS.findIndex((r) => r.key === key) * ROW_H + ROW_H / 2;

const clock = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const span = (a, b) => {
  const m = Math.round((b - a) * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return hh ? `${hh}h ${mm ? `${mm}m` : ''}`.trim() : `${mm}m`;
};

export default function DutyLogGraph({ entries, event, caption }) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(null);
  const titleId = useId();

  const segments = useMemo(
    () =>
      entries.slice(0, -1).map((e, i) => ({
        ...e,
        end: entries[i + 1].start,
        row: ROWS.find((r) => r.key === e.status),
      })),
    [entries],
  );

  const path = useMemo(() => {
    let d = '';
    segments.forEach((s, i) => {
      const y = yOf(s.status);
      if (i === 0) d += `M ${xOf(s.start)} ${y}`;
      else d += ` L ${xOf(s.start)} ${y}`;
      d += ` L ${xOf(s.end)} ${y}`;
    });
    return d;
  }, [segments]);

  const active = hovered != null ? segments[hovered] : null;

  return (
    <figure className="case-figure p-3 sm:p-5">
      {/* Twenty four columns and four labelled rows have a floor below which the
          axis stops being readable. Rather than shrink the type past legibility
          on a phone, the grid keeps its width and the reader swipes. The table
          below is the non-scrolling way through. */}
      <div className="overflow-x-auto scrollbar-hide">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto block w-full min-w-[540px]"
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            A twenty four hour duty log. {segments.map((s) => `${clock(s.start)} ${s.row.label}`).join(', ')}.
          </title>

          {/* Hour grid. Recessive by construction: hairlines at 0.5px equivalent,
              a slightly stronger rule every three hours to anchor the eye. */}
          {Array.from({ length: 25 }, (_, h) => (
            <line
              key={h}
              x1={xOf(h)}
              x2={xOf(h)}
              y1={PLOT_T}
              y2={PLOT_T + ROWS.length * ROW_H}
              stroke="var(--rule)"
              strokeWidth={h % 3 === 0 ? 1 : 0.5}
            />
          ))}

          {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
            <text
              key={h}
              x={xOf(h)}
              y={PLOT_T - 14}
              textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
              fill="var(--ink-3)"
              style={{ fontFamily: "'Roboto Mono', monospace", fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}
            >
              {String(h).padStart(2, '0')}
            </text>
          ))}

          {/* Rows */}
          {ROWS.map((r, i) => {
            const y = PLOT_T + i * ROW_H;
            return (
              <g key={r.key}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--rule)" strokeWidth="1" />
                <text
                  x={PAD_L - 12}
                  y={y + ROW_H / 2 + 3.5}
                  textAnchor="end"
                  fill={active && active.status === r.key ? 'var(--ink)' : 'var(--ink-3)'}
                  style={{
                    fontFamily: "'Roboto Mono', monospace",
                    fontSize: '9.5px',
                    letterSpacing: '0.12em',
                    transition: 'fill 180ms cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                  {r.key}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PLOT_T + ROWS.length * ROW_H}
            y2={PLOT_T + ROWS.length * ROW_H}
            stroke="var(--rule-strong)"
            strokeWidth="1"
          />

          {/* The event this page is about. */}
          {event && (
            <g>
              <line
                x1={xOf(event.at)}
                x2={xOf(event.at)}
                y1={PLOT_T - 4}
                y2={PLOT_T + ROWS.length * ROW_H + 4}
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle cx={xOf(event.at)} cy={yOf(event.status)} r="4.5" fill="var(--accent)" />
            </g>
          )}

          {/* The log itself. */}
          <motion.path
            d={path}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            initial={reduced ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.1, ease: ease.inOut }}
          />

          {/* Hit targets, one per segment, taller than the stroke. */}
          {segments.map((s, i) => (
            <rect
              key={`${s.start}-${s.status}`}
              x={xOf(s.start)}
              y={yOf(s.status) - ROW_H / 2}
              width={Math.max(xOf(s.end) - xOf(s.start), 4)}
              height={ROW_H}
              fill={hovered === i ? 'var(--accent-wash)' : 'transparent'}
              style={{ transition: 'fill 180ms' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              /* Touch has no hover. A tap pins the readout, a second one clears it. */
              onClick={() => setHovered((h) => (h === i ? null : i))}
            />
          ))}
        </svg>
      </div>

      {/* One readout line rather than a floating tooltip. The chart is 208px
          tall and a tooltip would cover half of it. */}
      <div className="mt-3 pt-3 border-t border-[var(--rule)] flex flex-wrap items-baseline gap-x-4 gap-y-1 min-h-[40px]">
        {active ? (
          <>
            <span className="case-data text-[13px] text-[var(--ink)]">
              {clock(active.start)} to {clock(active.end)}
            </span>
            <span className="case-body text-[13px] text-[var(--ink)]">{active.row.label}</span>
            <span className="case-caption">{span(active.start, active.end)}</span>
            {active.note && <span className="case-caption">{active.note}</span>}
          </>
        ) : (
          <span className="case-caption">
            {event ? (
              <>
                <span style={{ color: 'var(--accent)' }}>{clock(event.at)}</span> {event.label}
              </>
            ) : (
              caption
            )}
          </span>
        )}
      </div>

      <details className="mt-3">
        <summary className="case-kicker case-focus cursor-pointer select-none py-1">
          Log entries as a table
        </summary>
        <table className="w-full mt-3 text-left border-collapse">
          <thead>
            <tr>
              {['Start', 'End', 'Status', 'Duration'].map((h) => (
                <th key={h} className="case-kicker py-2 border-b border-[var(--rule)] font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={`row-${s.start}`}>
                <td className="case-data text-[13px] py-2 border-b border-[var(--rule)] text-[var(--ink-2)]">
                  {clock(s.start)}
                </td>
                <td className="case-data text-[13px] py-2 border-b border-[var(--rule)] text-[var(--ink-2)]">
                  {clock(s.end)}
                </td>
                <td className="text-[13px] py-2 border-b border-[var(--rule)] text-[var(--ink)]">
                  {s.row.label}
                </td>
                <td className="case-data text-[13px] py-2 border-b border-[var(--rule)] text-[var(--ink-2)]">
                  {span(s.start, s.end)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {caption && <figcaption className="case-caption mt-3">{caption}</figcaption>}
    </figure>
  );
}
