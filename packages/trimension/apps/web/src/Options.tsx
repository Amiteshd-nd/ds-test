/**
 * The option strip: three or four generated plans to choose between.
 *
 * The PRD's reason for it is not variety for its own sake — "it lowers the cost of any
 * single bad output". A generator that hands back one plan is asserting it got the design
 * right; one that hands back four is asking a question.
 *
 * Each thumbnail draws its own branch through the same renderer and the same `Scene` the
 * main canvas uses, so a thumbnail cannot disagree with the drawing it is a picture of.
 *
 * Interaction follows `ui-ux-pro-max`:
 * - a native `<button>` with `aria-pressed`, never a clickable div ("Compact Control
 *   Semantics", severity Critical). The role, the name and the selected state all come
 *   free, and so does keyboard operation;
 * - a visible focus ring (severity High), separate from the selected ring, so tabbing
 *   through the strip is legible without selecting anything;
 * - selection is set directly on click, not when a transition ends ("Cancellable State
 *   Transitions", severity High) — clicking through four options quickly must never
 *   leave the strip showing one thing and the canvas another;
 * - the selected option says "selected" in words as well as in colour, the same rule the
 *   compliance panel follows.
 */
import { useEffect, useRef, useState } from 'react'
import type { DocumentClient, OptionSummary } from './doc'

interface Props {
  doc: DocumentClient
  options: OptionSummary[]
  chosen: string | null
  onChoose: (key: string) => void
}

export function Options({ doc, options, chosen, onChoose }: Props) {
  if (options.length === 0) return null

  return (
    <div className="options" role="group" aria-label="Generated plan options">
      <div className="options-head">
        <span className="options-title">OPTIONS</span>
        <span className="options-count">
          {options.length} plans for this brief · pick one to work on
        </span>
        {options[0]?.vaastu && (
          <span className="options-vaastu" title={options[0].vaastu.authority}>
            ranked with Vaastu
          </span>
        )}
      </div>
      <div className="options-strip">
        {options.map((o, i) => (
          <OptionCard
            key={o.key}
            doc={doc}
            option={o}
            index={i}
            selected={o.key === chosen}
            onChoose={() => onChoose(o.key)}
          />
        ))}
      </div>
    </div>
  )
}

function OptionCard({
  doc,
  option,
  index,
  selected,
  onChoose,
}: {
  doc: DocumentClient
  option: OptionSummary
  index: number
  selected: boolean
  onChoose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<Awaited<ReturnType<DocumentClient['attachViewport']>> | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  // Attach once per card. A wgpu device is per-canvas, so this must not re-run on
  // selection — a strip that rebuilt four GPU devices every click would be unusable.
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    const scale = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * scale)
    canvas.height = Math.round(canvas.clientHeight * scale)

    doc
      .attachViewport(canvas, 'plan')
      .then((vp) => {
        if (cancelled) return
        viewportRef.current = vp
        vp.resize(canvas.width, canvas.height)
        try {
          vp.renderOption(doc.session, option.key)
        } catch (e) {
          setFailed(String(e))
        }
      })
      .catch((e) => {
        if (!cancelled) setFailed(String(e))
      })

    return () => {
      cancelled = true
      viewportRef.current = null
    }
  }, [doc, option.key])

  return (
    <button
      type="button"
      className={selected ? 'option selected' : 'option'}
      aria-pressed={selected}
      onClick={onChoose}
    >
      <span className="option-canvas">
        <canvas ref={canvasRef} aria-hidden="true" />
        {failed && <span className="option-failed">no preview</span>}
      </span>
      <span className="option-label">
        <span className="option-index">{index + 1}</span>
        {option.label}
      </span>
      <span className="option-note">{option.note}</span>
      {/* Vaastu, when it is on. The score alone would be a bare number an architect
          cannot argue with, so the cost of taking this option over the one the ranking
          would otherwise have chosen is shown beside it — the PRD asks that the layer's
          "influence is shown so the architect can see what it cost in efficiency". */}
      {option.vaastu && (
        <span className="option-vaastu" title={option.vaastu.authority}>
          <span className="vaastu-score">{option.vaastu.score}% vaastu</span>
          {option.cost && <span className="vaastu-cost">{option.cost}</span>}
        </span>
      )}
      {/* In words, not colour alone — the same rule the compliance panel follows. */}
      <span className="option-state">{selected ? '✓ selected' : 'select'}</span>
    </button>
  )
}
