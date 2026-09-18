/**
 * FR-5.2 — effective DPI from the transformation matrix.
 *
 * An image XObject's pixel dimensions say nothing about how big it is on the
 * page. A 4000x3000 photo placed in a 2-inch box is 2000 DPI and can lose most
 * of its pixels for free; the same photo placed full-bleed on A3 cannot. The
 * only way to know is to walk the content stream and resolve the CTM at each
 * draw site, which is what this does.
 *
 * An XObject drawn at several scales takes the maximum, because the output has
 * to satisfy the largest placement.
 */

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";
import type { PDFDocument } from "pdf-lib";

/** [a, b, c, d, e, f] — the PDF matrix, row-major as in the spec. */
export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const MAX_FORM_DEPTH = 8;

export interface Placement {
  /** Object number of the image XObject. */
  objectNumber: number;
  /** Page index (0-based) it was drawn on. */
  page: number;
  /** Drawn size in PDF points (1/72 inch). */
  widthPt: number;
  heightPt: number;
}

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/**
 * The unit square maps to the image's placement, so the drawn width is the
 * length of the transformed x basis vector and the height that of y. This is
 * correct under rotation and shear, where naively reading `e`/`f` is not.
 */
export function placedSize(ctm: Matrix): { widthPt: number; heightPt: number } {
  return {
    widthPt: Math.hypot(ctm[0], ctm[1]),
    heightPt: Math.hypot(ctm[2], ctm[3]),
  };
}

export function effectiveDpi(pixels: number, points: number): number | null {
  if (points <= 0.01) return null;
  return (pixels / points) * 72;
}

/** Walk every page and return each image placement found. */
export function collectPlacements(doc: PDFDocument): Placement[] {
  const placements: Placement[] = [];
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const node = page.node;
    const contents = readContents(doc, node.get(PDFName.of("Contents")));
    if (!contents) return;
    const resources = node.Resources();
    walk(doc, contents, resources, IDENTITY, index, placements, 0, new Set());
  });
  return placements;
}

function readContents(doc: PDFDocument, value: unknown): Uint8Array | null {
  const resolved = doc.context.lookup(value as never);
  if (resolved instanceof PDFArray) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < resolved.size(); i += 1) {
      const part = doc.context.lookup(resolved.get(i));
      const bytes = streamBytes(part);
      if (bytes) parts.push(bytes, new Uint8Array([0x0a]));
    }
    if (parts.length === 0) return null;
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
  return streamBytes(resolved);
}

/** Decode a stream's bytes, tolerating filters we cannot undo (we simply skip
 *  the page's DPI analysis rather than failing the job). */
export function streamBytes(object: unknown): Uint8Array | null {
  if (!(object instanceof PDFStream)) return null;
  try {
    if (object instanceof PDFRawStream) return decodePDFRawStream(object).decode();
    return object.getContents();
  } catch {
    return null;
  }
}

function walk(
  doc: PDFDocument,
  content: Uint8Array,
  resources: PDFDict | undefined,
  base: Matrix,
  pageIndex: number,
  out: Placement[],
  depth: number,
  visited: Set<string>,
): void {
  if (depth > MAX_FORM_DEPTH) return;
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);

  let ctm: Matrix = base;
  const stack: Matrix[] = [];
  const operands: Token[] = [];

  for (const token of tokenize(content)) {
    if (token.kind !== "operator") {
      operands.push(token);
      if (operands.length > 8) operands.shift();
      continue;
    }

    switch (token.value) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? IDENTITY;
        break;
      case "cm": {
        const nums = numericOperands(operands, 6);
        if (nums) ctm = multiply(nums as Matrix, ctm);
        break;
      }
      case "Do": {
        const name = operands[operands.length - 1];
        if (name?.kind === "name" && xobjects) {
          handleDo(doc, xobjects, name.value, ctm, pageIndex, out, depth, visited);
        }
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
}

function handleDo(
  doc: PDFDocument,
  xobjects: PDFDict,
  name: string,
  ctm: Matrix,
  pageIndex: number,
  out: Placement[],
  depth: number,
  visited: Set<string>,
): void {
  const ref = xobjects.get(PDFName.of(name));
  const target = doc.context.lookup(ref);
  if (!(target instanceof PDFStream)) return;
  const subtype = target.dict.get(PDFName.of("Subtype"));
  const subtypeName = subtype instanceof PDFName ? subtype.asString() : "";

  if (subtypeName === "/Image") {
    if (!(ref instanceof PDFRef)) return;
    const { widthPt, heightPt } = placedSize(ctm);
    out.push({ objectNumber: ref.objectNumber, page: pageIndex, widthPt, heightPt });
    return;
  }

  if (subtypeName === "/Form") {
    // Guard against a form that draws itself, directly or through a cycle.
    const key = ref instanceof PDFRef ? `${ref.objectNumber}:${depth}` : name;
    if (visited.has(key)) return;
    visited.add(key);

    const matrixArray = target.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
    let formCtm = ctm;
    if (matrixArray && matrixArray.size() === 6) {
      const m: number[] = [];
      for (let i = 0; i < 6; i += 1) m.push(Number(matrixArray.lookup(i)?.toString() ?? 0));
      formCtm = multiply(m as Matrix, ctm);
    }
    const bytes = streamBytes(target);
    if (!bytes) return;
    const formResources = target.dict.lookupMaybe(PDFName.of("Resources"), PDFDict);
    walk(doc, bytes, formResources, formCtm, pageIndex, out, depth + 1, visited);
    visited.delete(key);
  }
}

function numericOperands(operands: Token[], count: number): number[] | null {
  if (operands.length < count) return null;
  const slice = operands.slice(operands.length - count);
  const nums: number[] = [];
  for (const token of slice) {
    if (token.kind !== "number") return null;
    nums.push(token.value);
  }
  return nums;
}

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "operator"; value: string }
  | { kind: "other" };

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/**
 * A content-stream tokenizer that understands just enough to track the CTM:
 * numbers, names, operators, and how to skip over everything else safely —
 * strings, hex strings, dictionaries, comments, and inline images.
 */
