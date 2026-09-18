/**
 * Stage 5 — image recompression (FR-5.1 … FR-5.6). The only stage that can lose
 * information, and the only one the quality gate guards.
 *
 * Structure of one image's journey:
 *
 *   decode -> classify -> effective DPI -> route to a codec -> search under the
 *   gate -> accept only if it both passes the floor and is actually smaller.
 *
 * The last clause matters more than it looks. A "compressor" that re-encodes a
 * well-made JPEG at a lower quality and writes it back *larger* is a real and
 * common bug; the comparison against the original stream size is what prevents
 * it, and it is also why a second pass over our own output is a no-op.
 */

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
} from "pdf-lib";
import type { PDFDocument } from "pdf-lib";
import type { CompressOptions, ImageClass, ImageReport, Inventory } from "../types";
import { MODES, TINY_IMAGE_BYTES } from "../modes";
import { cacheKey, hashBytes, ResultCache } from "../hash";
import { classify, extractFeatures, seedQuality } from "../quality/features";
import { compositeOverWhite, resampleRgba } from "../quality/resample";
import { scoreRgba, type PixelPlane } from "../quality/score";
import { searchQuality } from "../search/gate";
import {
  decodeWithPlatform,
  encodeAlphaMask,
  encodeFlateSamples,
  encodeJpeg,
  hasMeaningfulAlpha,
  type SampleLayout,
} from "./codec";
import { collectImageStreams } from "./inventory";

const N = (name: string) => PDFName.of(name);

/** Below this scale factor a downsample is doing more harm than the DPI target
 *  asks for — a guard against a bogus CTM producing a 12-pixel image. */
const MIN_SCALE = 0.08;

interface Encoded {
  bytes: Uint8Array;
  width: number;
  height: number;
  filter: "DCTDecode" | "FlateDecode";
  colorSpace: "DeviceRGB" | "DeviceGray";
  bitsPerComponent: number;
  alpha: { bytes: Uint8Array; width: number; height: number } | null;
}

export interface CachedResult {
  encoded: Encoded | null;
  score: number | null;
  quality: number | null;
  iterations: number;
}

export async function recompressImages(
  doc: PDFDocument,
  inventory: Inventory,
  options: CompressOptions,
  cache: ResultCache<CachedResult>,
  onProgress: (done: number, total: number) => void,
): Promise<ImageReport[]> {
  const reports: ImageReport[] = [];
  const streams = collectImageStreams(doc);
  const dpiById = new Map(inventory.images.map((image) => [image.id, image.effectiveDpi]));

  let done = 0;
  for (const { ref, stream } of streams) {
    onProgress(done, streams.length);
    done += 1;

    const report = await processOne(doc, ref, stream, dpiById.get(ref.objectNumber) ?? null, options, cache);
    if (report) reports.push(report);
  }
  onProgress(streams.length, streams.length);
  return reports;
}

