/**
 * The four-viewport layout: plan, left elevation, right elevation, two-point perspective.
 *
 * Each canvas is driven by a `Viewport` living in Wasm, which owns a wgpu surface and
 * draws with the same `tri_render` code that produces an agent's headless PNG. No
 * geometry reaches JavaScript — this component knows canvas sizes and mouse deltas, and
 * nothing about the building.
 */
import { useEffect, useRef, useState } from 'react'
import type { DocumentClient } from './doc'

export const VIEWS = [
  { mode: 'plan', label: 'Plan', hint: 'top' },
  { mode: 'elevation_left', label: 'Left elevation', hint: 'from −X' },
  { mode: 'elevation_right', label: 'Right elevation', hint: 'from +X' },
  { mode: 'perspective', label: 'Two-point perspective', hint: 'drag to orbit' },
] as const

export type ViewModeName = (typeof VIEWS)[number]['mode']

interface Props {
  doc: DocumentClient
  revision: number
  /** Which viewport is maximised, or null for the 2×2 grid. */
  focused: ViewModeName | null
  onFocus: (m: ViewModeName | null) => void
  onSelect: (ids: number[]) => void
  /** Called after a wall drag lands a commit. */
  onEdit: () => void
}

export function Viewports({ doc, revision, focused, onFocus, onSelect, onEdit }: Props) {
  const shown = focused ? VIEWS.filter((v) => v.mode === focused) : VIEWS

  return (
    <div className={focused ? 'viewports single' : 'viewports'}>
      {shown.map((v) => (
        <ViewportPane
          key={v.mode}
          doc={doc}
          revision={revision}
          mode={v.mode}
          label={v.label}
          hint={v.hint}
          focused={focused === v.mode}
          onToggle={() => onFocus(focused === v.mode ? null : v.mode)}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}

interface PaneProps {
  doc: DocumentClient
  revision: number
  mode: ViewModeName
  label: string
  hint: string
  focused: boolean
  onToggle: () => void
  onSelect: (ids: number[]) => void
  onEdit: () => void
}

function ViewportPane({
  doc,
  revision,
  mode,
  label,
  hint,
  focused,
  onToggle,
  onSelect,
  onEdit,
}: PaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<Awaited<ReturnType<DocumentClient['attachViewport']>> | null>(null)
  const [status, setStatus] = useState<'starting' | 'ready' | 'failed'>('starting')
  const [error, setError] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(0)
  const [yaw, setYaw] = useState<number | null>(null)
  const drag = useRef<{ x: number; downX: number; moved: boolean } | null>(null)
  /** A wall drag in progress: which entity, and where the pointer went down. */
  const wallDrag = useRef<{ entity: number; x: number; y: number } | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  // Attach once. The GPU device is per-canvas, so this must not re-run on every render.
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    sizeToParent(canvas)
    doc
      .attachViewport(canvas, mode)
      .then((vp) => {
        if (cancelled) return
        viewportRef.current = vp
        setStatus('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setStatus('failed')
      })

    return () => {
      cancelled = true
      viewportRef.current = null
    }
  }, [doc, mode])

  // Redraw on document change, resize, or focus change.
  useEffect(() => {
    const canvas = canvasRef.current
    const vp = viewportRef.current
    if (!canvas || !vp || status !== 'ready') return

    const draw = () => {
      const { w, h } = sizeToParent(canvas)
      vp.resize(w, h)
      try {
        setDrawn(vp.render(doc.session))
        if (mode === 'perspective') setYaw(vp.yawDegrees())
      } catch (e) {
        setError(String(e))
        setStatus('failed')
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas.parentElement ?? canvas)
    return () => observer.disconnect()
  }, [doc, revision, status, mode, focused])

  return (
    <section className={`pane${focused ? ' focused' : ''}`} data-testid={`pane-${mode}`}>
      <header>
        <span className="name">{label}</span>
        <span className="hint">{hint}</span>
        <span className="spacer" />
        {/* The distance so far, while a wall is being dragged. Nothing is committed until
            the pointer comes up, so this is the only feedback during the drag. */}
        {pending && (
          <span className="hint dragging" data-testid="drag-delta">
            {pending}
          </span>
        )}
        {mode === 'perspective' && yaw !== null && (
          <span className="hint">{yaw.toFixed(0)}°</span>
        )}
        <span className="hint" data-testid={`drawn-${mode}`}>
          {drawn}
        </span>
        <button className="ghost" onClick={onToggle} title={focused ? 'Restore' : 'Maximise'}>
          {focused ? '⤡' : '⤢'}
        </button>
      </header>

      <div className="surface">
        <canvas
          ref={canvasRef}
          data-testid={`canvas-${mode}`}
          onPointerDown={(ev) => {
            // Capture is a nicety for dragging, not a precondition for selecting. It
            // throws for a pointer the browser no longer considers active, and letting
            // that escape aborts the handler before `drag` is set — so the pointerup
            // that follows silently does nothing.
            try {
              ev.currentTarget.setPointerCapture(ev.pointerId)
            } catch {
              /* not capturable; dragging still works via the move handler */
            }
            drag.current = { x: ev.clientX, moved: false, downX: ev.clientX }

            // Plan view only: `pick` is exact there and a guess anywhere else.
            if (mode !== 'plan') return
            const vp = viewportRef.current
            if (!vp) return
            const box = ev.currentTarget.getBoundingClientRect()
            const scale = ev.currentTarget.width / Math.max(1, box.width)
            const hit = vp.pick(
              doc.session,
              (ev.clientX - box.left) * scale,
              (ev.clientY - box.top) * scale,
            )
            if (hit !== undefined && hit !== null && doc.isWall(Number(hit))) {
              wallDrag.current = { entity: Number(hit), x: ev.clientX, y: ev.clientY }
            }
          }}
          onPointerMove={(ev) => {
            const w = wallDrag.current
            const view = viewportRef.current
            if (w && view) {
              // The distance so far, in millimetres, shown in the header. No commit and no
              // redraw yet: committing per frame would put hundreds of commits in the
              // history for one drag and make undo useless. One mouse edit, one commit.
              const mmPerPx = view.mmPerPixel(doc.session)
              const dpr = ev.currentTarget.width / Math.max(1, ev.currentTarget.getBoundingClientRect().width)
              const dx = (ev.clientX - w.x) * dpr * mmPerPx
              const dy = -(ev.clientY - w.y) * dpr * mmPerPx
              setPending(
                Math.abs(dx) > Math.abs(dy)
                  ? `${dx > 0 ? '+' : ''}${dx.toFixed(0)} mm`
                  : `${dy > 0 ? '+' : ''}${dy.toFixed(0)} mm`,
              )
              return
            }
            const d = drag.current
            const vp = viewportRef.current
            if (!d || !vp || mode !== 'perspective') return
            const dx = ev.clientX - d.x
            if (Math.abs(dx) < 1) return
            drag.current = { ...d, x: ev.clientX, moved: true }
            // 500 milli-degrees per pixel: a full turn in roughly one screen width.
            vp.orbit(Math.round(dx * 500))
            setYaw(vp.yawDegrees())
            setDrawn(vp.render(doc.session))
          }}
          onPointerUp={(ev) => {
            const w = wallDrag.current
            wallDrag.current = null
            setPending(null)
            if (w) {
              const view = viewportRef.current
              const dpr =
                ev.currentTarget.width /
                Math.max(1, ev.currentTarget.getBoundingClientRect().width)
              const moved = Math.hypot(ev.clientX - w.x, ev.clientY - w.y) * dpr
              if (view && moved > 4) {
                const mmPerPx = view.mmPerPixel(doc.session)
                try {
                  doc.moveWall(
                    w.entity,
                    (ev.clientX - w.x) * dpr * mmPerPx,
                    -(ev.clientY - w.y) * dpr * mmPerPx,
                  )
                  onEdit()
                } catch (e) {
                  // A drag that would collapse a room, or one along a wall's own length.
                  // Both are refusals from the command, not faults: say so and move on.
                  setError(String(e).replace(/^Error:\s*/, ''))
                  setTimeout(() => setError(null), 2500)
                }
                drag.current = null
                return
              }
            }
            const d = drag.current
            drag.current = null
            const vp = viewportRef.current
            // A click, not a drag.
            if (!vp || !d || Math.abs(ev.clientX - d.downX) > 3) return
            const canvas = ev.currentTarget
            const box = canvas.getBoundingClientRect()
            const scale = canvas.width / Math.max(1, box.width)
            const hit = vp.pick(
              doc.session,
              (ev.clientX - box.left) * scale,
              (ev.clientY - box.top) * scale,
            )
            // `pick` returns nothing outside the plan view — see its Rust doc comment.
            if (hit !== undefined) onSelect(hit === null ? [] : [Number(hit)])
          }}
          style={{ cursor: mode === 'perspective' ? 'grab' : 'crosshair' }}
        />
        {status !== 'ready' && (
          <div className="pane-status">
            {status === 'starting' ? 'starting GPU…' : `GPU unavailable — ${error}`}
          </div>
        )}
      </div>
    </section>
  )
}

/** Match the backing store to the element's CSS size, accounting for device pixels. */
function sizeToParent(canvas: HTMLCanvasElement): { w: number; h: number } {
  const box = canvas.parentElement?.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.floor((box?.width ?? 300) * dpr))
  const h = Math.max(1, Math.floor((box?.height ?? 200) * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return { w, h }
}
