/**
 * Invariant **I4**, made visible: "This is surfaced in the UI. Non-negotiable: without
 * it, nobody can sign off on the model."
 *
 * Every number shown here carries where it came from. An `Assumed` value is not a
 * footnote — it is the thing a reviewer is here to find, so it is coloured and it says
 * why in full.
 */
import type { DocumentClient } from './doc'

interface Props {
  doc: DocumentClient
  selection: number[]
  revision: number
}

export function Inspector({ doc, selection, revision }: Props) {
  void revision
  if (selection.length === 0) {
    const layers = doc.layers()
    return (
      <div className="inspector" data-testid="inspector">
        <h2>Layers</h2>
        <ul className="layers">
          {layers.map((l) => (
            <li key={l.id}>
              <span
                className="swatch"
                style={{ background: `rgb(${l.color[0]},${l.color[1]},${l.color[2]})` }}
              />
              {l.name}
            </li>
          ))}
        </ul>
        <p className="hint">Select something on the canvas to see where its numbers came from.</p>
      </div>
    )
  }

  const measurements = doc.measure(selection)

  return (
    <div className="inspector" data-testid="inspector">
      <h2>Selection</h2>
      {measurements.map((m) => (
        <div key={m.entity} className="measure">
          <h3>
            {m.kind} #{m.entity}
            {m.contains_assumptions && (
              <span className="warn" data-testid="assumption-flag">
                contains assumptions
              </span>
            )}
          </h3>
          <dl>
            {m.length_mm != null && <Row label="length" value={`${m.length_mm.toFixed(0)} mm`} />}
            {m.thickness_mm != null && (
              <Row label="thickness" value={`${m.thickness_mm.toFixed(0)} mm`} />
            )}
            {m.height_mm != null && <Row label="height" value={`${m.height_mm.toFixed(0)} mm`} />}
            {m.area_m2 != null && <Row label="area" value={`${m.area_m2.toFixed(2)} m²`} />}
            {m.volume_m3 != null && <Row label="volume" value={`${m.volume_m3.toFixed(3)} m³`} />}
          </dl>

          <h4>Where these came from</h4>
          <ul className="provenance">
            {Object.entries(m.provenance).map(([field, why]) => {
              const kind = why.split(':')[0]
              return (
                <li key={field} className={kind.toLowerCase()}>
                  <strong>{field}</strong>
                  <span className={`tag ${kind.toLowerCase()}`}>{kind}</span>
                  <em>{why.slice(kind.length + 2)}</em>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}