async function processOne(
  doc: PDFDocument,
  ref: PDFRef,
  stream: PDFRawStream,
  effectiveDpi: number | null,
  options: CompressOptions,
  cache: ResultCache<CachedResult>,
): Promise<ImageReport | null> {
  const mode = MODES[options.mode];
  const before = stream.contents.length;
  const base = (action: ImageReport["action"], klass: ImageClass = "tiny"): ImageReport => ({
    id: ref.objectNumber,
    klass,
    action,
    beforeBytes: before,
    afterBytes: before,
    score: null,
    quality: null,
    fromDpi: effectiveDpi,
    toDpi: effectiveDpi,
    iterations: 0,
    cacheHit: false,
  });

  // FR-5.3, last row: below a byte threshold the search costs more than it saves.
  if (before < TINY_IMAGE_BYTES) return base("skipped-small");

  // Stencil masks are painted with the current fill colour, not sampled as an
  // image. Re-encoding one is a category error, and they are never large.
  const isMask = stream.dict.get(N("ImageMask"));
  if (isMask && isMask.toString() === "true") return base("skipped-small");

  const source = await decodeImage(doc, stream);
  if (!source) return base("skipped-already-optimal");

  const features = extractFeatures(source.plane);
  const klass = classify(features, before, TINY_IMAGE_BYTES);

  // FR-5.6 — if the source JPEG is already at or below the quality we would
  // target, re-encoding only adds a generation of loss for no gain.
  const existingQuality = source.jpegQuality;
  const seed = seedQuality(features, mode.imageFloor);
  if (existingQuality !== null && existingQuality <= seed && (effectiveDpi ?? 0) <= mode.dpiCeiling * 1.2) {
    return base("skipped-already-optimal", klass);
  }

  // Early exit on free wins (PRD §4): resolution the page cannot show is not a
  // quality decision. Downsample first, then score once.
  const scale =
    effectiveDpi && effectiveDpi > mode.dpiCeiling
      ? Math.max(MIN_SCALE, mode.dpiCeiling / effectiveDpi)
      : 1;
  const targetWidth = Math.max(1, Math.round(source.plane.width * scale));
  const targetHeight = Math.max(1, Math.round(source.plane.height * scale));

  const key = cacheKey(hashBytes(stream.contents), {
    mode: options.mode,
    w: targetWidth,
    h: targetHeight,
    fast: options.fastMode,
  });
  const cached = cache.get(key);
  const outcome = cached ?? (await searchForBest(source, klass, features, targetWidth, targetHeight, mode.imageFloor, options.fastMode));
  if (!cached) cache.set(key, outcome);

  if (!outcome.encoded || outcome.encoded.bytes.length >= before) {
    // FR-5.4: keep the original stream. Nothing was smaller, or nothing passed.
    return {
      ...base("kept", klass),
      score: outcome.score,
      iterations: cached ? 0 : outcome.iterations,
      cacheHit: Boolean(cached),
    };
  }

  replaceImageStream(doc, ref, stream, outcome.encoded);

  return {
    id: ref.objectNumber,
    klass,
    action: scale < 1 ? "downsampled" : "recompressed",
    beforeBytes: before,
    afterBytes: outcome.encoded.bytes.length,
    score: outcome.score,
    quality: outcome.quality,
    fromDpi: effectiveDpi,
    toDpi: effectiveDpi ? Math.round(effectiveDpi * scale) : null,
    iterations: cached ? 0 : outcome.iterations,
    cacheHit: Boolean(cached),
  };
}

/* ------------------------------------------------------------- the routing */

async function searchForBest(
  source: DecodedImage,
  klass: ImageClass,
  features: ReturnType<typeof extractFeatures>,
  width: number,
  height: number,
  floor: number,
  fast: boolean,
): Promise<CachedResult> {
  const reference = source.hasAlpha ? compositeOverWhite(source.plane) : source.plane;
  const scaled = resampleRgba(source.plane, width, height);

  // FR-5.3 — route by class. Line art and screenshots must never reach JPEG:
  // hard edges ring, and the ringing is exactly what a perceptual metric hates,
  // so the search would drive quality up until the file grew.
  const layout: SampleLayout | null =
    klass === "bilevel" ? "bilevel" : klass === "indexed" ? (features.greyFraction > 0.95 ? "gray" : "rgb") : null;

  if (layout) {
    const encoded = encodeFlateSamples(scaled, layout);
    const candidatePlane = reconstructFromLayout(scaled, layout);
    const restored = resampleRgba(candidatePlane, source.plane.width, source.plane.height);
    const detail = scoreRgba(reference, source.hasAlpha ? compositeOverWhite(restored) : restored);
    if (detail.score < floor) return { encoded: null, score: detail.score, quality: null, iterations: 1 };
    return {
      encoded: {
        bytes: encoded.bytes,
        width,
        height,
        filter: "FlateDecode",
        colorSpace: encoded.colorSpace,
        bitsPerComponent: encoded.bitsPerComponent,
        alpha: source.hasAlpha ? { bytes: encodeAlphaMask(scaled), width, height } : null,
      },
      score: detail.score,
      quality: null,
      iterations: 1,
    };
  }

  const result = await searchQuality<Encoded>({
    floor,
    seed: seedQuality(features, floor),
    min: 30,
    max: 95,
    fast,
    encode: async (quality) => {
      const bytes = await encodeJpeg(scaled, quality);
      // Score the *decoded* candidate, not the plane we handed the encoder.
      // The artifacts we are gating on only exist after a round trip.
      const decoded = await decodeWithPlatform(bytes, "image/jpeg");
      const restored = resampleRgba(decoded, source.plane.width, source.plane.height);
      const candidate = source.hasAlpha ? applyAlpha(restored, source.plane) : restored;
      const detail = scoreRgba(reference, candidate);
      return {
        artifact: {
          bytes,
          width,
          height,
          filter: "DCTDecode" as const,
          colorSpace: "DeviceRGB" as const,
          bitsPerComponent: 8,
          alpha: source.hasAlpha ? { bytes: encodeAlphaMask(scaled), width, height } : null,
        },
        bytes: bytes.length,
        score: detail.score,
        quality,
      };
    },
  });

  return {
    encoded: result.best?.artifact ?? null,
    score: result.best?.score ?? null,
    quality: result.best?.quality ?? null,
    iterations: result.iterations,
  };
}

