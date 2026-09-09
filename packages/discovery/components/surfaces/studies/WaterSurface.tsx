'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react"
import { WaterSurface as Simulation, type SplashKind } from "./water"

export type WaterHandle = {
  /** Displace the surface at a point given in percentages of the element box. */
  splash: (xPercent: number, yPercent: number, strength: number, kind: SplashKind) => void
}

/**
 * The interactive water layer: the pigment wash and drifting sheen of the original
 * surface, plus two canvases driven by the height-field simulation in ./water.
 *
 * The canvases are deliberately imperative. Ripples update every frame and React
 * has nothing useful to say about pixels, so the pointer handlers in App call
 * `splash()` on the handle and the simulation owns its own loop from there.
 */
const WaterSurface = forwardRef<WaterHandle, { colors: string[] }>(function WaterSurface({ colors }, ref) {
  const refractRef = useRef<HTMLCanvasElement>(null)
  const specRef = useRef<HTMLCanvasElement>(null)
  const simulation = useRef<Simulation | null>(null)

  const pigmentStyle = {
    "--pigment-a": colors[0] ?? "#5d22ef",
    "--pigment-b": colors[Math.floor(colors.length / 2)] ?? "#00c8ff",
    "--pigment-c": colors.at(-2) ?? "#f1ff34",
  } as CSSProperties

  useEffect(() => {
    const refract = refractRef.current
    const spec = specRef.current
    if (!refract || !spec) return
    // Still water for anyone who asked for less motion — the splash calls become no-ops.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const sim = new Simulation(refract, spec)
    simulation.current = sim
    // Dev handle: lets the surface be stepped by hand when tuning, and in preview panes
    // that suspend requestAnimationFrame. Next inlines NODE_ENV, so this branch is
    // dead code in a production build.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { water?: Simulation }).water = sim

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      sim.resize(Math.round(width), Math.round(height))
    })
    observer.observe(refract.parentElement ?? refract)

    return () => {
      observer.disconnect()
      sim.destroy()
      simulation.current = null
    }
  }, [])

  useEffect(() => {
    simulation.current?.setPalette(colors)
  }, [colors])

  useImperativeHandle(ref, () => ({
    splash: (xPercent, yPercent, strength, kind) => simulation.current?.splash(xPercent, yPercent, strength, kind),
  }), [])

  // Two wrappers on purpose: the pigment wash keeps its screen-blended group, while the
  // canvases blend straight against the background (a blend mode on a shared parent would
  // trap them in that group and flatten both passes).
  return <>
    <div className="liquid-surface" aria-hidden="true">
      <div className="liquid-colorfield" style={pigmentStyle}><i /><i /><i /></div>
      <svg className="liquid-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <defs>
          <filter id="liquid-noise" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency=".012 .026" numOctaves="2" seed="13" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <radialGradient id="liquid-sheen" cx="50%" cy="45%" r="58%">
            <stop offset="0" stopColor="#fff" stopOpacity=".32" />
            <stop offset=".32" stopColor="#d8f7ff" stopOpacity=".08" />
            <stop offset="1" stopColor="#080d1d" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1000" height="1000" fill="url(#liquid-sheen)" filter="url(#liquid-noise)" opacity=".38" />
      </svg>
    </div>
    <div className="water-surface" aria-hidden="true">
      <canvas className="water-refract" ref={refractRef} />
      <canvas className="water-spec" ref={specRef} />
    </div>
  </>
})

export default WaterSurface
