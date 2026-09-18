"use client";

import type { ProgressEvent } from "@/core/types";
import { Card, Spinner } from "./ui/primitives";

const STAGE_LABELS: Record<ProgressEvent["stage"], string> = {
  triage: "Reading the file",
  structural: "Structure and streams",
  fonts: "Fonts",
  strip: "Thumbnails and metadata",
  images: "Images — encode, score, decide",
  validate: "Checking the result",
};

/**
 * Progress that names the stage rather than showing a bar alone. The image
 * stage is slow *because* we score our own output, and saying so while it runs
 * is the difference between "this tool is slow" and "this tool is checking".
 */
export function ProgressPanel({ progress, fileName }: { progress: ProgressEvent | null; fileName: string }) {
  const fraction = progress?.fraction ?? 0;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Spinner />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fileName}</p>
          <p className="text-sm text-ink-2">{progress?.message ?? "Starting"}</p>
        </div>
        <span className="tnum ml-auto text-sm text-ink-2">{Math.round(fraction * 100)}%</span>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${Math.max(2, fraction * 100)}%` }}
        />
      </div>

      <ol className="mt-4 grid gap-1 text-xs text-ink-3 sm:grid-cols-3">
        {(Object.keys(STAGE_LABELS) as ProgressEvent["stage"][]).map((stage) => (
          <li key={stage} className={progress?.stage === stage ? "text-ink" : undefined}>
            {STAGE_LABELS[stage]}
          </li>
        ))}
      </ol>
    </Card>
  );
}
