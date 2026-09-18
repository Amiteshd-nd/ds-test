/**
 * Cheap image statistics — one pass over a subsample of pixels, reused by three
 * callers: classification (FR-5.1), the seed model (PRD §4), and the analysis
 * screen's explanation of what the document is made of.
 *
 * Deliberately a subsample. On a 600 DPI A4 scan a full pass is 35 million
 * pixels, and every statistic here is stable at a few hundred thousand.
 */

import type { ImageClass } from "../types";
import type { PixelPlane } from "./score";

export interface ImageFeatures {
  /** Distinct RGB values, counted up to `COLOR_CAP` then reported as the cap. */
  distinctColors: number;
  colorCapped: boolean;
  /** Fraction of sampled pixels where r == g == b. */
  greyFraction: number;
  /** Fraction at pure black or pure white — the signature of a bilevel scan. */
  extremeFraction: number;
  /** Mean absolute horizontal gradient, 0..1. Line art and text run high. */
  edgeDensity: number;
  /** Fraction of sampled pixels whose neighbourhood is flat. Screenshots run high. */
  flatFraction: number;
  /** Shannon entropy of the luma histogram, in bits (0..8). */
  entropy: number;
  sampled: number;
}

const COLOR_CAP = 4096;

export function extractFeatures(plane: PixelPlane): ImageFeatures {
  const { data, width, height } = plane;
  const total = width * height;
  // Sample on a grid rather than randomly: a stride keeps spatial structure, so
  // the gradient terms below still mean something.
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 200_000)));
  const colors = new Set<number>();
  const histogram = new Uint32Array(256);

  let sampled = 0;
  let grey = 0;
  let extreme = 0;
  let gradientSum = 0;
  let flat = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sampled += 1;
      if (r === g && g === b) grey += 1;
      if ((r < 16 && g < 16 && b < 16) || (r > 239 && g > 239 && b > 239)) extreme += 1;
      if (colors.size < COLOR_CAP) colors.add((r << 16) | (g << 8) | b);
      const luma = (r * 77 + g * 151 + b * 28) >> 8;
      histogram[luma] += 1;

      const nx = x + stride < width ? x + stride : x;
      const j = (y * width + nx) * 4;
      const neighbourLuma = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
      const gradient = Math.abs(luma - neighbourLuma);
      gradientSum += gradient;
      if (gradient <= 2) flat += 1;
    }
  }

  let entropy = 0;
  for (let i = 0; i < 256; i += 1) {
    if (histogram[i] === 0) continue;
    const p = histogram[i] / sampled;
    entropy -= p * Math.log2(p);
  }

  return {
    distinctColors: colors.size,
    colorCapped: colors.size >= COLOR_CAP,
    greyFraction: grey / sampled,
    extremeFraction: extreme / sampled,
    edgeDensity: gradientSum / sampled / 255,
    flatFraction: flat / sampled,
    entropy,
    sampled,
  };
}

/**
 * FR-5.1: classify on colour count and pixel distribution, not on the declared
 * colour space. A "DeviceRGB" XObject that holds a scanned page of black text is
 * a bilevel image, and routing it to JPEG on the strength of its declaration is
 * exactly the mistake this rule exists to prevent.
 */
export function classify(features: ImageFeatures, bytes: number, tinyThreshold: number): ImageClass {
  if (bytes < tinyThreshold) return "tiny";

  const nearlyAllExtreme = features.extremeFraction > 0.92;
  if (nearlyAllExtreme && features.distinctColors <= 64) return "bilevel";

  // Few colours, hard edges, large flat areas: screenshots, charts, line art.
  // JPEG rings badly on these, so they must never reach the photo path.
  if (!features.colorCapped && features.distinctColors <= 512 && features.flatFraction > 0.6) {
    return "indexed";
  }

  if (features.greyFraction > 0.98) return "greyscale";

  return "photographic";
}

/**
 * The seed model of PRD §4, as a closed-form predictor rather than LightGBM.
 *
 * A gradient-boosted model needs a trained artifact and the benchmark corpus to
 * train it on; neither exists in a browser-only build. This is the same idea at
 * lower resolution — predict where the search will land from cheap features, so
 * the search starts near the answer instead of at the midpoint. It cuts the
 * common case to two or three encode-and-score cycles, which is what the
 * optimisation was for. Replacing it with a real model means changing this
 * function and nothing else.
 */
export function seedQuality(features: ImageFeatures, floor: number): number {
  // Start from the floor: a floor of 90 wants high quality, 62 does not.
  let q = 42 + (floor - 60) * 0.85;

  // Busy, high-entropy images hide artifacts; flat ones show every block edge.
  q += (features.entropy - 6.5) * -3.5;
  q += (features.flatFraction - 0.5) * 22;
  // Hard edges ring. Buy them a little headroom.
  q += Math.min(12, features.edgeDensity * 90);

  return Math.round(Math.min(95, Math.max(30, q)));
}
