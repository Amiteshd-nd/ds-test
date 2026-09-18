"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompressorClient } from "@/worker/client";
import type { ResultView, WhichFile } from "@/worker/protocol";
import { Button, ScoreBadge } from "./ui/primitives";

const RENDER_DPI = 150;

/**
 * The comparison viewer (FR-7.4 … FR-7.7) — the surface that makes the 80%
 * decision meaningful rather than a coin flip.
 *
 * It opens at 100% on the worst-affected region of the worst-affected page.
 * Fit-to-page would hide exactly the artifacts the user is being asked to
 * judge, which would make the whole screen dishonest.
 */
export function ComparisonViewer({
  client,
  jobId,
  which,
  result,
  floor,
  onClose,
}: {
  client: CompressorClient;
  jobId: string;
  which: WhichFile;
  result: ResultView;
  floor: number;
  onClose: () => void;
}) {
  const worstIndex = result.worstPage?.index ?? 0;
  const [page, setPage] = useState(worstIndex);
  const [layout, setLayout] = useState<"side" | "swipe">("side");
  const [split, setSplit] = useState(50);
  const [heatmap, setHeatmap] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heatCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBefore(null);
    setAfter(null);
    setError(null);
    (async () => {
      try {
        const [original, compressed] = await Promise.all([
          client.preview(jobId, "original", page, RENDER_DPI),
          client.preview(jobId, which, page, RENDER_DPI),
        ]);
        if (cancelled) return;
        setBefore(original.url);
        setAfter(compressed.url);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, jobId, page, which]);

  // FR-7.5 — land on the worst region, at 100%, rather than at fit-to-page.
  useEffect(() => {
    const region = page === worstIndex ? result.worstPage?.region ?? null : null;
    const element = scroller.current;
    if (!element || !before) return;
    if (!region) {
      element.scrollTo({ top: 0, left: 0 });
      return;
    }
    const scale = RENDER_DPI / 96; // regions are measured on the scoring raster
    element.scrollTo({
      left: Math.max(0, region.x * scale - element.clientWidth / 3),
      top: Math.max(0, region.y * scale - element.clientHeight / 3),
    });
  }, [before, page, worstIndex, result.worstPage]);

  useEffect(() => {
    if (!heatmap || !before || !after) return;
    void drawHeatmap(heatCanvas.current, before, after);
  }, [heatmap, before, after]);

  const strip = useMemo(() => result.pageScores, [result.pageScores]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="mr-auto">
          <h2 className="font-medium text-ink">
            Page {page + 1} of {result.pageScores.length || 1}
          </h2>
          <p className="text-xs text-ink-2">
            Score <ScoreBadge score={result.pageScores[page] ?? null} floor={floor} /> · shown at 100%, opened on the
            most-affected area
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
          <Button variant={layout === "side" ? "secondary" : "ghost"} onClick={() => setLayout("side")}>
            Side by side
          </Button>
          <Button variant={layout === "swipe" ? "secondary" : "ghost"} onClick={() => setLayout("swipe")}>
            Overlay
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2" title="Exaggerates differences — useful for experts, alarming for everyone else.">
          <input type="checkbox" checked={heatmap} onChange={(event) => setHeatmap(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Difference heatmap
        </label>
        <Button onClick={onClose}>Close</Button>
      </header>

      <div ref={scroller} className="flex-1 overflow-auto bg-surface-2 p-4">
        {error ? <p className="text-sm text-fail">{error}</p> : null}
        {!before || !after ? (
          <p className="text-sm text-ink-2">Rendering both versions…</p>
        ) : heatmap ? (
          <canvas ref={heatCanvas} className="mx-auto block shadow-sm" />
        ) : layout === "side" ? (
          <div className="flex min-w-max gap-4">
            <Pane label="Original" src={before} />
            <Pane label="Compressed" src={after} />
          </div>
        ) : (
          <div className="relative mx-auto w-max">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={after} alt="Compressed" className="block max-w-none shadow-sm" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={before}
              alt="Original"
              className="absolute inset-0 block max-w-none"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div className="absolute inset-y-0" style={{ left: `${split}%`, width: 1, background: "var(--accent)" }} />
          </div>
        )}
      </div>

      {layout === "swipe" ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-xs text-ink-2">
          <span>Original</span>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span>Compressed</span>
        </div>
      ) : null}

      {/* FR-7.6 — the distribution, with every outlier one click away. */}
      <footer className="border-t border-line px-4 py-3">
        <div className="mb-2 flex items-baseline gap-3 text-xs text-ink-3">
          <span>Per-page score</span>
          <span className="tnum">
            worst {Math.min(...(strip.length ? strip : [0])).toFixed(1)} · median{" "}
            {strip.length ? [...strip].sort((a, b) => a - b)[Math.floor(strip.length / 2)].toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex h-12 items-end gap-px overflow-x-auto">
          {strip.map((score, index) => (
            <button
              key={index}
              type="button"
              title={`Page ${index + 1}: ${score.toFixed(1)}`}
              onClick={() => setPage(index)}
              className={`w-2 shrink-0 rounded-t-sm transition-opacity ${index === page ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
              style={{
                height: `${Math.max(6, (score / 100) * 48)}px`,
                background: score >= floor ? "var(--pass)" : score >= floor - 8 ? "var(--warn)" : "var(--fail)",
              }}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}

function Pane({ label, src }: { label: string; src: string }) {
  return (
    <figure>
      <figcaption className="mb-2 text-xs uppercase tracking-wide text-ink-3">{label}</figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="block max-w-none shadow-sm" />
    </figure>
  );
}

/**
 * The heatmap is computed here rather than carried from the worker: it is a
 * view of two images the viewer already has, and recomputing it costs less than
 * shipping a score map for every page of a 200-page document.
 */
async function drawHeatmap(canvas: HTMLCanvasElement | null, beforeUrl: string, afterUrl: string): Promise<void> {
  if (!canvas) return;
  const [before, after] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  canvas.width = width;
  canvas.height = height;

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  const ctx = canvas.getContext("2d");
  if (!scratchCtx || !ctx) return;

  scratchCtx.drawImage(before, 0, 0);
  const beforeData = scratchCtx.getImageData(0, 0, width, height);
  scratchCtx.clearRect(0, 0, width, height);
  scratchCtx.drawImage(after, 0, 0);
  const afterData = scratchCtx.getImageData(0, 0, width, height);

  const out = ctx.createImageData(width, height);
  for (let i = 0; i < out.data.length; i += 4) {
    const delta =
      (Math.abs(beforeData.data[i] - afterData.data[i]) +
        Math.abs(beforeData.data[i + 1] - afterData.data[i + 1]) +
        Math.abs(beforeData.data[i + 2] - afterData.data[i + 2])) /
      3;
    const intensity = Math.min(255, delta * 6);
    out.data[i] = 20 + intensity;
    out.data[i + 1] = 20 + (255 - intensity) * 0.2;
    out.data[i + 2] = 40;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load a rendered page."));
    image.src = url;
  });
}
