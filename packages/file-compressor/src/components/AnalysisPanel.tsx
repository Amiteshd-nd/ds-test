"use client";

import { useState } from "react";
import type { CompressOptions, Inventory, ModeId } from "@/core/types";
import { MODES, MODE_ORDER } from "@/core/modes";
import { formatBytes } from "@/core/bytes";
import { Button, Card, StackedBar } from "./ui/primitives";

const BUDGET_COLORS: Record<string, string> = {
  Images: "#1f5eff",
  Fonts: "#8b5cf6",
  Content: "#0ea5a3",
  Metadata: "#f59e0b",
  Structure: "#94a3b8",
};

/**
 * The analysis screen (FR-7.1 … FR-7.3). Shown before compression starts, and
 * the reason the recommendation that follows reads as a conclusion rather than
 * a preference: the user has already seen what the file is made of.
 */
export function AnalysisPanel({
  inventory,
  fileName,
  options,
  onOptions,
  onCompress,
  onReset,
}: {
  inventory: Inventory;
  fileName: string;
  options: CompressOptions;
  onOptions: (next: CompressOptions) => void;
  onCompress: () => void;
  onReset: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const budget = inventory.budget;
  const segments = [
    { label: "Images", value: budget.images, color: BUDGET_COLORS.Images },
    { label: "Fonts", value: budget.fonts, color: BUDGET_COLORS.Fonts },
    { label: "Content", value: budget.content, color: BUDGET_COLORS.Content },
    { label: "Metadata", value: budget.metadata, color: BUDGET_COLORS.Metadata },
    { label: "Structure", value: budget.overhead, color: BUDGET_COLORS.Structure },
  ];
  const blocking = inventory.refusals.filter((refusal) => !refusal.overridable);
  const conformance = inventory.refusals.find((refusal) => refusal.code === "conformance");

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card>
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">What is in this file</h2>
            <p className="mt-1 truncate text-lg font-medium text-ink" title={fileName}>
              {fileName}
            </p>
          </div>
          <div className="tnum shrink-0 text-right text-sm text-ink-2">
            {formatBytes(inventory.bytes)} · {inventory.pageCount} page{inventory.pageCount === 1 ? "" : "s"} · PDF{" "}
            {inventory.pdfVersion}
          </div>
        </header>

        <div className="mt-5">
          <StackedBar segments={segments} height={14} />
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
                <dt className="text-ink-2">{segment.label}</dt>
                <dd className="tnum ml-auto text-ink">{formatBytes(segment.value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <Facet label="Images" value={`${inventory.images.length}`} />
          <Facet
            label="Highest DPI"
            value={
              inventory.images.some((image) => image.effectiveDpi)
                ? `${Math.max(...inventory.images.map((image) => image.effectiveDpi ?? 0))}`
                : "—"
            }
          />
          <Facet label="Fonts" value={`${inventory.fonts.length}`} />
          <Facet
            label="Structure"
            value={[
              inventory.flags.hasAcroForm ? "form" : null,
              inventory.flags.hasTaggedStructure ? "tagged" : null,
              inventory.flags.linearized ? "linearised" : null,
            ]
              .filter(Boolean)
              .join(", ") || "plain"}
          />
        </div>

        {blocking.length > 0 ? (
          <div className="mt-5 rounded-lg border border-fail/40 bg-fail/5 p-4 text-sm text-ink">
            {blocking.map((refusal) => (
              <p key={refusal.code}>{refusal.message}</p>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">How hard to push</h2>
        <p className="mt-2 text-sm text-ink-2">{inventory.rationale}</p>

        <div className="mt-4 space-y-2">
          {MODE_ORDER.map((id) => (
            <ModeRow
              key={id}
              id={id}
              selected={options.mode === id}
              recommended={inventory.recommended === id}
              estimate={inventory.estimates[id]}
              onSelect={() => onOptions({ ...options, mode: id })}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="mt-4 text-xs font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {showAdvanced ? "Hide" : "Show"} what else gets removed
        </button>

        {showAdvanced ? (
          <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
            <Toggle
              label="Stored page thumbnails"
              hint="Viewers regenerate these."
              checked={options.strip.thumbnails}
              onChange={(value) => onOptions({ ...options, strip: { ...options.strip, thumbnails: value } })}
            />
            <Toggle
              label="Author, producer and creation host"
              hint="Removed by default in the browser."
              checked={options.strip.metadata}
              onChange={(value) => onOptions({ ...options, strip: { ...options.strip, metadata: value } })}
            />
            <Toggle
              label="Document JavaScript"
              hint="Kept automatically on forms and signed files."
              checked={options.strip.javascript}
              onChange={(value) => onOptions({ ...options, strip: { ...options.strip, javascript: value } })}
            />
            <Toggle
              label="Embedded file attachments"
              checked={options.strip.embeddedFiles}
              onChange={(value) => onOptions({ ...options, strip: { ...options.strip, embeddedFiles: value } })}
            />
            <Toggle
              label="Fast mode"
              hint="Predict the setting instead of searching for it. The quality gate still runs."
              checked={options.fastMode}
              onChange={(value) => onOptions({ ...options, fastMode: value })}
            />
            {conformance ? (
              <Toggle
                label="Drop the conformance claim"
                hint={conformance.message}
                checked={options.dropConformance}
                onChange={(value) => onOptions({ ...options, dropConformance: value })}
              />
            ) : null}
            <p className="pt-1 text-xs text-ink-3">
              Bookmarks, links, annotations, form fields and tagged-PDF accessibility structure are always kept.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" onClick={onCompress} disabled={blocking.length > 0}>
            Compress
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Use a different file
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Facet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="tnum mt-0.5 text-ink">{value}</div>
    </div>
  );
}

function ModeRow({
  id,
  selected,
  recommended,
  estimate,
  onSelect,
}: {
  id: ModeId;
  selected: boolean;
  recommended: boolean;
  estimate: { low: number; high: number };
  onSelect: () => void;
}) {
  const mode = MODES[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-lg border p-3 text-left transition-colors ${
        selected ? "border-accent bg-accent/5" : "border-line hover:border-ink-3"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink">
          {mode.label}
          {recommended ? <span className="ml-2 text-xs font-normal text-accent">recommended</span> : null}
        </span>
        <span className="tnum shrink-0 text-sm text-ink-2">
          {estimate.high <= 0.001
            ? "no change"
            : `about ${Math.round(estimate.low * 100)}–${Math.round(estimate.high * 100)}% smaller`}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{mode.blurb}</p>
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
      />
      <span>
        <span className="text-ink">{label}</span>
        {hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}
