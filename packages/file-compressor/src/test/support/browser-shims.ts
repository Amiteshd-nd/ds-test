/**
 * The three browser APIs the pipeline actually needs, backed by the same Skia
 * canvas pdf.js itself uses in Node.
 *
 * This is what lets the end-to-end test drive the *production* modules rather
 * than a Node-flavoured copy of them. The encoders differ — Skia's JPEG is not
 * Chrome's — so the test asserts on invariants (smaller, above the floor, text
 * intact) and never on exact bytes.
 */

import path from "node:path";
import { createRequire } from "node:module";
import { Canvas, createCanvas, DOMMatrix, ImageData as NapiImageData, loadImage, Path2D } from "@napi-rs/canvas";
import { setAssetBase } from "@/core/pdf/render";

export function installBrowserShims(): void {
  const global = globalThis as Record<string, unknown>;

  // The app serves pdf.js's fonts and CMaps from /public; under Node, pdf.js
  // reads them off the filesystem and treats this base as a path rather than a
  // URL. Getting it wrong is not loud — the fonts simply fail and every page of
  // text renders blank, which the quality gate would read as catastrophic
  // damage — so it is worth being exact about.
  const require = createRequire(import.meta.url);
  setAssetBase(path.dirname(require.resolve("pdfjs-dist/package.json")) + path.sep);

  if (!global.ImageData) global.ImageData = NapiImageData;
  if (!global.DOMMatrix) global.DOMMatrix = DOMMatrix;
  if (!global.Path2D) global.Path2D = Path2D;

  if (!global.OffscreenCanvas) {
    global.OffscreenCanvas = class {
      readonly canvas: Canvas;
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.canvas = createCanvas(width, height) as Canvas;
        this.width = width;
        this.height = height;
      }

      getContext(type: string): unknown {
        return this.canvas.getContext(type as "2d");
      }

      async convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
        const type = options?.type ?? "image/png";
        const buffer =
          type === "image/jpeg"
            ? await this.canvas.encode("jpeg", Math.round((options?.quality ?? 0.92) * 100))
            : await this.canvas.encode("png");
        return new Blob([buffer as unknown as ArrayBuffer], { type });
      }
    };
  }

  if (!global.createImageBitmap) {
    global.createImageBitmap = async (blob: Blob) => {
      const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
      (image as unknown as { close: () => void }).close = () => {};
      return image;
    };
  }
}
