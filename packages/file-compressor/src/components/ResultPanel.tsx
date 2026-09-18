"use client";

import { useMemo } from "react";
import type { Inventory, ModeId } from "@/core/types";
import type { ResultView } from "@/worker/protocol";
import { MODES, MODE_ORDER } from "@/core/modes";
import { formatBytes, formatRatio } from "@/core/bytes";
import { Button, Card, ScoreBadge, StackedBar, Stat } from "./ui/primitives";

const STAGE_COLORS: Record<string, string> = {
  structural: "#94a3b8",
  fonts: "#8b5cf6",
  strip: "#f59e0b",
  images: "#1f5eff",
};

/**
 * FR-7.8 — lead with both numbers, bytes saved *and* fidelity, never bytes
 * alone. A compressor that reports only its ratio is reporting only half of
 * what it did.
 */
export function ResultPanel({
  result,
  inventory,
  fileName,
  onDownload,
  onCompare,
  onRecompress,
  onReset,
}: {
  result: ResultView;
  inventory: Inventory;
  fileName: string;
  onDownload: () => void;
  onCompare: () => void;
  onRecompress: (mode: ModeId) => void;
  onReset: () => void;
}) {
  const mode = MODES[result.mode];
  const worst = result.pageScores.length > 0 ? Math.min(...result.pageScores) : null;
  const median = useMemo(() => {
    if (result.pageScores.length === 0) return null;
    const sorted = [...result.pageScores].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [result.pageScores]);

  const segments = result.stages
    .filter((stage) => stage.bytes > 0)
    .map((stage) => ({ label: stage.label, value: stage.bytes, color: STAGE_COLORS[stage.stage] ?? "#94a3b8" }));

  const searched = result.images.filter((image) => image.iterations > 0);
  const cacheHits = result.images.filter((image) => image.cacheHit).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Stat
            label="Smaller by"
            value={formatRatio(result.ratio)}
            hint={`${formatBytes(result.inputBytes)} → ${formatBytes(result.outputBytes)}`}
          />
          <Stat
            label="Worst page score"
            value={<ScoreBadge score={worst} floor={mode.pageFloor} />}
            hint={`Floor for ${mode.label} is ${mode.pageFloor}; median page ${median?.toFixed(1) ?? "—"}`}
          />
          <Stat label="Took" value={`${(result.ms / 1000).toFixed(1)}s`} hint={`${result.pageScores.length} pages scored`} />
        </div>

        {result.validation.fellBackTo ? (
          <p className="mt-4 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-ink">
            {result.validation.fellBackTo === "original"
              ? "We could not produce a file we trust, so this is your original, unchanged."
              : "The lossy pass did not clear this mode's floor, so this is the lossless-only result. Everything stages 1–4 won is still here."}
          </p>
        ) : null}

        {segments.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-xs uppercase tracking-wide text-ink-3">Where the saving came from</h3>
            <div className="mt-2">
              <StackedBar segments={segments} height={12} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {segments.map((segment) => (
                <div key={segment.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
                  <dt className="text-ink-2">{segment.label}</dt>
                  <dd className="tnum ml-auto text-ink">{formatBytes(segment.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <ul className="mt-5 space-y-1.5 text-sm text-ink-2">
          {result.causes.map((cause) => (
            <li key={cause} className="flex gap-2">
              <span className="text-ink-3">·</span>
              <span>{cause}</span>
            </li>
          ))}
        </ul>

        {result.validation.notes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-ink-3">
            {result.validation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="primary" onClick={onDownload}>
            Download {fileName.replace(/\.pdf$/i, "")}-compressed.pdf
          </Button>
          <Button onClick={onCompare}>Compare with the original</Button>
          <Button variant="ghost" onClick={onReset}>
            Another file
          </Button>
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <h3 className="text-xs uppercase tracking-wide text-ink-3">Checks that had to pass</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <Check ok={result.validation.opens} label="The compressed file opens" />
            <Check ok={result.validation.pageCountMatches} label={`Page count still ${inventory.pageCount}`} />
            <Check ok={result.validation.rendersAllPages} label="Every page renders without error" />
            <Check
              ok={result.validation.textExtractionMatches}
              label="Extracted text is identical — search, copy and screen readers still work"
            />
            <Check
              ok={worst === null || worst >= mode.pageFloor}
              label={`No page below the ${mode.label} floor of ${mode.pageFloor}`}
            />
          </ul>
        </Card>

        <Card>
          <h3 className="text-xs uppercase tracking-wide text-ink-3">The search</h3>
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <Stat label="Images" value={result.images.length} />
            <Stat
              label="Cycles / image"
              value={
                searched.length > 0
                  ? (searched.reduce((sum, image) => sum + image.iterations, 0) / searched.length).toFixed(1)
                  : "—"
              }
              hint="encode and score"
            />
            <Stat label="Cache hits" value={cacheHits} hint="same image, searched once" />
          </div>
          {result.images.length > 0 ? (
            <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-2 text-ink-3">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Image</th>
                    <th className="px-2 py-1.5 font-medium">Kind</th>
                    <th className="px-2 py-1.5 font-medium">What happened</th>
                    <th className="px-2 py-1.5 text-right font-medium">Before</th>
                    <th className="px-2 py-1.5 text-right font-medium">After</th>
                    <th className="px-2 py-1.5 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="text-ink-2">
                  {result.images.map((image) => (
                    <tr key={image.id} className="border-t border-line">
                      <td className="tnum px-2 py-1.5">#{image.id}</td>
                      <td className="px-2 py-1.5">{image.klass}</td>
                      <td className="px-2 py-1.5">
                        {image.action.replace(/-/g, " ")}
                        {image.fromDpi && image.toDpi && image.fromDpi !== image.toDpi
                          ? ` (${image.fromDpi}→${image.toDpi} DPI)`
                          : ""}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">{formatBytes(image.beforeBytes)}</td>
                      <td className="tnum px-2 py-1.5 text-right">{formatBytes(image.afterBytes)}</td>
                      <td className="tnum px-2 py-1.5 text-right">
                        <ScoreBadge score={image.score} floor={mode.imageFloor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-xs uppercase tracking-wide text-ink-3">Try another setting</h3>
          <p className="mt-1 text-xs text-ink-2">Runs again from the same file — no re-upload, because there was never an upload.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MODE_ORDER.filter((id) => id !== result.mode).map((id) => (
              <Button key={id} onClick={() => onRecompress(id)}>
                {MODES[id].label}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-pass" : "text-fail"}>{ok ? "✓" : "✗"}</span>
      <span className="text-ink-2">{label}</span>
    </li>
  );
}
