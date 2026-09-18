/**
 * The perceptual metric — the half of the product that decides whether a
 * candidate is allowed to exist.
 *
 * ## Why this is not SSIMULACRA2
 *
 * PRD §9 specifies SSIMULACRA2 from libjxl. That is a C++ metric; this build
 * runs entirely in the browser (PRD §10's client-side path), so we compute a
 * multi-scale SSIM in a decorrelated opponent colour space and map it onto the
 * SSIMULACRA2 scale, rather than shipping a 3 MB Wasm build of libjxl to score
 * a logo. The mapping below is a curve fit through the JPEG quality ladder, so
 * the floors in `modes.ts` keep their meaning: ~90 is the threshold of visual
 * losslessness, ~70 is "differences findable on close inspection".
 *
 * This is an approximation and is labelled as one everywhere it surfaces. It
 * shares SSIMULACRA2's important property — it punishes the artifacts JPEG
 * actually produces (blocking, ringing on hard edges, chroma bleed) rather than
 * rewarding low mean-squared error — but it is not calibrated against the
 * human-judgement set in FR-8.5. Swapping in real SSIMULACRA2 means replacing
 * `scorePlanes` and re-deriving `DISTANCE_*`; nothing else in the pipeline
 * looks at how the number was produced.
 */

import type { Rect } from "../types";

export interface PixelPlane {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface ScoreDetail {
  /** 0..100 on the SSIMULACRA2 scale. */
  score: number;
  /** Worst-scoring region, in pixels of the reference image (FR-6.3). */
  worst: Rect | null;
  /** Per-block scores at full scale, row-major. Used for the heatmap (FR-7.7). */
  map: Float32Array;
  mapWidth: number;
  mapHeight: number;
}

/** Curve fit: score = 100 - A * (1 - msssim)^B, anchored on the JPEG ladder
 *  (q90 ≈ 93, q75 ≈ 85, q50 ≈ 76, q30 ≈ 65). See the module comment. */
const DISTANCE_A = 277;
const DISTANCE_B = 0.694;
/** Below this the fit would cross zero and every badly damaged image would
 *  score the same. The tail keeps the ordering instead — nothing the gate does
 *  depends on it, but a metric that ranks two ruined images as equal is a
 *  metric you cannot debug with. */
const TAIL_KNEE = 10;
const TAIL_DECAY = 25;

function toScale(distance: number): number {
  const raw = 100 - DISTANCE_A * Math.pow(distance, DISTANCE_B);
  if (raw >= TAIL_KNEE) return Math.min(100, raw);
  return TAIL_KNEE * Math.exp((raw - TAIL_KNEE) / TAIL_DECAY);
}

const SCALE_WEIGHTS = [0.5, 0.3, 0.2];
const CHROMA_WEIGHT = 0.15;
const BLOCK = 8;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/**
 * Score a candidate against a reference. Both must be RGBA at identical
 * dimensions — a downsampled candidate is resampled back up first, because the
 * user sees it at the original size and that is what must be judged.
 */
export function scoreRgba(reference: PixelPlane, candidate: PixelPlane): ScoreDetail {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `scoreRgba: dimension mismatch ${reference.width}x${reference.height} vs ${candidate.width}x${candidate.height}`,
    );
  }
  const { width, height } = reference;
  const ref = toOpponent(reference);
  const cand = toOpponent(candidate);

  // Luma across scales: blocking artifacts show at full scale, while banding
  // and chroma drift only become visible once the image is shrunk.
  let lumaTotal = 0;
  let weightTotal = 0;
  let full: SsimPlaneResult | null = null;
  let plane = { a: ref.y, b: cand.y, width, height };
  for (let scale = 0; scale < SCALE_WEIGHTS.length; scale += 1) {
    if (plane.width < BLOCK || plane.height < BLOCK) break;
    const result = ssimPlane(plane.a, plane.b, plane.width, plane.height);
    if (scale === 0) full = result;
    lumaTotal += SCALE_WEIGHTS[scale] * result.mean;
    weightTotal += SCALE_WEIGHTS[scale];
    plane = {
      a: halve(plane.a, plane.width, plane.height),
      b: halve(plane.b, plane.width, plane.height),
      width: plane.width >> 1,
      height: plane.height >> 1,
    };
  }
  const luma = weightTotal > 0 ? lumaTotal / weightTotal : 1;

  // Chroma at half resolution — that is roughly where human colour acuity sits,
  // and it is where 4:2:0 subsampling does its damage.
  let chroma = 1;
  if (width >= BLOCK * 2 && height >= BLOCK * 2) {
    const cw = width >> 1;
    const ch = height >> 1;
    const cb = ssimPlane(halve(ref.cb, width, height), halve(cand.cb, width, height), cw, ch).mean;
    const cr = ssimPlane(halve(ref.cr, width, height), halve(cand.cr, width, height), cw, ch).mean;
    chroma = (cb + cr) / 2;
  }

  const combined = (1 - CHROMA_WEIGHT) * luma + CHROMA_WEIGHT * chroma;
  const distance = Math.max(0, 1 - combined);
  const score = toScale(distance);

  const map = full?.map ?? new Float32Array([1]);
  const mapWidth = full?.mapWidth ?? 1;
  const mapHeight = full?.mapHeight ?? 1;
  return { score, worst: worstRegion(map, mapWidth, mapHeight, width, height), map, mapWidth, mapHeight };
}

