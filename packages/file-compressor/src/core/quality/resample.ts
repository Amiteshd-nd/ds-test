/**
 * Pure-TS resampling. The worker could use `OffscreenCanvas.drawImage`, but the
 * scoring path needs a resampler that behaves identically in Node so the tests
 * exercise the same code the browser runs.
 */

import type { PixelPlane } from "./score";

/** Bilinear resize of an RGBA buffer. */
export function resampleRgba(src: PixelPlane, width: number, height: number): PixelPlane {
  if (src.width === width && src.height === height) return src;
  const out = new Uint8ClampedArray(width * height * 4);
  const xRatio = src.width / width;
  const yRatio = src.height / height;

  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(src.height - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = sx - x0;

      const i00 = (y0 * src.width + x0) * 4;
      const i01 = (y0 * src.width + x1) * 4;
      const i10 = (y1 * src.width + x0) * 4;
      const i11 = (y1 * src.width + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = src.data[i00 + c] * (1 - wx) + src.data[i01 + c] * wx;
        const bottom = src.data[i10 + c] * (1 - wx) + src.data[i11 + c] * wx;
        out[o + c] = top * (1 - wy) + bottom * wy;
      }
    }
  }
  return { data: out, width, height };
}

/**
 * Composite an image over white using its alpha, so an image with an SMask is
 * scored as it will be seen rather than as its base channels (FR-5.5).
 */
export function compositeOverWhite(plane: PixelPlane): PixelPlane {
  const out = new Uint8ClampedArray(plane.data.length);
  for (let i = 0; i < plane.data.length; i += 4) {
    const a = plane.data[i + 3] / 255;
    out[i] = plane.data[i] * a + 255 * (1 - a);
    out[i + 1] = plane.data[i + 1] * a + 255 * (1 - a);
    out[i + 2] = plane.data[i + 2] * a + 255 * (1 - a);
    out[i + 3] = 255;
  }
  return { data: out, width: plane.width, height: plane.height };
}
