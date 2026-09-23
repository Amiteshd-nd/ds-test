/**
 * The compliance panel.
 *
 * The PRD calls this the single most credible feature in the product — the thing that
 * makes an architect believe the plan is real rather than a picture. Two rules shape it.
 *
 * **Never status by colour alone.** Every state carries a glyph and a word as well as a
 * colour (`ui-ux-pro-max`, Accessibility / Color Only, severity High). A compliance panel
 * is exactly where a colour-blind reader must not miss a breach, and "the red one" is not
 * a thing you can say over the phone either.
 *
 * **Every number says where it came from.** Hovering a metric shows its provenance and
 * the clause behind it. Without that the panel is a set of assertions; with it, it is
 * something a reviewer can check.
 *
 * It renders a view the Rust side computed. It does no arithmetic — a panel that derives
 * its own numbers is a second implementation of the rules, and the two disagree at the
 * worst possible moment.
 */
import type { ComplianceReport, Metric, Standing } from './doc'

const STATE: Record<Standing, { glyph: string; word: string; cls: string }> = {
  over: { glyph: '✕', word: 'over', cls: 'over' },
  tight: { glyph: '!', word: 'tight', cls: 'tight' },
  ok: { glyph: '✓', word: 'within', cls: 'ok' },
  unmeasured: { glyph: '–', word: 'not checked', cls: 'unmeasured' },
}

const SEVERITY: Record<string, { glyph: string; word: string }> = {
  hard: { glyph: '✕', word: 'Breach' },
  soft: { glyph: '!', word: 'Check' },
  advisory: { glyph: 'i', word: 'Note' },
}

interface Props {
  report: ComplianceReport
  onSelect: (ids: number[]) => void
}

export function Compliance({ report, onSelect }: Props) {
  const [hard, soft] = [
    report.diagnostics.filter((d) => d.severity === 'hard'),
    report.diagnostics.filter((d) => d.severity === 'soft'),
  ]

  return (
    <section className="compliance" data-testid="compliance">
      <header>
        <h2>Compliance</h2>
        <span
          className={`verdict ${hard.length ? 'over' : 'ok'}`}
          data-testid="verdict"
        >
          {hard.length ? `✕ ${hard.length} breach${hard.length > 1 ? 'es' : ''}` : '✓ passes'}
        </span>
      </header>

      <dl className="metrics">
        {report.metrics.map((m) => (
          <MetricRow key={m.id} metric={m} />
        ))}
      </dl>

      {(hard.length > 0 || soft.length > 0) && (
        <ul className="findings" data-testid="findings">
          {[...hard, ...soft].map((d, i) => {
            const s = SEVERITY[d.severity] ?? SEVERITY.advisory
            return (
              <li
                key={`${d.rule_id}-${i}`}
                className={d.severity}
                onClick={() => onSelect(d.entities.map(Number))}
                role={d.entities.length ? 'button' : undefined}
                tabIndex={d.entities.length ? 0 : undefined}
                title={d.entities.length ? 'Show on the plan' : undefined}
              >
                <span className="tag" aria-hidden="true">
                  {s.glyph}
                </span>
                <div>
                  <strong>{s.word}</strong> {d.message}
                  <em className="source">{d.source}</em>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <footer>
        <p className={report.reviewed ? 'authority' : 'authority unreviewed'}>
          {report.reviewed ? '' : '⚠ '}
          {report.authority}
        </p>
        <p className="disclaimer">{report.disclaimer}</p>
      </footer>
    </section>
  )
}

function MetricRow({ metric: m }: { metric: Metric }) {
  const state = STATE[m.standing] ?? STATE.unmeasured
  // A setback is the one metric where more is better, so the bar would read backwards.
  const bar = m.id.startsWith('setback') ? null : utilisation(m)

  return (
    <>
      <dt title={`${m.provenance}: ${m.reason}`}>
        {m.label}
        <span className={`dot ${m.provenance.toLowerCase()}`} aria-hidden="true" />
      </dt>
      <dd
        className={state.cls}
        title={`${m.provenance}: ${m.reason}`}
        data-testid={`metric-${m.id}`}
      >
        <span className="figure">
          {format(m.value)}
          {m.unit && <i>{m.unit}</i>}
          {m.limit != null && (
            <span className="limit">
              {' / '}
              {format(m.limit)}
              {m.unit && <i>{m.unit}</i>}
            </span>
          )}
        </span>
        {/* Glyph and word, not colour alone. */}
        <span className="state">
          <span aria-hidden="true">{state.glyph}</span> {state.word}
        </span>
        {bar != null && (
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, bar * 100)}%` }} />
          </span>
        )}
      </dd>
    </>
  )
}

function utilisation(m: Metric): number | null {
  if (m.limit == null || m.limit <= 0) return null
  return m.value / m.limit
}

function format(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(Math.abs(v) < 10 ? 2 : 1)
}
