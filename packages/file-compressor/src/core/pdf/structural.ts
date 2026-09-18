/**
 * Stage 2 — structural optimisation (FR-2.1 … FR-2.5). Entirely lossless, so it
 * runs in every mode including Lossless.
 *
 * This is where the unglamorous savings live: dead objects from incremental
 * saves, the same logo embedded forty times, streams written at compression
 * level 1 by whatever produced the file. On business documents it routinely
 * takes 10–20% before a single pixel is touched.
 */

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import type { PDFDocument } from "pdf-lib";
// zlib, not raw deflate: PDF's FlateDecode filter is zlib-wrapped, and
// fflate's `deflateSync` emits a bare deflate stream that many readers reject.
import { zlibSync } from "fflate";
import { hashBytes } from "../hash";

const N = (name: string) => PDFName.of(name);

/** Filters whose payload is already compressed — re-deflating them wastes time
 *  and, for the image codecs, would corrupt the stream. */
const OPAQUE_FILTERS = new Set(["/DCTDecode", "/JPXDecode", "/JBIG2Decode", "/CCITTFaxDecode", "/RunLengthDecode"]);

export interface StructuralReport {
  objectsCollected: number;
  objectsDeduplicated: number;
  streamsRecompressed: number;
  bytesSavedOnStreams: number;
}

export function optimiseStructure(doc: PDFDocument): StructuralReport {
  const objectsCollected = garbageCollect(doc);
  const objectsDeduplicated = deduplicate(doc);
  const { streams, bytes } = recompressStreams(doc);
  return {
    objectsCollected,
    objectsDeduplicated,
    streamsRecompressed: streams,
    bytesSavedOnStreams: bytes,
  };
}

/**
 * FR-2.1 — delete everything unreachable from the document catalog.
 *
 * Incremental saves never remove anything: a form filled in and re-saved ten
 * times carries ten generations of every touched object. The walk starts from
 * the trailer rather than from the catalog alone so that Info and Encrypt
 * survive, and it is intentionally conservative — an object reachable by any
 * path is kept.
 */
export function garbageCollect(doc: PDFDocument): number {
  const reachable = new Set<number>();
  const queue: PDFObject[] = [];

  const roots = [doc.context.trailerInfo.Root, doc.context.trailerInfo.Info, doc.context.trailerInfo.Encrypt];
  for (const root of roots) {
    if (root) queue.push(root);
  }

  while (queue.length > 0) {
    const object = queue.pop()!;
    if (object instanceof PDFRef) {
      if (reachable.has(object.objectNumber)) continue;
      reachable.add(object.objectNumber);
      const target = doc.context.lookup(object);
      if (target) queue.push(target);
      continue;
    }
    if (object instanceof PDFStream) {
      queue.push(object.dict);
      continue;
    }
    if (object instanceof PDFDict) {
      for (const value of object.values()) queue.push(value);
      continue;
    }
    if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i += 1) queue.push(object.get(i));
    }
  }

  let deleted = 0;
  for (const [ref] of doc.context.enumerateIndirectObjects()) {
    if (!reachable.has(ref.objectNumber)) {
      doc.context.delete(ref);
      deleted += 1;
    }
  }
  return deleted;
}

/**
 * FR-2.2 — collapse byte-identical objects onto one reference.
 *
 * Two passes, because identity is only visible once children have been merged:
 * two page dictionaries that differ solely in which copy of the same image they
 * point at become identical after the first pass folds the images together.
 */
export function deduplicate(doc: PDFDocument, passes = 2): number {
  let total = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    const canonical = new Map<string, PDFRef>();
    const replacements = new Map<number, PDFRef>();
    const victims: PDFRef[] = [];

    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      const key = identityKey(object);
      if (!key) continue;
      const existing = canonical.get(key);
      if (existing) {
        replacements.set(ref.objectNumber, existing);
        victims.push(ref);
      } else {
        canonical.set(key, ref);
      }
    }
    if (replacements.size === 0) break;

    rewriteRefs(doc, replacements);
    for (const ref of victims) doc.context.delete(ref);
    total += victims.length;
  }
  return total;
}