/** What the decoder will produce from the samples we are about to write —
 *  used so bilevel and palette candidates are scored on their real output. */
function reconstructFromLayout(plane: PixelPlane, layout: SampleLayout): PixelPlane {
  const out = new Uint8ClampedArray(plane.data.length);
  for (let i = 0; i < plane.data.length; i += 4) {
    const luma = (plane.data[i] * 77 + plane.data[i + 1] * 151 + plane.data[i + 2] * 28) >> 8;
    if (layout === "bilevel") {
      const v = luma >= 128 ? 255 : 0;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
    } else if (layout === "gray") {
      out[i] = luma;
      out[i + 1] = luma;
      out[i + 2] = luma;
    } else {
      out[i] = plane.data[i];
      out[i + 1] = plane.data[i + 1];
      out[i + 2] = plane.data[i + 2];
    }
    out[i + 3] = plane.data[i + 3];
  }
  return { data: out, width: plane.width, height: plane.height };
}

/** FR-5.5 — score the composited result, not the base image alone. */
function applyAlpha(rgb: PixelPlane, alphaSource: PixelPlane): PixelPlane {
  const alpha = resampleRgba(alphaSource, rgb.width, rgb.height);
  const out = new Uint8ClampedArray(rgb.data.length);
  for (let i = 0; i < rgb.data.length; i += 4) {
    const a = alpha.data[i + 3] / 255;
    out[i] = rgb.data[i] * a + 255 * (1 - a);
    out[i + 1] = rgb.data[i + 1] * a + 255 * (1 - a);
    out[i + 2] = rgb.data[i + 2] * a + 255 * (1 - a);
    out[i + 3] = 255;
  }
  return { data: out, width: rgb.width, height: rgb.height };
}

/* -------------------------------------------------------------- decoding */

interface DecodedImage {
  plane: PixelPlane;
  hasAlpha: boolean;
  /** Quality estimated from the source's quantisation tables, if it is a JPEG. */
  jpegQuality: number | null;
}

export async function decodeImage(doc: PDFDocument, stream: PDFRawStream): Promise<DecodedImage | null> {
  const dict = stream.dict;
  const width = numberOf(dict.get(N("Width")));
  const height = numberOf(dict.get(N("Height")));
  if (!width || !height || width * height > 80_000_000) return null;

  const filters = filterNames(dict);
  let plane: PixelPlane | null = null;
  let jpegQuality: number | null = null;

  if (filters.includes("DCTDecode")) {
    try {
      plane = await decodeWithPlatform(stream.contents, "image/jpeg");
      jpegQuality = estimateJpegQuality(stream.contents);
    } catch {
      return null;
    }
  } else if (filters.some((f) => ["JPXDecode", "JBIG2Decode", "CCITTFaxDecode"].includes(f))) {
    // JPEG 2000, JBIG2 and CCITT G4 have no decoder in this build, and a codec
    // we cannot decode is a codec we cannot score. Leave the stream alone.
    return null;
  } else {
    const samples = decodeRawSamples(stream);
    if (!samples) return null;
    plane = samplesToRgba(doc, dict, samples, width, height);
  }

  if (!plane) return null;

  const smask = await decodeSoftMask(doc, dict);
  let hasAlpha = false;
  if (smask) {
    const mask = resampleRgba(smask, plane.width, plane.height);
    for (let i = 0; i < plane.data.length; i += 4) plane.data[i + 3] = mask.data[i];
    hasAlpha = hasMeaningfulAlpha(plane);
  }

  return { plane, hasAlpha, jpegQuality };
}

