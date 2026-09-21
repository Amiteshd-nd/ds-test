import { useState, useId } from 'react';
import { motion, useReducedMotion, duration, ease, staggerFor } from '@cloud-march/motion/react';

/*
 * An ordered flow: N stages, each with an owner, and optionally one marked as
 * the place the flow used to break.
 *
 * Written for the Vehicle Health defect lifecycle and generalised once two more
 * case studies wanted the same shape (an application pipeline, a subscription
 * funnel). Drawing it in ink is the point: the stages are ordered, not
 * categorical, so position carries the meaning and colour would only decorate
 * it. The single accent is spent on the one stage the section argues about.
 *
 * It runs as a rail on a phone and a track on anything wider, so there is no
 * horizontal scroll to discover. Each stage reads out below rather than in a
 * tooltip, because the before and after of a stage is two sentences, not a chip.
 */

export default function StageFlow({
  stages,
  brokeAt,
  caption,
  beforeLabel = 'Was',
  afterLabel = 'Now',
  tableTitle = 'The stages as a table',
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);
  const uid = useId();
  const step = staggerFor(stages.length, 0.4);
  const shown = active != null ? stages[active] : null;

  return (
    <figure className="case-figure p-4 sm:p-6">
      <ol className="flex flex-col sm:flex-row sm:items-start gap-0 sm:gap-2 list-none m-0 p-0">
        {stages.map((stage, i) => {
          const isBreak = stage.key === brokeAt;
          const isActive = active === i;
          const last = i === stages.length - 1;

          return (
            <li key={stage.key} className="flex sm:flex-col gap-3 sm:gap-0 flex-1 min-w-0">
              {/* The rail. Vertical on a phone, horizontal above it. */}
              <div className="flex flex-col sm:flex-row items-center shrink-0 sm:w-full">
                <span
                  aria-hidden="true"
                  className="block w-[9px] h-[9px] rounded-full shrink-0 transition-colors duration-[180ms]"
                  style={{ background: isBreak || isActive ? 'var(--accent)' : 'var(--ink)' }}
                />
                {!last && (
                  <motion.span
                    aria-hidden="true"
                    initial={reduced ? false : { scaleX: 0, scaleY: 0 }}
                    whileInView={{ scaleX: 1, scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: duration.gentle, ease: ease.out, delay: i * step }}
                    className={`w-px flex-1 min-h-[62px] sm:w-full sm:h-px sm:min-h-0 sm:flex-none origin-top sm:origin-left ${
                      isBreak ? 'case-link-broken' : ''
                    }`}
                    style={{ background: 'var(--rule-strong)' }}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={() => setActive(isActive ? null : i)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                aria-expanded={isActive}
                aria-controls={`${uid}-readout`}
                className="case-focus text-left pb-6 sm:pb-0 sm:pt-3 sm:pr-4 -mt-1 sm:mt-0 w-full"
              >
                <span
                  className="case-kicker block text-[10px] transition-colors duration-[180ms]"
                  style={{ color: isBreak ? 'var(--accent)' : 'var(--ink-3)' }}
                >
                  {stage.owner}
                </span>
                <span
                  className="block text-[15px] leading-[1.3] tracking-[-0.015em] mt-1 transition-colors duration-[180ms]"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--ink)' }}
                >
                  {stage.name}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        id={`${uid}-readout`}
        className="mt-2 sm:mt-5 pt-3 border-t border-[var(--rule)] min-h-[68px]"
      >
        {shown ? (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
            <p className="case-body text-[13px]">
              <span className="case-kicker mr-2">{beforeLabel}</span>
              {shown.was}
            </p>
            <p className="case-body text-[13px]">
              <span className="case-kicker mr-2" style={{ color: 'var(--accent)' }}>
                {afterLabel}
              </span>
              {shown.now}
            </p>
          </div>
        ) : (
          <p className="case-caption">{caption}</p>
        )}
      </div>

      <details className="mt-3">
        <summary className="case-kicker case-focus cursor-pointer select-none py-1">
          {tableTitle}
        </summary>
        {/* A four column table cannot shrink below its own min-content width, so
            `w-full` does not save it on a phone: it simply overflows the figure.
            This is the accessible alternative to the interactive flow, so the
            scrollbar is deliberately left visible rather than hidden. */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full min-w-[460px] text-left border-collapse">
            <thead>
              <tr>
                {['Stage', 'Owner', beforeLabel, afterLabel].map((h) => (
                  <th key={h} className="case-kicker py-2 pr-4 border-b border-[var(--rule)] font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={`row-${stage.key}`}>
                  <td className="text-[13px] py-2 pr-4 border-b border-[var(--rule)] align-top text-[var(--ink)]">
                    {stage.name}
                  </td>
                  <td className="case-caption py-2 pr-4 border-b border-[var(--rule)] align-top">
                    {stage.owner}
                  </td>
                  <td className="case-body text-[13px] py-2 pr-4 border-b border-[var(--rule)] align-top">
                    {stage.was}
                  </td>
                  <td className="case-body text-[13px] py-2 border-b border-[var(--rule)] align-top">
                    {stage.now}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
