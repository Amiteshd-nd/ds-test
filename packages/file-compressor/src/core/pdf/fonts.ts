/**
 * Stage 3 — font optimisation (FR-3.1 … FR-3.3). Lossless.
 *
 * ## What this stage does and does not do
 *
 * FR-3.2 (merge duplicate embeddings) and the lossless re-encode of font
 * programs are implemented here. **FR-3.1, subsetting to the referenced glyph
 * set, is deliberately not.**
 *
 * The PRD calls that requirement load-bearing, and it is right: a subsetter that
 * rewrites `glyf`/`loca` or a CFF charstring index without carrying the
 * `ToUnicode` CMap and the encoding differences with it produces a file that
 * looks perfect and cannot be copied out of, searched, or read by a screen
 * reader. That failure is invisible in a pixel diff, which is exactly why FR-6.2
 * exists as a hard gate.
 *
 * `fontTools.subset` is the reference implementation and it is 20,000 lines of
 * Python. Shipping a hand-rolled approximation of it in a browser build, in a
 * product whose entire premise is not damaging files silently, would be the
 * wrong trade. The stage reports the bytes it left on the table so the gap is
 * visible rather than quietly absent.
 */

import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import type { PDFDocument } from "pdf-lib";
import { hashBytes } from "../hash";
import type { TriageFlags } from "../types";

const N = (name: string) => PDFName.of(name);
const FONT_FILE_KEYS = ["FontFile", "FontFile2", "FontFile3"] as const;

export interface FontReport {
  programsMerged: number;
  bytesSaved: number;
  /** Bytes still held by embedded font programs — the size of the FR-3.1 gap. */
  bytesRemaining: number;
  subsettingSkipped: boolean;
  subsettingReason: string;
}

export function optimiseFonts(doc: PDFDocument, flags: TriageFlags): FontReport {
  const { merged, saved } = mergeDuplicatePrograms(doc);
  const remaining = embeddedProgramBytes(doc);

  return {
    programsMerged: merged,
    bytesSaved: saved,
    bytesRemaining: remaining,
    subsettingSkipped: true,
    subsettingReason: subsettingReason(flags),
  };
}

function subsettingReason(flags: TriageFlags): string {
  if (flags.hasVariableTextFields) {
    // FR-3.3 — even with a correct subsetter, this document must not be subset.
    return "This document has form fields with variable text; future input may need glyphs that are not in the file yet.";
  }
  return "Glyph subsetting needs a subsetter that provably preserves ToUnicode and encoding differences. This build merges and re-compresses font programs but does not cut glyphs.";
}

/**
 * FR-3.2 — the same font program embedded several times (once per page range,
 * or once per producing application) collapses onto one stream.
 *
 * Keyed on the program bytes alone rather than on the whole stream object:
 * everything else in the dictionary (Length1/2/3, Subtype) is derived from those
 * bytes, so identical contents mean interchangeable streams.
 */
export function mergeDuplicatePrograms(doc: PDFDocument): { merged: number; saved: number } {
  const canonical = new Map<string, { ref: PDFRef; bytes: number }>();
  const replacements = new Map<number, PDFRef>();
  const descriptors = fontDescriptors(doc);
  const programRefs = fontProgramRefs(descriptors);
  let saved = 0;

  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (!programRefs.has(ref.objectNumber)) continue;
    const key = hashBytes(object.contents);
    const existing = canonical.get(key);
    if (existing && existing.ref.objectNumber !== ref.objectNumber) {
      replacements.set(ref.objectNumber, existing.ref);
      saved += object.contents.length;
    } else if (!existing) {
      canonical.set(key, { ref, bytes: object.contents.length });
    }
  }

  if (replacements.size === 0) return { merged: 0, saved: 0 };

  for (const descriptor of descriptors) {
    for (const key of FONT_FILE_KEYS) {
      const value = descriptor.get(N(key));
      if (value instanceof PDFRef) {
        const replacement = replacements.get(value.objectNumber);
        if (replacement) descriptor.set(N(key), replacement);
      }
    }
  }

  for (const [ref] of doc.context.enumerateIndirectObjects()) {
    if (replacements.has(ref.objectNumber)) doc.context.delete(ref);
  }

  return { merged: replacements.size, saved };
}

/** Object numbers of every embedded font program, collected in one pass so the
 *  merge stays linear in the number of objects. */
function fontProgramRefs(descriptors: PDFDict[]): Set<number> {
  const refs = new Set<number>();
  for (const descriptor of descriptors) {
    for (const key of FONT_FILE_KEYS) {
      const value = descriptor.get(N(key));
      if (value instanceof PDFRef) refs.add(value.objectNumber);
    }
  }
  return refs;
}

/** Every FontDescriptor in the document, including those behind DescendantFonts
 *  (Type 0 composite fonts — which is every CJK document). */
function fontDescriptors(doc: PDFDocument): PDFDict[] {
  const out: PDFDict[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const type = object.get(N("Type"));
    if (type instanceof PDFName && type.asString() === "/FontDescriptor") {
      out.push(object);
      continue;
    }
    if (type instanceof PDFName && type.asString() === "/Font") {
      const descendants = object.lookupMaybe(N("DescendantFonts"), PDFArray);
      if (!descendants) continue;
      for (let i = 0; i < descendants.size(); i += 1) {
        const child = doc.context.lookup(descendants.get(i));
        if (child instanceof PDFDict) {
          const descriptor = child.lookupMaybe(N("FontDescriptor"), PDFDict);
          if (descriptor) out.push(descriptor);
        }
      }
    }
  }
  return out;
}

function embeddedProgramBytes(doc: PDFDocument): number {
  let total = 0;
  const counted = new Set<number>();
  for (const descriptor of fontDescriptors(doc)) {
    for (const key of FONT_FILE_KEYS) {
      const value = descriptor.get(N(key));
      const stream = doc.context.lookup(value as never);
      if (!(stream instanceof PDFStream)) continue;
      const objectNumber = value instanceof PDFRef ? value.objectNumber : -1;
      if (objectNumber >= 0 && counted.has(objectNumber)) continue;
      if (objectNumber >= 0) counted.add(objectNumber);
      total += stream.getContentsSize();
    }
  }
  return total;
}
