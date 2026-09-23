/**
 * The confirmation card: what a one-line brief was read as, before anything is generated.
 *
 * **Confirmation is the provenance event, not parsing.** `ParameterSet::from_brief` marks
 * every tier-1 value `Measured` — "the architect typed this". A model, or the local
 * parser, filling `floors: 2` from a sentence that never mentioned floors would turn a
 * guess into a measurement at the very first step, with no geometry yet for anything to
 * catch it against. So the fields nobody stated are shown marked, and generation waits
 * for a human to look at them.
 *
 * The chip row is the PRD's: "where the brief is genuinely underspecified, the tool
 * surfaces a short chip row above the input rather than a modal. Each chip is one tap, and
 * skipping it accepts the default."
 *
 * Controls follow `ui-ux-pro-max`: native `<button>` with `aria-pressed` for the chips
 * rather than clickable divs (rated Critical), and a visible focus ring on everything
 * operable (rated High).
 */
import { useState } from 'react'
import type { IntakeReading } from './doc'

interface Props {
  reading: IntakeReading
  onConfirm: (chips: Record<string, boolean>) => void
  onCancel: () => void
}

const LABELS: Record<string, string> = {
  units: 'Units',
  plot_width: 'Plot width',
  plot_depth: 'Plot depth',
  road_facing: 'Road-facing side',
  road_width_m: 'Road width (m)',
  bedrooms: 'Bedrooms',
  floors: 'Floors',
  car_parking: 'Car parking',
}

const SHOWN = [
  'plot_width',
  'plot_depth',
  'units',
  'bedrooms',
  'floors',
  'road_facing',
  'car_parking',
  'road_width_m',
]

export function Intake({ reading, onConfirm, onCancel }: Props) {
  const [chips, setChips] = useState<Record<string, boolean>>({})
  const brief = reading.brief as unknown as Record<string, unknown>

  return (
    <div className="intake" data-testid="intake-card">
      <div className="intake-head">
        <span className="intake-title">READ AS</span>
        <span className="intake-source">via {reading.source}</span>
      </div>

      <dl className="intake-fields">
        {SHOWN.filter((f) => brief[f] !== null && brief[f] !== undefined).map((f) => {
          const guessed = reading.guessed.includes(f)
          return (
            <div key={f} className={guessed ? 'intake-field guessed' : 'intake-field'}>
              <dt>{LABELS[f] ?? f}</dt>
              <dd>
                {String(brief[f])}
                {/* In words, not colour alone — the rule the compliance panel follows. */}
                {guessed && <span className="intake-flag"> assumed, check this</span>}
              </dd>
            </div>
          )
        })}
      </dl>

      {reading.chips.length > 0 && (
        <div className="intake-chips" role="group" aria-label="Unanswered questions">
          {reading.chips.map((c) => {
            const state = chips[c.field]
            return (
              <button
                key={c.field}
                type="button"
                className={state === undefined ? 'chip' : state ? 'chip yes' : 'chip no'}
                aria-pressed={state === true}
                onClick={() =>
                  setChips((prev) => {
                    const next = { ...prev }
                    // Three states, one control: unanswered, yes, no. Skipping a chip is
                    // not the same as answering it "no", so cycling has to reach the
                    // unanswered state again rather than toggling between two.
                    if (prev[c.field] === undefined) next[c.field] = true
                    else if (prev[c.field]) next[c.field] = false
                    else delete next[c.field]
                    return next
                  })
                }
              >
                {c.question}
                <span className="chip-state">
                  {state === undefined ? 'skip' : state ? 'yes' : 'no'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="intake-actions">
        <button type="button" className="intake-go" onClick={() => onConfirm(chips)}>
          Confirm and generate
        </button>
        <button type="button" className="intake-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {reading.guessed.length > 0 && (
        <p className="intake-foot">
          {reading.guessed.length} value(s) the brief did not state. Confirming marks them
          as entered by you.
        </p>
      )}
    </div>
  )
}
