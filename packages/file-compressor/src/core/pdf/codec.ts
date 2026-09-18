/**
 * The only module that touches an actual encoder.
 *
 * PRD §9's rule is that every byte-level operation runs in mature C/C++ that
 * already exists and we write orchestration only. In a browser build that code
 * is the platform's own: the JPEG encoder behind `OffscreenCanvas.convertToBlob`
 * and the DEFLATE in fflate. It is not MozJPEG — no trellis quantisation, no
 * progressive scans, so we give up the 5–15% MozJPEG would have won at equal
 * quality. Everything above this file is unchanged if that encoder is swapped in
 * as Wasm later; the interface is deliberately narrow for that reason.
 */

// zlib, not raw deflate — see the note in structural.ts.
import { zlibSync } from "fflate";
import type { PixelPlane } from "../quality/score";

export type SampleLayout = "rgb" | "gray" | "bilevel";

export interface RawEncodeResult {
  bytes: Uint8Array;
  colorSpace: "DeviceRGB" | "DeviceGray";
  bitsPerComponent: number;
}

function canvasFor(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("OffscreenCanvas is unavailable — image work must run in a worker or a modern browser.");
  }
  return new OffscreenCanvas(width, height);
}

/** Decode any format the platform understands (JPEG here) into RGBA. */
export async function decodeWithPlatform(bytes: Uint8Array, mime: string): Promise<PixelPlane> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = canvasFor(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: data.data, width: data.width, height: data.height };
  } finally {
    bitmap.close();
  }
}

/** Encode RGBA as baseline JPEG at the given quality (0..1 internally). */
export async function encodeJpeg(plane: PixelPlane, quality: number): Promise<Uint8Array> {
  const canvas = canvasFor(plane.width, plane.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const image = new ImageData(new Uint8ClampedArray(plane.data), plane.width, plane.height);
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Encode raw samples + Flate. This is the path for screenshots, charts and line
 * art, which ring badly under JPEG (FR-5.3), and for bilevel scans, where one
 * bit per pixel beats anything a photo codec can do.
 */
export function encodeFlateSamples(plane: PixelPlane, layout: SampleLayout): RawEncodeResult {
  const { data, width, height } = plane;

  if (layout === "bilevel") {
    const rowBytes = (width + 7) >> 3;
    const out = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const luma = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8;
        if (luma >= 128) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { bytes: zlibSync(out, { level: 9, mem: 12 }), colorSpace: "DeviceGray", bitsPerComponent: 1 };
  }

  if (layout === "gray") {
    const out = new Uint8Array(width * height);
    for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
      out[p] = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8;
    }
    return { bytes: zlibSync(out, { level: 9, mem: 12 }), colorSpace: "DeviceGray", bitsPerComponent: 8 };
  }

  const out = new Uint8Array(width * height * 3);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 3) {
    out[p] = data[i];
    out[p + 1] = data[i + 1];
    out[p + 2] = data[i + 2];
  }
  return { bytes: zlibSync(out, { level: 9, mem: 12 }), colorSpace: "DeviceRGB", bitsPerComponent: 8 };
}

/** The alpha channel of an RGBA plane as an 8-bit grey Flate stream, for /SMask. */
export function encodeAlphaMask(plane: PixelPlane): Uint8Array {
  const out = new Uint8Array(plane.width * plane.height);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) out[p] = plane.data[i + 3];
  return zlibSync(out, { level: 9, mem: 12 });
}

export function hasMeaningfulAlpha(plane: PixelPlane): boolean {
  for (let i = 3; i < plane.data.length; i += 4) {
    if (plane.data[i] < 250) return true;
  }
  return false;
}