async function decodeSoftMask(doc: PDFDocument, dict: PDFDict): Promise<PixelPlane | null> {
  const smask = doc.context.lookup(dict.get(N("SMask")));
  if (!(smask instanceof PDFRawStream)) return null;
  const width = numberOf(smask.dict.get(N("Width")));
  const height = numberOf(smask.dict.get(N("Height")));
  if (!width || !height) return null;
  const samples = decodeRawSamples(smask);
  if (!samples) return null;
  return samplesToRgba(doc, smask.dict, samples, width, height);
}

function decodeRawSamples(stream: PDFRawStream): Uint8Array | null {
  try {
    const filter = stream.dict.get(N("Filter"));
    if (!filter) return stream.contents;
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}

function filterNames(dict: PDFDict): string[] {
  const filter = dict.get(N("Filter"));
  if (filter instanceof PDFName) return [filter.asString().replace(/^\//, "")];
  if (filter instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < filter.size(); i += 1) {
      const f = filter.get(i);
      if (f instanceof PDFName) out.push(f.asString().replace(/^\//, ""));
    }
    return out;
  }
  return [];
}

/**
 * Sample data -> RGBA, honouring the colour space and bit depth actually
 * declared. Unsupported spaces return null rather than a guess: a wrong
 * conversion here would be scored as damage and the image would be rejected,
 * which is the safe direction, but it would also waste the whole search.
 */
function samplesToRgba(
  doc: PDFDocument,
  dict: PDFDict,
  samples: Uint8Array,
  width: number,
  height: number,
): PixelPlane | null {
  const bpc = numberOf(dict.get(N("BitsPerComponent"))) ?? 8;
  const space = resolveColorSpace(doc, dict.get(N("ColorSpace")));
  if (!space) return null;

  const invert = decodeInverts(dict);
  const out = new Uint8ClampedArray(width * height * 4);
  const rowBits = width * space.components * bpc;
  const rowBytes = Math.ceil(rowBits / 8);
  const maxValue = (1 << bpc) - 1;

  if (samples.length < rowBytes * height) return null;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x += 1) {
      const pixel: number[] = [];
      for (let c = 0; c < space.components; c += 1) {
        const bitOffset = (x * space.components + c) * bpc;
        pixel.push(readBits(samples, rowStart * 8 + bitOffset, bpc));
      }
      const o = (y * width + x) * 4;
      const rgb = space.toRgb(pixel, maxValue);
      out[o] = invert ? 255 - rgb[0] : rgb[0];
      out[o + 1] = invert ? 255 - rgb[1] : rgb[1];
      out[o + 2] = invert ? 255 - rgb[2] : rgb[2];
      out[o + 3] = 255;
    }
  }

  return { data: out, width, height };
}

interface ColorSpaceAdapter {
  components: number;
  toRgb(values: number[], maxValue: number): [number, number, number];
}

function resolveColorSpace(doc: PDFDocument, value: unknown): ColorSpaceAdapter | null {
  const resolved = doc.context.lookup(value as never) ?? value;

  if (resolved instanceof PDFName) {
    switch (resolved.asString()) {
      case "/DeviceGray":
      case "/CalGray":
      case "/G":
        return grayAdapter();
      case "/DeviceRGB":
      case "/CalRGB":
      case "/RGB":
        return rgbAdapter();
      case "/DeviceCMYK":
      case "/CMYK":
        return cmykAdapter();
      default:
        return null;
    }
  }

  if (resolved instanceof PDFArray && resolved.size() > 0) {
    const family = resolved.get(0);
    const familyName = family instanceof PDFName ? family.asString() : "";

    if (familyName === "/ICCBased") {
      const profile = doc.context.lookup(resolved.get(1));
      const n = profile instanceof PDFStream ? numberOf(profile.dict.get(N("N"))) : null;
      if (n === 1) return grayAdapter();
      if (n === 4) return cmykAdapter();
      return rgbAdapter();
    }
    if (familyName === "/CalRGB" || familyName === "/Lab") return rgbAdapter();
    if (familyName === "/CalGray") return grayAdapter();
    if (familyName === "/Indexed" || familyName === "/I") {
      const base = resolveColorSpace(doc, resolved.get(1));
      const lookup = readLookupTable(doc, resolved.get(3));
      if (!base || !lookup) return null;
      return {
        components: 1,
        toRgb(values) {
          const index = values[0] * base.components;
          const entry: number[] = [];
          for (let c = 0; c < base.components; c += 1) entry.push(lookup[index + c] ?? 0);
          return base.toRgb(entry, 255);
        },
      };
    }
    // Separation / DeviceN: one or more inks into an alternate space via a
    // tint transform function we do not evaluate. Approximate the common case
    // (a single ink) as ink coverage on white, which is right for the greyscale
    // scans this actually shows up on.
    if (familyName === "/Separation" || familyName === "/DeviceN") {
      const componentCount =
        familyName === "/Separation"
          ? 1
          : (doc.context.lookup(resolved.get(1)) as PDFArray | undefined)?.size() ?? 1;
      return {
        components: componentCount,
        toRgb(values, maxValue) {
          let ink = 0;
          for (const value of values) ink = Math.max(ink, value / maxValue);
          const v = Math.round((1 - ink) * 255);
          return [v, v, v];
        },
      };
    }
  }

  return null;
}

function readLookupTable(doc: PDFDocument, value: unknown): Uint8Array | null {
  const resolved = doc.context.lookup(value as never) ?? value;
  if (resolved instanceof PDFRawStream) return decodeRawSamples(resolved);
  if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
    // The palette is binary, not text — decodeText() would mangle it through
    // UTF-16 detection.
    return resolved.asBytes();
  }
  return null;
}

function grayAdapter(): ColorSpaceAdapter {
  return {
    components: 1,
    toRgb(values, maxValue) {
      const v = Math.round((values[0] / maxValue) * 255);
      return [v, v, v];
    },
  };
}

function rgbAdapter(): ColorSpaceAdapter {
  return {
    components: 3,
    toRgb(values, maxValue) {
      return [
        Math.round((values[0] / maxValue) * 255),
        Math.round((values[1] / maxValue) * 255),
        Math.round((values[2] / maxValue) * 255),
      ];
    },
  };
}

function cmykAdapter(): ColorSpaceAdapter {
  return {
    components: 4,
    toRgb(values, maxValue) {
      const c = values[0] / maxValue;
      const m = values[1] / maxValue;
      const y = values[2] / maxValue;
      const k = values[3] / maxValue;
      return [
        Math.round(255 * (1 - Math.min(1, c + k))),
        Math.round(255 * (1 - Math.min(1, m + k))),
        Math.round(255 * (1 - Math.min(1, y + k))),
      ];
    },
  };
}

function decodeInverts(dict: PDFDict): boolean {
  const decode = dict.get(N("Decode"));
  if (!(decode instanceof PDFArray) || decode.size() < 2) return false;
  return numberOf(decode.get(0)) === 1 && numberOf(decode.get(1)) === 0;
}

function readBits(bytes: Uint8Array, bitOffset: number, bits: number): number {
  if (bits === 8) return bytes[bitOffset >> 3] ?? 0;
  if (bits === 16) {
    const i = bitOffset >> 3;
    return ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
  }
  let value = 0;
  for (let i = 0; i < bits; i += 1) {
    const bit = bitOffset + i;
    const byte = bytes[bit >> 3] ?? 0;
    value = (value << 1) | ((byte >> (7 - (bit & 7))) & 1);
  }
  return value;
}

/* ----------------------------------------------------------- JPEG quality */

/** The standard luminance quantisation table from the JPEG spec, Annex K. */
const STANDARD_LUMA_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/**
 * FR-5.6 — recover the quality setting a JPEG was written at by inverting
 * libjpeg's scaling of the standard table. Exact for anything libjpeg-derived,
 * which is most of the JPEGs in the world, and approximately right otherwise.
 * Returns null when there is no DQT to read.
 */
export function estimateJpegQuality(bytes: Uint8Array): number | null {
  let i = 2;
  while (i < bytes.length - 3) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xdb) {
      const precision = bytes[i + 4] >> 4;
      if (precision !== 0) return null;
      const table = bytes.subarray(i + 5, i + 5 + 64);
      if (table.length < 64) return null;
      const scales: number[] = [];
      for (let k = 0; k < 64; k += 1) {
        if (table[k] === 0) continue;
        scales.push((table[k] * 100 - 50) / STANDARD_LUMA_TABLE[k]);
      }
      if (scales.length === 0) return null;
      scales.sort((a, b) => a - b);
      const s = scales[Math.floor(scales.length / 2)];
      const quality = s <= 0 ? 100 : s < 100 ? (200 - s) / 2 : 5000 / s;
      return Math.round(Math.max(1, Math.min(100, quality)));
    }
    if (marker === 0xda) return null; // start of scan — no more tables
    i += 2 + length;
  }
  return null;
}