export function* tokenize(bytes: Uint8Array): Generator<Token> {
  let i = 0;
  const n = bytes.length;

  while (i < n) {
    const c = bytes[i];

    if (WHITESPACE.has(c)) {
      i += 1;
      continue;
    }

    if (c === 0x25) {
      // comment
      while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
      continue;
    }

    if (c === 0x28) {
      i = skipLiteralString(bytes, i);
      yield { kind: "other" };
      continue;
    }

    if (c === 0x3c) {
      if (bytes[i + 1] === 0x3c) {
        i += 2; // dictionary open — contents are tokenized as usual
        yield { kind: "other" };
        continue;
      }
      while (i < n && bytes[i] !== 0x3e) i += 1;
      i += 1;
      yield { kind: "other" };
      continue;
    }

    if (c === 0x3e && bytes[i + 1] === 0x3e) {
      i += 2;
      yield { kind: "other" };
      continue;
    }

    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) {
      i += 1;
      yield { kind: "other" };
      continue;
    }

    if (c === 0x2f) {
      let j = i + 1;
      while (j < n && !WHITESPACE.has(bytes[j]) && !DELIMITERS.has(bytes[j])) j += 1;
      yield { kind: "name", value: decodeName(bytes.subarray(i + 1, j)) };
      i = j;
      continue;
    }

    if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) {
      let j = i;
      while (j < n && !WHITESPACE.has(bytes[j]) && !DELIMITERS.has(bytes[j])) j += 1;
      const value = Number(latin1(bytes.subarray(i, j)));
      yield Number.isFinite(value) ? { kind: "number", value } : { kind: "other" };
      i = j;
      continue;
    }

    let j = i;
    while (j < n && !WHITESPACE.has(bytes[j]) && !DELIMITERS.has(bytes[j])) j += 1;
    const op = latin1(bytes.subarray(i, j));
    i = j;

    if (op === "BI") {
      // Inline image: everything up to EI is binary data and must not be
      // tokenized, or the first stray "Q" in a pixel run corrupts the stack.
      i = skipInlineImage(bytes, i);
      continue;
    }

    yield { kind: "operator", value: op };
  }
}

function skipLiteralString(bytes: Uint8Array, start: number): number {
  let i = start + 1;
  let depth = 1;
  while (i < bytes.length && depth > 0) {
    const c = bytes[i];
    if (c === 0x5c) {
      i += 2;
      continue;
    }
    if (c === 0x28) depth += 1;
    else if (c === 0x29) depth -= 1;
    i += 1;
  }
  return i;
}

function skipInlineImage(bytes: Uint8Array, start: number): number {
  let i = start;
  // Find ID, then scan for a whitespace-delimited EI after the binary payload.
  while (i < bytes.length - 1) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x44) {
      i += 2;
      break;
    }
    i += 1;
  }
  while (i < bytes.length - 1) {
    if (
      bytes[i] === 0x45 &&
      bytes[i + 1] === 0x49 &&
      (i + 2 >= bytes.length || WHITESPACE.has(bytes[i + 2])) &&
      WHITESPACE.has(bytes[i - 1])
    ) {
      return i + 2;
    }
    i += 1;
  }
  return bytes.length;
}

function decodeName(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x23 && i + 2 < bytes.length) {
      out += String.fromCharCode(parseInt(latin1(bytes.subarray(i + 1, i + 3)), 16));
      i += 2;
    } else {
      out += String.fromCharCode(bytes[i]);
    }
  }
  return out;
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}
