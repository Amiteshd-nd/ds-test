/**
 * Byte and percentage formatting. One module so the gate copy, the results
 * screen and the API report can never disagree about units — FR-6.5 requires
 * both file sizes be stated in the same units.
 */

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(n: number, fractionDigits?: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1000) return `${Math.round(n)} B`;
  let value = n;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = fractionDigits ?? (value < 10 ? 1 : value < 100 ? 1 : 0);
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Format a pair of sizes in one shared unit, so "3.1 MB vs 8.9 MB" never becomes "3.1 MB vs 8900 KB". */
export function formatPair(a: number, b: number): [string, string] {
  const scale = Math.max(a, b);
  let unit = 0;
  let div = 1;
  while (scale / div >= 1000 && unit < UNITS.length - 1) {
    div *= 1024;
    unit += 1;
  }
  const fmt = (n: number) => {
    const v = n / div;
    return `${v.toFixed(v < 10 ? 1 : v < 100 ? 1 : 0)} ${UNITS[unit]}`;
  };
  return [fmt(a), fmt(b)];
}

/** 0.8734 -> "87%". Ratios are always reported as "smaller by". */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function ratioOf(inputBytes: number, outputBytes: number): number {
  if (inputBytes <= 0) return 0;
  return 1 - outputBytes / inputBytes;
}