function identityKey(object: PDFObject): string | null {
  try {
    if (object instanceof PDFRawStream) {
      return `S${object.dict.toString()}#${hashBytes(object.contents)}`;
    }
    if (object instanceof PDFStream) return null; // synthesised streams: leave alone
    if (object instanceof PDFDict) {
      // Page nodes carry /Parent, so two identical-looking pages in different
      // trees are genuinely different objects. Merging them reparents one.
      const type = object.get(N("Type"));
      if (type instanceof PDFName && (type.asString() === "/Page" || type.asString() === "/Pages")) return null;
      return `D${object.toString()}`;
    }
    if (object instanceof PDFArray) return `A${object.toString()}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Point every reference to a merged object at the survivor.
 *
 * The walk has to recurse into *direct* dictionaries and arrays, not just the
 * top level of each indirect object. A page's `/Contents` is very often a
 * direct array of stream references sitting inside the page dictionary; a
 * rewrite that only looked one level deep would leave those pointing at objects
 * it had just deleted, and the page would render blank — with every other check
 * still passing, because the file is structurally valid and its text still
 * extracts. That failure is exactly what FR-6.1's render check exists to catch,
 * and it caught this one.
 */
function rewriteRefs(doc: PDFDocument, replacements: Map<number, PDFRef>): void {
  const resolve = (value: PDFObject): PDFObject => {
    if (value instanceof PDFRef) return replacements.get(value.objectNumber) ?? value;
    return value;
  };

  const rewrite = (object: PDFObject, depth: number): void => {
    if (depth > 32) return;
    if (object instanceof PDFStream) {
      rewrite(object.dict, depth + 1);
      return;
    }
    if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        const next = resolve(value);
        if (next !== value) object.set(key, next);
        else rewrite(value, depth + 1);
      }
      return;
    }
    if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i += 1) {
        const value = object.get(i);
        const next = resolve(value);
        if (next !== value) object.set(i, next);
        else rewrite(value, depth + 1);
      }
    }
  };

  for (const [, object] of doc.context.enumerateIndirectObjects()) rewrite(object, 0);

  for (const key of ["Root", "Info", "Encrypt"] as const) {
    const current = doc.context.trailerInfo[key];
    if (current) doc.context.trailerInfo[key] = resolve(current);
  }
}

/**
 * FR-2.4 / FR-2.5 — re-deflate at maximum effort, and convert uncompressed or
 * legacy-filtered streams to Flate.
 *
 * We only rewrite a stream when we could decode it *and* the result is actually
 * smaller. A stream we cannot decode is left exactly as it was: a compressor
 * that mangles a stream it did not understand is worse than one that leaves
 * bytes on the table.
 */
export function recompressStreams(doc: PDFDocument): { streams: number; bytes: number } {
  let streams = 0;
  let bytes = 0;

  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    const subtype = dict.get(N("Subtype"));
    if (subtype instanceof PDFName && subtype.asString() === "/Image") continue; // stage 5 owns images
    if (hasOpaqueFilter(dict)) continue;

    const before = object.contents.length;
    const decoded = decodeSafely(object);
    if (!decoded) continue;

    let compressed: Uint8Array;
    try {
      compressed = zlibSync(decoded, { level: 9, mem: 12 });
    } catch {
      continue;
    }
    if (compressed.length >= before) continue;

    const next = PDFRawStream.of(dict, compressed);
    dict.set(N("Filter"), N("FlateDecode"));
    // The decoded bytes are post-predictor, so the predictor description must
    // go with the old encoding or the file will not open.
    dict.delete(N("DecodeParms"));
    dict.delete(N("DL"));
    dict.set(N("Length"), doc.context.obj(compressed.length));
    doc.context.assign(ref, next);

    streams += 1;
    bytes += before - compressed.length;
  }

  return { streams, bytes };
}

function hasOpaqueFilter(dict: PDFDict): boolean {
  const filter = dict.get(N("Filter"));
  if (filter instanceof PDFName) return OPAQUE_FILTERS.has(filter.asString());
  if (filter instanceof PDFArray) {
    for (let i = 0; i < filter.size(); i += 1) {
      const f = filter.get(i);
      if (f instanceof PDFName && OPAQUE_FILTERS.has(f.asString())) return true;
    }
  }
  return false;
}

function decodeSafely(stream: PDFRawStream): Uint8Array | null {
  try {
    const filter = stream.dict.get(N("Filter"));
    if (!filter) return stream.contents; // uncompressed — FR-2.5
    // pdf-lib decodes Flate and LZW, including predictors.
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}
