/**
 * Rasterisation and text extraction, both via pdf.js.
 *
 * Note which library this is: PRD §9 specifies PyMuPDF for rendering and flags
 * its AGPL licence as a week-one decision. pdf.js is Apache 2.0, renders in the
 * browser, and is already the choice for the comparison viewer — using it for
 * scoring too means the licence question never arises for this build, and the
 * pixels the gate judges are the same pixels the user is shown.
 *
 * Rendering is used for scoring and previews only. It never produces output.
 */

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PixelPlane } from "../quality/score";

/** The DPI pages are scored at. High enough to see JPEG blocking, low enough
 *  that a 200-page scan does not take a minute to judge. */
export const SCORING_DPI = 96;

let configured = false;
let assetBase = "/";

/**
 * Where pdf.js should fetch its standard fonts and CMaps from. Defaults to the
 * copies this package serves out of /public; the Node harness points it at the
 * installed package instead.
 */
export function setAssetBase(base: string): void {
  assetBase = base.endsWith("/") ? base : `${base}/`;
}

function configure(): void {
  if (configured) return;
  // Served from /public by scripts/copy-pdfjs-worker.mjs. A string URL rather
  // than a bundler `new URL(...)` because this module is itself loaded inside a
  // worker, and the two bundlers disagree about nested worker resolution.
  //
  // Guarded on `Worker` existing at all: under Node — where the end-to-end test
  // drives this same code — pdf.js runs its own in-process fallback, and
  // pointing it at a URL it cannot fetch would break that.
  if (typeof Worker !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  configured = true;
}

export async function openDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  configure();
  // pdf.js takes ownership of the buffer it is handed, so it always gets a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // A page that uses Helvetica without embedding it renders blank without
    // these, which the quality gate would read as catastrophic damage.
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    // FR-12.8 — never resolve external references while processing. pdf.js
    // does not execute document JavaScript during rendering at all, and it
    // fetches nothing beyond the buffer we hand it.
    disableAutoFetch: true,
    stopAtErrors: false,
  });
  return task.promise;
}

export async function renderPage(doc: PDFDocumentProxy, pageNumber: number, dpi = SCORING_DPI): Promise<PixelPlane> {
  const page = await doc.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: dpi / 72 });
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("2d context unavailable");
    // White ground: a transparent page composited differently on each side
    // would score as damage that nobody can see.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const data = ctx.getImageData(0, 0, width, height);
    return { data: data.data, width: data.width, height: data.height };
  } finally {
    page.cleanup();
  }
}

/**
 * FR-6.2's input. Per page rather than whole-document, so a mismatch names the
 * page it happened on instead of just saying the file changed.
 */
export async function extractText(doc: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    try {
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      out.push(text);
    } catch {
      out.push("");
    } finally {
      page.cleanup();
    }
  }
  return out;
}

export async function renderToDataUrl(
  doc: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
): Promise<{ url: string; width: number; height: number }> {
  const plane = await renderPage(doc, pageNumber, dpi);
  const canvas = new OffscreenCanvas(plane.width, plane.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(plane.data), plane.width, plane.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buffer = await blob.arrayBuffer();
  return { url: toDataUrl(new Uint8Array(buffer), "image/png"), width: plane.width, height: plane.height };
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
