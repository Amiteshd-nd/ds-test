'use client'

// The background studies, imported from the Figma Make export and kept as a route
// after Discovery became the agentic-UI program. Not part of the six surfaces:
// it uses none of the grammar and answers to none of its rules.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import WaterSurface, { type WaterHandle } from "./WaterSurface"

type AuroraEllipse = {
  cx: string
  cy: string
  rx: string
  ry: string
  opacity: number
  blur: "xl" | "lg" | "md"
}

type BgConfig =
  | { id: string; name: string; note: string; kind: "aurora"; ellipses: AuroraEllipse[]; colors: string[] }
  | { id: string; name: string; note: string; kind: "radial"; shape: string; at: string; stops: number[]; colors: string[] }
  | { id: string; name: string; note: string; kind: "weave"; colors: string[] }

function PixelWeaveBackground({ colors }: { colors: string[] }) {
  const [ground = "#06102e", cobalt = "#1664ed", cyan = "#28c9ee", white = "#eef6ff", amber = "#ffab20", red = "#df301d"] = colors
  const style = {
    "--weave-ground": ground, "--weave-cobalt": cobalt, "--weave-cyan": cyan,
    "--weave-white": white, "--weave-amber": amber, "--weave-red": red,
  } as CSSProperties
  return <div className="pixel-weave" style={style} aria-hidden="true">
    <span className="weave-diagonal-glow weave-glow-cool" />
    <span className="weave-diagonal-glow weave-glow-warm" />
    <span className="weave-diagonal-glow weave-glow-white" />
    <span className="weave-diagonal" />
    <span className="weave-crosshatch" />
  </div>
}


const CONFIGS: BgConfig[] = [
  {
    id: "aurora", name: "Aurora flare", note: "washed pigment / electric dusk", kind: "aurora",
    ellipses: [
      { cx: "40%", cy: "79%", rx: "31%", ry: "46%", opacity: .82, blur: "xl" },
      { cx: "46%", cy: "65%", rx: "20%", ry: "38%", opacity: .78, blur: "lg" },
      { cx: "60%", cy: "54%", rx: "25%", ry: "28%", opacity: .65, blur: "lg" },
      { cx: "72%", cy: "42%", rx: "31%", ry: "34%", opacity: .82, blur: "xl" },
      { cx: "81%", cy: "25%", rx: "21%", ry: "22%", opacity: .7, blur: "lg" },
      { cx: "95%", cy: "-7%", rx: "33%", ry: "30%", opacity: .68, blur: "xl" },
      { cx: "86%", cy: "75%", rx: "26%", ry: "25%", opacity: .54, blur: "md" },
      { cx: "12%", cy: "93%", rx: "28%", ry: "22%", opacity: .48, blur: "xl" },
    ],
    colors: ["#123dbc", "#0d2778", "#1ca6c0", "#f4e4bf", "#e68b2c", "#c84a0e", "#d75f18", "#11101a"],
  },
  {
    id: "spectrum", name: "Spectrum arc", note: "radial chroma / deep plum", kind: "radial", shape: "138% 138%", at: "96% 108%",
    stops: [0, 10, 18, 27, 37, 47, 58, 69, 83, 100],
    colors: ["#1a62fd", "#24a3ff", "#79d9ff", "#f4f2e5", "#ffcf35", "#ff8519", "#df381a", "#741d16", "#25162b", "#090a10"],
  },
  {
    id: "duotone", name: "Duotone bloom", note: "fuchsia / ultraviolet", kind: "radial", shape: "128% 136%", at: "9% 109%",
    stops: [0, 15, 31, 47, 64, 82, 100],
    colors: ["#ff2b80", "#d9239b", "#7b20c9", "#2e2bd4", "#141a88", "#090d3a", "#05050d"],
  },
  { id: "weave", name: "Pixel weave", note: "diagonal spectrum / luminous raster", kind: "weave", colors: ["#06102e", "#1664ed", "#28c9ee", "#eef6ff", "#ffab20", "#df301d"] },
]