interface SsimPlaneResult {
  mean: number;
  map: Float32Array;
  mapWidth: number;
  mapHeight: number;
}

/**
 * SSIM over non-overlapping 8x8 blocks. Gaussian-windowed SSIM is the textbook
 * form, but block SSIM on 8x8 aligns with the JPEG grid, which makes it more
 * sensitive to exactly the artifact we are gating on and cheaper to compute in
 * the same pass.
 */
export function ssimPlane(a: Float32Array, b: Float32Array, width: number, height: number): SsimPlaneResult {
  const bx = Math.max(1, Math.floor(width / BLOCK));
  const by = Math.max(1, Math.floor(height / BLOCK));
  const map = new Float32Array(bx * by);
  let total = 0;

  for (let byi = 0; byi < by; byi += 1) {
    for (let bxi = 0; bxi < bx; bxi += 1) {
      const x0 = bxi * BLOCK;
      const y0 = byi * BLOCK;
      const x1 = Math.min(width, x0 + BLOCK);
      const y1 = Math.min(height, y0 + BLOCK);
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 1) {
        const row = y * width;
        for (let x = x0; x < x1; x += 1) {
          const va = a[row + x];
          const vb = b[row + x];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
          n += 1;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const va = Math.max(0, saa / n - ma * ma);
      const vb = Math.max(0, sbb / n - mb * mb);
      const cov = sab / n - ma * mb;
      const ssim = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      const clamped = clamp(ssim, -1, 1);
      map[byi * bx + bxi] = clamped;
      total += clamped;
    }
  }

  return { mean: total / (bx * by), map, mapWidth: bx, mapHeight: by };
}

/**
 * sRGB -> linear light -> an opponent space (luma, blue-yellow, red-green).
 * Scoring in gamma-encoded sRGB overstates differences in highlights and
 * understates them in shadows, which is where JPEG hides its damage.
 */
function toOpponent(plane: PixelPlane): { y: Float32Array; cb: Float32Array; cr: Float32Array } {
  const { data, width, height } = plane;
  const n = width * height;
  const y = new Float32Array(n);
  const cb = new Float32Array(n);
  const cr = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = SRGB_TO_LINEAR[data[i * 4]];
    const g = SRGB_TO_LINEAR[data[i * 4 + 1]];
    const b = SRGB_TO_LINEAR[data[i * 4 + 2]];
    // Perceptual luma, then scaled back to 0..255 so C1/C2 keep their meaning.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    y[i] = Math.cbrt(luma) * 255;
    cb[i] = (b - luma) * 127 + 128;
    cr[i] = (r - luma) * 127 + 128;
  }
  return { y, cb, cr };
}

const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return table;
})();

/** 2x box downsample. Cheap, and unlike a naive decimate it does not alias
 *  high-frequency detail into the next scale and score it as damage. */
function halve(src: Float32Array, width: number, height: number): Float32Array {
  const w = width >> 1;
  const h = height >> 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const r0 = (y * 2) * width;
    const r1 = (y * 2 + 1) * width;
    for (let x = 0; x < w; x += 1) {
      const c0 = x * 2;
      const c1 = c0 + 1;
      out[y * w + x] = (src[r0 + c0] + src[r0 + c1] + src[r1 + c0] + src[r1 + c1]) / 4;
    }
  }
  return out;
}

/**
 * The worst 3x3 neighbourhood of blocks, expanded to a region of the source
 * image. A single worst block is usually one unlucky 8x8 patch; a
 * neighbourhood is what a person can actually be shown and judge.
 */
function worstRegion(
  map: Float32Array,
  mapWidth: number,
  mapHeight: number,
  width: number,
  height: number,
): Rect | null {
  if (map.length <= 1) return null;
  let worstValue = Infinity;
  let worstX = 0;
  let worstY = 0;
  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue;
          sum += map[ny * mapWidth + nx];
          n += 1;
        }
      }
      const avg = sum / n;
      if (avg < worstValue) {
        worstValue = avg;
        worstX = x;
        worstY = y;
      }
    }
  }
  // A region that scores essentially perfectly is not worth pointing at.
  if (worstValue > 0.999) return null;
  const scaleX = width / mapWidth;
  const scaleY = height / mapHeight;
  const w = Math.min(width, Math.round(scaleX * 3));
  const h = Math.min(height, Math.round(scaleY * 3));
  return {
    x: clamp(Math.round((worstX - 1) * scaleX), 0, Math.max(0, width - w)),
    y: clamp(Math.round((worstY - 1) * scaleY), 0, Math.max(0, height - h)),
    w,
    h,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
