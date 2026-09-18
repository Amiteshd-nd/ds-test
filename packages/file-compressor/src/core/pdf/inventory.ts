/**
 * Stage 1 — ingest and triage (FR-1.1 … FR-1.4).
 *
 * Produces the byte budget that drives both the pipeline's routing and the
 * analysis screen. "What is making this file big" is a question no mainstream
 * compressor answers, and answering it first is what makes the recommendation
 * that follows legible rather than arbitrary.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from "pdf-lib";
import type {
  ByteBudget,
  FontInfo,
  ImageInfo,
  Inventory,
  ModeId,
  Refusal,
  TriageFlags,
} from "../types";
import { MODES, TINY_IMAGE_BYTES } from "../modes";
import { collectPlacements, effectiveDpi, streamBytes } from "./ctm";

const N = (name: string) => PDFName.of(name);

export async function loadDocument(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, {
    // We must be able to *inspect* an encrypted file in order to tell the user
    // we refuse to modify it. Triage decides what happens next.
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
}

export async function analyse(bytes: Uint8Array): Promise<{ doc: PDFDocument; inventory: Inventory }> {
  const doc = await loadDocument(bytes);
  const inventory = await buildInventory(doc, bytes);
  return { doc, inventory };
}

export async function buildInventory(doc: PDFDocument, bytes: Uint8Array): Promise<Inventory> {
  const images = collectImages(doc);
  const fonts = collectFonts(doc);
  const budget = computeBudget(doc, bytes, images, fonts);
  const flags = triage(doc, bytes);
  const refusals = refusalsFor(flags);
  const estimates = estimate(budget, images, flags);
  const { mode, rationale } = recommend(budget, images, flags);

  return {
    pageCount: doc.getPageCount(),
    bytes: bytes.length,
    pdfVersion: readVersion(bytes),
    budget,
    images,
    fonts,
    flags,
    refusals,
    estimates,
    recommended: mode,
    rationale,
  };
}

/* ------------------------------------------------------------------ images */

export interface RawImage {
  ref: PDFRef;
  stream: PDFRawStream;
}

/** Every image XObject in the document, whether or not it is drawn. */
export function collectImageStreams(doc: PDFDocument): RawImage[] {
  const out: RawImage[] = [];
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const subtype = object.dict.get(N("Subtype"));
    if (subtype instanceof PDFName && subtype.asString() === "/Image") {
      out.push({ ref, stream: object });
    }
  }
  return out;
}

function collectImages(doc: PDFDocument): ImageInfo[] {
  const placements = collectPlacements(doc);
  const byObject = new Map<number, { maxDpiW: number; pages: Set<number> }>();

  const streams = collectImageStreams(doc);
  const dimsByObject = new Map<number, { w: number; h: number }>();
  for (const { ref, stream } of streams) {
    dimsByObject.set(ref.objectNumber, {
      w: num(stream.dict.get(N("Width"))) ?? 0,
      h: num(stream.dict.get(N("Height"))) ?? 0,
    });
  }

  for (const placement of placements) {
    const dims = dimsByObject.get(placement.objectNumber);
    if (!dims) continue;
    const dpiW = effectiveDpi(dims.w, placement.widthPt) ?? 0;
    const dpiH = effectiveDpi(dims.h, placement.heightPt) ?? 0;
    const dpi = Math.max(dpiW, dpiH);
    const entry = byObject.get(placement.objectNumber) ?? { maxDpiW: 0, pages: new Set<number>() };
    entry.maxDpiW = Math.max(entry.maxDpiW, dpi);
    entry.pages.add(placement.page);
    byObject.set(placement.objectNumber, entry);
  }

  return streams.map(({ ref, stream }) => {
    const dict = stream.dict;
    const placement = byObject.get(ref.objectNumber);
    const width = num(dict.get(N("Width"))) ?? 0;
    const height = num(dict.get(N("Height"))) ?? 0;
    const bytes = stream.getContentsSize();
    return {
      id: ref.objectNumber,
      width,
      height,
      effectiveDpi: placement && placement.maxDpiW > 0 ? Math.round(placement.maxDpiW) : null,
      bitsPerComponent: num(dict.get(N("BitsPerComponent"))) ?? 8,
      colorSpace: describeColorSpace(dict),
      filter: describeFilter(dict),
      bytes,
      // Provisional: the real classification (FR-5.1) needs decoded pixels and
      // happens in stage 5. This is the cheap version for the analysis screen.
      klass:
        bytes < TINY_IMAGE_BYTES
          ? "tiny"
          : (num(dict.get(N("BitsPerComponent"))) ?? 8) === 1
            ? "bilevel"
            : describeColorSpace(dict).includes("Gray")
              ? "greyscale"
              : describeFilter(dict).includes("DCT")
                ? "photographic"
                : "indexed",
      hasAlpha: dict.has(N("SMask")) || dict.has(N("Mask")),
      pages: placement ? [...placement.pages].sort((a, b) => a - b) : [],
    } satisfies ImageInfo;
  });
}