const DEFAULT_COLORS = CONFIGS.map((config) => [...config.colors])
const isHex = (value: string) => /^#[\da-fA-F]{6}$/.test(value)

function BackgroundLayer({ config, colors }: { config: BgConfig; colors: string[] }) {
  if (config.kind === "weave") return <PixelWeaveBackground colors={colors} />
  if (config.kind === "aurora") {
    const prefix = `aurora-${config.id}`
    return <svg className="background-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id={`${prefix}-xl`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="88" /></filter>
        <filter id={`${prefix}-lg`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="54" /></filter>
        <filter id={`${prefix}-md`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="26" /></filter>
      </defs>
      <rect width="1000" height="1000" fill="#08080f" />
      {config.ellipses.map((ellipse, index) => <ellipse key={index} cx={ellipse.cx} cy={ellipse.cy} rx={ellipse.rx} ry={ellipse.ry} fill={colors[index]} opacity={ellipse.opacity} filter={`url(#${prefix}-${ellipse.blur})`} />)}
    </svg>
  }
  const background = `radial-gradient(${config.shape} at ${config.at}, ${config.stops.map((stop, index) => `${colors[index]} ${stop}%`).join(",")})`
  return <div className="background-fill" style={{ background }} aria-hidden="true" />
}

function Arrow({ direction }: { direction: "prev" | "next" }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={direction === "prev" ? "m14.5 4.5-7 7 7 7" : "m9.5 4.5 7 7-7 7"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export default function Explorer() {
  const [index, setIndex] = useState(0)
  const [colorsByBg, setColorsByBg] = useState(() => DEFAULT_COLORS.map((colors) => [...colors]))
  const [panelOpen, setPanelOpen] = useState(false)
  const water = useRef<WaterHandle>(null)
  const pointerRef = useRef({ active: false, lastTime: 0, lastX: 0, lastY: 0 })

  const activeConfig = CONFIGS[index]
  const colors = colorsByBg[index] ?? activeConfig.colors
  const label = useMemo(() => String(index + 1).padStart(2, "0"), [index])
  const go = (direction: number) => setIndex((current) => (current + direction + CONFIGS.length) % CONFIGS.length)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === "ArrowRight") go(1)
      if (event.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const updateColors = (next: string[]) => setColorsByBg((all) => CONFIGS.map((config, itemIndex) => itemIndex === index ? next : all[itemIndex] ?? config.colors))
  const changeColor = (stop: number, value: string) => { const next = [...colors]; next[stop] = value; updateColors(next) }
  const swap = (a: number, b: number) => { const next = [...colors]; [next[a], next[b]] = [next[b], next[a]]; updateColors(next) }
  const shuffle = () => updateColors([...colors].sort(() => Math.random() - .5))
  // Hand the hit point to the water simulation; the wave train after that is physics, not timing.
  const displaceWater = (event: ReactPointerEvent<HTMLElement>, kind: "tap" | "drag", strength = .78) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 100
    const y = ((event.clientY - bounds.top) / bounds.height) * 100
    water.current?.splash(x, y, strength, kind)
    return { x, y }
  }
  const isControlTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("button, input, .palette-panel"))
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isControlTarget(event.target)) return
    const point = displaceWater(event, "tap", .95)
    pointerRef.current = { active: true, lastTime: event.timeStamp, lastX: point.x, lastY: point.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 }
    event.currentTarget.style.setProperty("--ripple-x", `${point.x}%`)
    event.currentTarget.style.setProperty("--ripple-y", `${point.y}%`)
    if (!pointerRef.current.active) return
    const dx = point.x - pointerRef.current.lastX
    const dy = point.y - pointerRef.current.lastY
    const distance = Math.hypot(dx, dy)
    const elapsed = Math.max(16, event.timeStamp - pointerRef.current.lastTime)
    // Drag feeds the surface a stream of small, velocity-scaled displacements — a wake, not a splash.
    if (elapsed > 16 && distance > .4) {
      const strength = Math.min(1.45, Math.max(.42, (distance / elapsed) * 18))
      displaceWater(event, "drag", strength)
      pointerRef.current = { active: true, lastTime: event.timeStamp, lastX: point.x, lastY: point.y }
    }
  }
  const releaseLiquid = () => { pointerRef.current.active = false }

  return <main className="explorer" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={releaseLiquid} onPointerCancel={releaseLiquid}>
    <div className="background-stack">
      {CONFIGS.map((config, itemIndex) => <div className={`background-layer ${itemIndex === index ? "is-active" : ""}`} key={config.id}><BackgroundLayer config={config} colors={colorsByBg[itemIndex] ?? config.colors} /></div>)}
    </div>
    <WaterSurface ref={water} colors={colors} />
    <div className="edge-vignette" aria-hidden="true" />

    <header className="masthead">
      <p className="eyebrow">Chromatic studies</p>
      <div className="rule" />
      <p className="counter">{label} <span>/ {String(CONFIGS.length).padStart(2, "0")}</span></p>
    </header>

    <section className="caption" aria-live="polite">
      <p className="eyebrow">{activeConfig.note}</p>
      <h1>{activeConfig.name}</h1>
      <p className="keyhint">Click to ripple · drag to trail · <kbd>←</kbd><kbd>→</kbd> to navigate</p>
    </section>

    <nav className="navigation" aria-label="Background navigation">
      <button className="round-button" onClick={() => go(-1)} aria-label="Previous background"><Arrow direction="prev" /></button>
      <div className="dots">{CONFIGS.map((config, itemIndex) => <button className={`dot ${itemIndex === index ? "is-active" : ""}`} key={config.id} onClick={() => setIndex(itemIndex)} aria-label={`Show ${config.name}`} aria-current={itemIndex === index ? "true" : undefined} />)}</div>
      <button className="round-button" onClick={() => go(1)} aria-label="Next background"><Arrow direction="next" /></button>
    </nav>

    <div className="control-area">
      <button className={`palette-toggle ${panelOpen ? "is-open" : ""}`} onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen} aria-controls="palette-panel">
        <span className="palette-icon"><i /><i /><i /><i /></span><span>Palette</span>
      </button>
      {panelOpen && <aside id="palette-panel" className="palette-panel" aria-label={`${activeConfig.name} palette controls`}>
        <div className="panel-heading"><div><p className="eyebrow">Editable palette</p><h2>{activeConfig.name}</h2></div><span>{colors.length} stops</span></div>
        <div className="stops">{colors.map((color, stop) => <div className="color-stop" key={`${activeConfig.id}-${stop}`}>
          <label className="swatch" style={{ backgroundColor: isHex(color) ? color : "#000" }}><input type="color" value={isHex(color) ? color : "#000000"} onChange={(event) => changeColor(stop, event.target.value)} aria-label={`Pick color stop ${stop + 1}`} /></label>
          <input className="hex-input" value={color} onChange={(event) => changeColor(stop, event.target.value)} onBlur={(event) => { if (!isHex(event.target.value)) changeColor(stop, DEFAULT_COLORS[index][stop]) }} aria-label={`Hex value for color stop ${stop + 1}`} spellCheck="false" />
          <div className="move-buttons"><button onClick={() => swap(stop, (stop - 1 + colors.length) % colors.length)} aria-label={`Move color ${stop + 1} earlier`}>↑</button><button onClick={() => swap(stop, (stop + 1) % colors.length)} aria-label={`Move color ${stop + 1} later`}>↓</button></div>
        </div>)}</div>
        <div className="panel-actions"><button onClick={shuffle}>Shuffle</button><button onClick={() => updateColors([...colors].reverse())}>Reverse</button><button onClick={() => updateColors([...DEFAULT_COLORS[index]])}>Reset</button></div>
      </aside>}
    </div>
  </main>
}
