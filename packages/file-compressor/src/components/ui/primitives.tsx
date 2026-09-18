"use client";

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</section>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-accent text-accent-ink hover:opacity-90",
    secondary: "border border-line bg-surface-2 text-ink hover:border-ink-3",
    ghost: "text-ink-2 hover:text-ink",
  } as const;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-2">{hint}</div> : null}
    </div>
  );
}

/**
 * The fidelity score, always shown next to bytes rather than instead of them
 * (FR-7.8). Colour is the mode's own floor, not a fixed scale — a page at 80 is
 * a pass in Balanced and a failure in Visually Lossless, and the badge should
 * not imply otherwise.
 */
export function ScoreBadge({ score, floor }: { score: number | null; floor: number }) {
  if (score === null) return <span className="text-ink-3">—</span>;
  const tone = score >= floor ? "text-pass" : score >= floor - 8 ? "text-warn" : "text-fail";
  return <span className={`tnum font-semibold ${tone}`}>{score.toFixed(1)}</span>;
}

/** A stacked proportion bar. Used for the byte budget and for stage savings. */
export function StackedBar({
  segments,
  height = 12,
}: {
  segments: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-surface-2" style={{ height }}>
      {segments.map((segment) => (
        <div
          key={segment.label}
          title={`${segment.label}: ${Math.round((segment.value / total) * 100)}%`}
          style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
        />
      ))}
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" />
  );
}