/* ------------------------------------------------------------- writing back */

function replaceImageStream(doc: PDFDocument, ref: PDFRef, original: PDFRawStream, encoded: Encoded): void {
  const dict = doc.context.obj({}) as PDFDict;
  dict.set(N("Type"), N("XObject"));
  dict.set(N("Subtype"), N("Image"));
  dict.set(N("Width"), doc.context.obj(encoded.width));
  dict.set(N("Height"), doc.context.obj(encoded.height));
  dict.set(N("ColorSpace"), N(encoded.colorSpace));
  dict.set(N("BitsPerComponent"), doc.context.obj(encoded.bitsPerComponent));
  dict.set(N("Filter"), N(encoded.filter));
  dict.set(N("Length"), doc.context.obj(encoded.bytes.length));

  // Carry across the keys that describe how the image is *used* rather than how
  // it is stored. Dropping /OC would make an image visible that the document
  // says is part of a hidden layer.
  for (const key of ["OC", "Intent", "Interpolate", "Mask", "StructParent"]) {
    const value = original.dict.get(N(key));
    if (value) dict.set(N(key), value);
  }

  if (encoded.alpha) {
    const maskDict = doc.context.obj({}) as PDFDict;
    maskDict.set(N("Type"), N("XObject"));
    maskDict.set(N("Subtype"), N("Image"));
    maskDict.set(N("Width"), doc.context.obj(encoded.alpha.width));
    maskDict.set(N("Height"), doc.context.obj(encoded.alpha.height));
    maskDict.set(N("ColorSpace"), N("DeviceGray"));
    maskDict.set(N("BitsPerComponent"), doc.context.obj(8));
    maskDict.set(N("Filter"), N("FlateDecode"));
    maskDict.set(N("Length"), doc.context.obj(encoded.alpha.bytes.length));
    const maskRef = doc.context.register(PDFRawStream.of(maskDict, encoded.alpha.bytes));
    dict.set(N("SMask"), maskRef);
  } else {
    const existing = original.dict.get(N("SMask"));
    if (existing) dict.set(N("SMask"), existing);
  }

  doc.context.assign(ref, PDFRawStream.of(dict, encoded.bytes));
}

function numberOf(object: unknown): number | null {
  if (object instanceof PDFNumber) return object.asNumber();
  return null;
}
