'use client';

/**
 * Latency Waterfall (pattern 12), hand-rolled SVG.
 *
 * The four rules, and where each one shows up here:
 *
 * - **Real scale.** One millisecond is one unit; the axis starts at zero and the
 *   p95 row is genuinely wider than the p50 row. A compressed axis on a latency
 *   chart is a lie about the exact thing it measures — which is why this isn't a
 *   chart library: Recharts wants to normalise the domain per series.
 * - **Segment by cause**, in his decision vocabulary (network / queue / model /
 *   synthesis), not by trace span.
 * - **TTFT separate from total.** For a streaming interface they're different
 *   products, so it's a rule across the bar rather than a segment in it.
 * - **Distribution, not one sample.** p50 and p95 sit under this run, and the
 *   source is stated: a scripted number must never read as a measured one.
 */
import { copy } from './copy';
import type { LatencyDistribution, LatencySample } from '@/lib/surfaces/coding/reducer';
import styles from './coding.module.css';

const SEGMENT_TOKEN = {
  network: 'var(--wf-network)',
  queue: 'var(--wf-queue)',
  model: 'var(--wf-model)',
  synthesis: 'var(--wf-synthesis)',
} as const;

const ROW_H = 22;
const ROW_GAP = 10;
const LABEL_W = 74;
const AXIS_H = 18;

type Row = { label: string; segments: { kind: keyof typeof SEGMENT_TOKEN; ms: number }[]; ttftMs?: number };

/** A tick every 1s, or every 500ms if the whole run is short. */
function ticks(maxMs: number) {
  const step = maxMs > 6000 ? 2000 : maxMs > 2500 ? 1000 : 500;
  const out: number[] = [];
  for (let t = 0; t <= maxMs; t += step) out.push(t);
  return out;
}

export function Waterfall({
  sample,
  distribution,
}: {
  sample?: LatencySample;
  distribution?: LatencyDistribution;
}) {
  if (!sample && !distribution) {
    return (
      <section className={styles.section} aria-labelledby="wf-heading">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="wf-heading">
            {copy.latency.heading}
          </h2>
        </div>
        <p className={styles.empty}>Nothing timed yet.</p>
      </section>
    );
  }

  const rows: Row[] = [];
  if (sample) rows.push({ label: copy.latency.oneRun, segments: sample.segments, ttftMs: sample.ttftMs });

  // p50 and p95 rows keep this run's segment proportions but scale to the
  // distribution's totals — honest about shape, honest about which number is which.
  if (distribution && sample) {
    const scale = (target: number) =>
      sample.segments.map((s) => ({ kind: s.kind, ms: (s.ms / sample.totalMs) * target }));
    rows.push(
      { label: copy.latency.p50, segments: scale(distribution.total.p50), ttftMs: distribution.ttft.p50 },
      { label: copy.latency.p95, segments: scale(distribution.total.p95), ttftMs: distribution.ttft.p95 },
    );
  }

  const maxMs = Math.max(...rows.map((r) => r.segments.reduce((sum, s) => sum + s.ms, 0)), 1);
  const width = 560;
  const plotW = width - LABEL_W;
  const height = rows.length * (ROW_H + ROW_GAP) + AXIS_H;
  const x = (ms: number) => LABEL_W + (ms / maxMs) * plotW;

  const kinds = Array.from(new Set(rows.flatMap((r) => r.segments.map((s) => s.kind))));

  return (
    <section className={styles.section} aria-labelledby="wf-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="wf-heading">
          {copy.latency.heading}
        </h2>
        {distribution && (
          <span className={styles.sectionAside}>
            {copy.latency.distribution(distribution.label, distribution.n)}
          </span>
        )}
      </div>

      <div className={styles.waterfall}>
        <svg
          className={styles.wfChart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={
            sample
              ? `Time decomposition. First token at ${sample.ttftMs} milliseconds, total ${sample.totalMs}. ` +
                sample.segments.map((s) => `${s.kind} ${Math.round(s.ms)}`).join(', ')
              : 'Latency distribution'
          }
        >
          {ticks(maxMs).map((t) => (
            <g key={t}>
              <line className={styles.wfTick} x1={x(t)} x2={x(t)} y1={0} y2={height - AXIS_H} />
              <text className={styles.wfAxisLabel} x={x(t)} y={height - 4} textAnchor={t === 0 ? 'start' : 'middle'}>
                {t >= 1000 ? `${t / 1000}s` : `${t}ms`}
              </text>
            </g>
          ))}

          {rows.map((row, i) => {
            const y = i * (ROW_H + ROW_GAP);
            let cursor = 0;
            return (
              <g key={row.label}>
                <text className={styles.wfRowLabel} x={0} y={y + ROW_H * 0.72}>
                  {row.label}
                </text>
                {row.segments.map((s) => {
                  const segX = x(cursor);
                  const segW = Math.max(1, (s.ms / maxMs) * plotW);
                  cursor += s.ms;
                  return (
                    <rect
                      key={s.kind}
                      x={segX}
                      y={y}
                      width={segW}
                      height={ROW_H}
                      fill={SEGMENT_TOKEN[s.kind]}
                      rx={2}
                    />
                  );
                })}
                {row.ttftMs !== undefined && row.ttftMs <= maxMs && (
                  <line
                    className={styles.wfTtft}
                    x1={x(row.ttftMs)}
                    x2={x(row.ttftMs)}
                    y1={y - 3}
                    y2={y + ROW_H + 3}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div className={styles.wfLegend}>
          {kinds.map((kind) => (
            <span className={styles.wfLegendItem} key={kind}>
              <span className={styles.wfSwatch} style={{ background: SEGMENT_TOKEN[kind] }} />
              {copy.latency[kind]}
            </span>
          ))}
          <span className={styles.wfLegendItem}>
            <span className={styles.wfSwatch} style={{ background: 'var(--fg-primary)', width: 2 }} />
            {copy.latency.ttft}
          </span>
        </div>

        {sample && (
          <div className={styles.wfNumbers}>
            <span className={styles.wfNumber}>
              <span className={styles.wfNumberLabel}>{copy.latency.ttft}</span>
              <span className={styles.wfNumberValue}>{sample.ttftMs}ms</span>
            </span>
            <span className={styles.wfNumber}>
              <span className={styles.wfNumberLabel}>{copy.latency.total}</span>
              <span className={styles.wfNumberValue}>{(sample.totalMs / 1000).toFixed(2)}s</span>
            </span>
            {distribution && (
              <>
                <span className={styles.wfNumber}>
                  <span className={styles.wfNumberLabel}>{copy.latency.ttft} {copy.latency.p95}</span>
                  <span className={styles.wfNumberValue}>{distribution.ttft.p95}ms</span>
                </span>
                <span className={styles.wfNumber}>
                  <span className={styles.wfNumberLabel}>{copy.latency.total} {copy.latency.p95}</span>
                  <span className={styles.wfNumberValue}>{(distribution.total.p95 / 1000).toFixed(2)}s</span>
                </span>
              </>
            )}
          </div>
        )}

        {distribution && (
          <p className={styles.wfCaveat}>
            {distribution.source === 'placeholder' ? copy.latency.placeholder : copy.latency.measured}
          </p>
        )}
      </div>
    </section>
  );
}