function describeColorSpace(dict: PDFDict): string {
  const cs = dict.get(N("ColorSpace"));
  if (cs instanceof PDFName) return cs.asString().replace(/^\//, "");
  if (cs instanceof PDFArray && cs.size() > 0) {
    const family = cs.get(0);
    return family instanceof PDFName ? family.asString().replace(/^\//, "") : "Array";
  }
  if (cs instanceof PDFRef) return "Indexed";
  return "Unknown";
}

function describeFilter(dict: PDFDict): string {
  const filter = dict.get(N("Filter"));
  if (filter instanceof PDFName) return filter.asString().replace(/^\//, "");
  if (filter instanceof PDFArray) {
    const parts: string[] = [];
    for (let i = 0; i < filter.size(); i += 1) {
      const f = filter.get(i);
      if (f instanceof PDFName) parts.push(f.asString().replace(/^\//, ""));
    }
    return parts.join("+") || "None";
  }
  return "None";
}

/* ------------------------------------------------------------------- fonts */

function collectFonts(doc: PDFDocument): FontInfo[] {
  const out: FontInfo[] = [];
  const seen = new Set<number>();

  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const type = object.get(N("Type"));
    if (!(type instanceof PDFName) || type.asString() !== "/Font") continue;
    if (seen.has(ref.objectNumber)) continue;
    seen.add(ref.objectNumber);

    const baseFont = object.get(N("BaseFont"));
    const name = baseFont instanceof PDFName ? baseFont.asString().replace(/^\//, "") : "(unnamed)";
    const programBytes = fontProgramBytes(doc, object);
    out.push({
      id: ref.objectNumber,
      name,
      bytes: programBytes,
      // The six-uppercase-letters-plus-plus convention for an existing subset.
      subsetAlready: /^[A-Z]{6}\+/.test(name),
      embedded: programBytes > 0,
    });
  }
  return out;
}

function fontProgramBytes(doc: PDFDocument, font: PDFDict): number {
  let total = 0;
  const descriptors: PDFDict[] = [];

  const direct = font.lookupMaybe(N("FontDescriptor"), PDFDict);
  if (direct) descriptors.push(direct);

  const descendants = font.lookupMaybe(N("DescendantFonts"), PDFArray);
  if (descendants) {
    for (let i = 0; i < descendants.size(); i += 1) {
      const child = doc.context.lookup(descendants.get(i));
      if (child instanceof PDFDict) {
        const descriptor = child.lookupMaybe(N("FontDescriptor"), PDFDict);
        if (descriptor) descriptors.push(descriptor);
      }
    }
  }

  for (const descriptor of descriptors) {
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const file = descriptor.lookupMaybe(N(key), PDFStream);
      if (file) total += file.getContentsSize();
    }
  }
  return total;
}

/* ------------------------------------------------------------------ budget */

function computeBudget(
  doc: PDFDocument,
  bytes: Uint8Array,
  images: ImageInfo[],
  fonts: FontInfo[],
): ByteBudget {
  const contentRefs = contentStreamRefs(doc);
  const imageBytes = images.reduce((sum, image) => sum + image.bytes, 0);
  const fontBytes = fonts.reduce((sum, font) => sum + font.bytes, 0);

  let contentBytes = 0;
  let metadataBytes = 0;
  let accounted = imageBytes + fontBytes;

  const imageIds = new Set(images.map((i) => i.id));

  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue;
    if (imageIds.has(ref.objectNumber)) continue;
    const subtype = object.dict.get(N("Subtype"));
    const subtypeName = subtype instanceof PDFName ? subtype.asString() : "";
    const type = object.dict.get(N("Type"));
    const typeName = type instanceof PDFName ? type.asString() : "";
    const size = object.getContentsSize();

    if (typeName === "/Metadata" || subtypeName === "/XML") {
      metadataBytes += size;
      accounted += size;
      continue;
    }
    if (subtypeName === "/Form" || contentRefs.has(ref.objectNumber)) {
      contentBytes += size;
      accounted += size;
      continue;
    }
    if (["/FontFile", "/FontFile2", "/FontFile3"].includes(subtypeName)) continue; // counted above
  }

  const info = doc.context.trailerInfo.Info;
  if (info) {
    const dict = doc.context.lookup(info);
    if (dict instanceof PDFDict) {
      metadataBytes += dict.sizeInBytes();
      accounted += dict.sizeInBytes();
    }
  }

  // Whatever the file weighs beyond the streams we can name is structure:
  // the xref, the object headers, the page tree, annotations, and dead weight.
  const overhead = Math.max(0, bytes.length - accounted);

  return {
    images: imageBytes,
    fonts: fontBytes,
    content: contentBytes,
    metadata: metadataBytes,
    overhead,
    total: bytes.length,
  };
}

/** Object numbers reachable as a page's /Contents. Collected once — the
 *  budget walk is over every object, and re-scanning the page tree inside it
 *  turns a linear pass into a quadratic one on large documents. */
function contentStreamRefs(doc: PDFDocument): Set<number> {
  const refs = new Set<number>();
  for (const page of doc.getPages()) {
    const contents = page.node.get(N("Contents"));
    if (contents instanceof PDFRef) refs.add(contents.objectNumber);
    const array = doc.context.lookup(contents);
    if (array instanceof PDFArray) {
      for (let i = 0; i < array.size(); i += 1) {
        const item = array.get(i);
        if (item instanceof PDFRef) refs.add(item.objectNumber);
      }
    }
  }
  return refs;
}

/* ------------------------------------------------------------------ triage */

export function triage(doc: PDFDocument, bytes: Uint8Array): TriageFlags {
  const catalog = doc.catalog;
  const acroForm = catalog.lookupMaybe(N("AcroForm"), PDFDict);
  const names = catalog.lookupMaybe(N("Names"), PDFDict);

  let signed = false;
  let hasVariableTextFields = false;
  if (acroForm) {
    const fields = acroForm.lookupMaybe(N("Fields"), PDFArray);
    if (fields) {
      for (let i = 0; i < fields.size(); i += 1) {
        const field = doc.context.lookup(fields.get(i));
        if (!(field instanceof PDFDict)) continue;
        const ft = field.get(N("FT"));
        const kind = ft instanceof PDFName ? ft.asString() : "";
        if (kind === "/Sig") signed = true;
        if (kind === "/Tx") hasVariableTextFields = true;
      }
    }
  }
  if (!signed) {
    // A signature can also sit in a widget annotation with a /ByteRange.
    for (const [, object] of doc.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && object.has(N("ByteRange")) && object.has(N("Contents"))) {
        signed = true;
        break;
      }
    }
  }

  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const metadataText = readMetadataText(doc);

  return {
    encrypted: doc.isEncrypted,
    signed,
    linearized: head.includes("/Linearized"),
    conformance: readConformance(metadataText),
    hasAcroForm: Boolean(acroForm),
    hasVariableTextFields,
    hasJavaScript: Boolean(names?.has(N("JavaScript"))) || hasOpenActionJs(doc),
    hasEmbeddedFiles: Boolean(names?.has(N("EmbeddedFiles"))),
    hasTaggedStructure: catalog.has(N("StructTreeRoot")) || catalog.has(N("MarkInfo")),
  };
}

function hasOpenActionJs(doc: PDFDocument): boolean {
  const action = doc.catalog.lookupMaybe(N("OpenAction"), PDFDict);
  if (!action) return false;
  const s = action.get(N("S"));
  return s instanceof PDFName && s.asString() === "/JavaScript";
}

export function readMetadataText(doc: PDFDocument): string {
  const metadata = doc.catalog.lookupMaybe(N("Metadata"), PDFStream);
  if (!metadata) return "";
  const bytes = streamBytes(metadata);
  return bytes ? latin1(bytes) : "";
}

function readConformance(xmp: string): string | null {
  const pdfa = xmp.match(/pdfaid:part>?="?(\d)/);
  const pdfaConformance = xmp.match(/pdfaid:conformance>?="?([A-Za-z])/);
  if (pdfa) return `PDF/A-${pdfa[1]}${(pdfaConformance?.[1] ?? "").toLowerCase()}`;
  const pdfx = xmp.match(/pdfxid:GTS_PDFXVersion>?="?(PDF\/X-[^"<\s]+)/);
  if (pdfx) return pdfx[1];
  return null;
}

function refusalsFor(flags: TriageFlags): Refusal[] {
  const out: Refusal[] = [];
  if (flags.encrypted) {
    out.push({
      code: "encrypted",
      message: "This PDF is encrypted. Supply the password to compress it — we will not modify a file we cannot fully read.",
      overridable: false,
    });
  }
  if (flags.signed) {
    out.push({
      code: "signed",
      message: "This PDF carries a digital signature. Any compression invalidates it, so we leave the file alone.",
      overridable: false,
    });
  }
  if (flags.conformance) {
    out.push({
      code: "conformance",
      message: `This file declares ${flags.conformance} conformance. Compressing it drops that claim.`,
      overridable: true,
    });
  }
  return out;
}

/* --------------------------------------------------------------- estimates */

/**
 * A range per mode, derived from this document's own budget. The analysis
 * screen shows it before compression starts (FR-7.2), so it has to be cheap and
 * honest — a range wide enough to contain the truth rather than a single number
 * that will be wrong.
 */
function estimate(
  budget: ByteBudget,
  images: ImageInfo[],
  flags: TriageFlags,
): Record<ModeId, { low: number; high: number }> {
  const losslessLow = (budget.overhead * 0.12 + budget.content * 0.05 + budget.metadata * 0.4) / budget.total;
  const losslessHigh = (budget.overhead * 0.4 + budget.content * 0.25 + budget.metadata * 0.9) / budget.total;

  const out = {} as Record<ModeId, { low: number; high: number }>;
  out.lossless = { low: clamp01(losslessLow), high: clamp01(losslessHigh) };

  for (const mode of ["visually-lossless", "balanced", "aggressive"] as const) {
    const { dpiCeiling, imageFloor } = MODES[mode];
    let saved = 0;
    for (const image of images) {
      if (image.klass === "tiny") continue;
      // Resolution above what the medium can show is a free win; quality below
      // that is where the search actually has to work.
      const dpiFactor =
        image.effectiveDpi && image.effectiveDpi > dpiCeiling
          ? Math.min(1, (dpiCeiling / image.effectiveDpi) ** 2)
          : 1;
      const qualityFactor = image.klass === "bilevel" ? 0.45 : 0.3 + (imageFloor - 60) * 0.012;
      saved += image.bytes * (1 - dpiFactor * Math.min(1, qualityFactor + 0.25));
    }
    const imageShare = saved / budget.total;
    out[mode] = {
      low: clamp01(losslessLow + imageShare * 0.6),
      high: clamp01(losslessHigh + imageShare * 1.1),
    };
  }

  if (flags.encrypted || flags.signed) {
    for (const key of Object.keys(out) as ModeId[]) out[key] = { low: 0, high: 0 };
  }
  return out;
}

function recommend(
  budget: ByteBudget,
  images: ImageInfo[],
  flags: TriageFlags,
): { mode: ModeId; rationale: string } {
  if (flags.signed || flags.encrypted) {
    return { mode: "lossless", rationale: "This file is signed or encrypted — we will not re-encode anything in it." };
  }
  if (flags.conformance) {
    return {
      mode: "lossless",
      rationale: `This file declares ${flags.conformance}. Lossless keeps the conformance claim intact.`,
    };
  }

  const imageShare = budget.total > 0 ? budget.images / budget.total : 0;
  if (imageShare < 0.15) {
    return {
      mode: "lossless",
      rationale: "Almost all of this file is text and vector content — there is nothing here that a lossy pass could safely take.",
    };
  }

  const bilevel = images.filter((i) => i.klass === "bilevel");
  const bilevelShare = bilevel.reduce((sum, i) => sum + i.bytes, 0) / Math.max(1, budget.images);
  if (bilevelShare > 0.6) {
    return {
      mode: "aggressive",
      rationale: "This looks like a scanned document — the bilevel path does well here and text stays legible.",
    };
  }

  // By bytes, not by count: one 40 MB photo at 600 DPI is the whole story of a
  // file that also contains thirty small icons, and counting images would let
  // the icons outvote it.
  const highDpi = images.filter((i) => (i.effectiveDpi ?? 0) > 300);
  const highDpiShare = highDpi.reduce((sum, i) => sum + i.bytes, 0) / Math.max(1, budget.images);
  if (highDpiShare > 0.5) {
    const noun = highDpi.length === 1 ? "image is" : `${highDpi.length} images are`;
    return {
      mode: "visually-lossless",
      rationale: `${highDpi.length === 1 ? "The main " : ""}${noun} stored at far more resolution than the page uses — most of the saving here is free.`,
    };
  }

  return {
    mode: "balanced",
    rationale: "A mixed document. Balanced is the usual answer when the file is destined for email rather than print.",
  };
}

/* ----------------------------------------------------------------- helpers */

function num(object: unknown): number | null {
  if (object instanceof PDFNumber) return object.asNumber();
  return null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(0.98, value));
}

function readVersion(bytes: Uint8Array): string {
  const head = latin1(bytes.subarray(0, 32));
  return head.match(/%PDF-(\d\.\d)/)?.[1] ?? "1.7";
}

export function latin1(bytes: Uint8Array): string {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return out;
}

