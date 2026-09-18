/**
 * The pipeline — stages in order, and the rules about what may be delivered.
 *
 * Two invariants live here rather than in any single stage:
 *
 *  1. **Never degrade below the declared fidelity floor.** The per-page check
 *     governs the final accept (PRD §4). A document whose worst page falls below
 *     its mode's page floor is not delivered at that mode; it falls back to the
 *     lossless-only result. This is a hard invariant, not a best effort.
 *  2. **Never return a broken file.** If validation fails on any hard gate, the
 *     output is discarded — first to the lossless-only result, then to the
 *     original bytes passed through untouched (FR-6.4).
 */

import type {
  CompressOptions,
  CompressionResult,
  GateState,
  Inventory,
  JobOutcome,
  ModeId,
  ProgressEvent,
  StageSaving,
} from "./types";
import { MODES, SAFER_MODE, VISUALLY_LOSSLESS_FLOOR } from "./modes";
import { ResultCache } from "./hash";
import { analyse, loadDocument } from "./pdf/inventory";
import { optimiseStructure } from "./pdf/structural";
import { optimiseFonts } from "./pdf/fonts";
import { strip } from "./pdf/strip";
import { recompressImages, type CachedResult } from "./pdf/images";
import { passed, validateOutput } from "./pdf/validate";

export class RefusalError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RefusalError";
  }
}

export type ProgressSink = (event: ProgressEvent) => void;

export async function analyseDocument(bytes: Uint8Array): Promise<Inventory> {
  const { inventory } = await analyse(bytes);
  return inventory;
}

export async function runJob(
  input: Uint8Array,
  options: CompressOptions,
  onProgress: ProgressSink = () => {},
): Promise<JobOutcome> {
  onProgress({ stage: "triage", message: "Reading the object graph", fraction: 0.01 });
  const { inventory } = await analyse(input);

  for (const refusal of inventory.refusals) {
    if (!refusal.overridable) throw new RefusalError(refusal.message, refusal.code);
    if (refusal.code === "conformance" && !options.dropConformance) {
      throw new RefusalError(refusal.message, refusal.code);
    }
  }

  // One cache for the whole job. Keys include the mode, so the safer
  // alternative does not collide with the primary — but the same logo on 200
  // pages is searched once, which is the largest practical speedup available
  // on templated business documents (PRD §10).
  const cache = new ResultCache<CachedResult>();
  const primary = await compressTo(input, inventory, options, onProgress, 0.02, 0.86, cache);
  const gate = evaluateGate(primary, options);

  // FR-6.4 — the conservative alternative is computed *before* the user is
  // asked, so the choice is between two real files rather than an offer to
  // re-run. Only when the gate actually blocks, and only when the primary was
  // more aggressive than the safer mode in the first place.
  let alternative: CompressionResult | null = null;
  if (gate.branch === "choice" && isMoreAggressiveThan(options.mode, SAFER_MODE)) {
    onProgress({ stage: "images", message: "Building the safer alternative", fraction: 0.88 });
    alternative = await compressTo(
      input,
      inventory,
      { ...options, mode: SAFER_MODE },
      onProgress,
      0.88,
      0.99,
      cache,
    );
  }

  onProgress({ stage: "validate", message: "Done", fraction: 1 });
  return { inventory, primary, alternative, gate };
}

/* ------------------------------------------------------------ one full pass */

async function compressTo(
  input: Uint8Array,
  inventory: Inventory,
  options: CompressOptions,
  onProgress: ProgressSink,
  from: number,
  to: number,
  cache: ResultCache<CachedResult>,
): Promise<CompressionResult> {
  const started = now();
  const span = (t: number) => from + (to - from) * t;
  const mode = MODES[options.mode];

  const attempt = await runStages(input, inventory, options, onProgress, span, cache);

  onProgress({ stage: "validate", message: "Checking the output opens and reads the same", fraction: span(0.78) });
  let validation = await validateOutput(input, attempt.bytes, (done, total) => {
    onProgress({
      stage: "validate",
      message: `Scoring page ${Math.min(done + 1, total)} of ${total}`,
      fraction: span(0.78 + 0.2 * (total === 0 ? 1 : done / total)),
    });
  });

  let bytes = attempt.bytes;
  let stages = attempt.stages;
  let images = attempt.images;
  let causes = attempt.causes;
  let fellBackTo: CompressionResult["validation"]["fellBackTo"] = null;

  const worstScore = validation.pageScores.length > 0 ? Math.min(...validation.pageScores) : 100;
  const floorViolated = mode.lossy && worstScore < mode.pageFloor;

  if (!passed(validation.report) || floorViolated) {
    const reason = floorViolated
      ? `A page scored ${worstScore.toFixed(1)}, below this mode's floor of ${mode.pageFloor}.`
      : "The compressed file failed a validation check.";

    // Fall back to the lossless-only result: the same document with stage 5
    // switched off. Everything stages 1–4 won is still real.
    onProgress({ stage: "validate", message: "Falling back to the lossless result", fraction: span(0.9) });
    const losslessOptions: CompressOptions = { ...options, mode: "lossless" };
    const fallback = await runStages(input, inventory, losslessOptions, onProgress, span, cache);
    const fallbackValidation = await validateOutput(input, fallback.bytes);

    if (passed(fallbackValidation.report)) {
      bytes = fallback.bytes;
      stages = fallback.stages;
      images = fallback.images;
      causes = [reason, ...fallback.causes];
      validation = fallbackValidation;
      fellBackTo = "lossless-only";
    } else {
      // Last resort: the original, untouched. A job that saves nothing is a
      // worse outcome than a job that ships a broken file only if you do not
      // have to open the file afterwards.
      bytes = input;
      stages = [];
      images = [];
      causes = [reason, "The lossless result did not validate either, so the original file is returned unchanged."];
      validation = {
        report: { ...fallbackValidation.report, notes: [...fallbackValidation.report.notes] },
        pageScores: [],
        worstPage: null,
      };
      fellBackTo = "original";
    }
  }

  validation.report.fellBackTo = fellBackTo;

  const outputBytes = bytes.length;
  const residual = input.length - outputBytes - stages.reduce((sum, stage) => sum + stage.bytes, 0);
  if (residual > 0) {
    const structural = stages.find((stage) => stage.stage === "structural");
    if (structural) structural.bytes += residual;
  }

  return {
    mode: options.mode,
    inputBytes: input.length,
    outputBytes,
    ratio: input.length > 0 ? 1 - outputBytes / input.length : 0,
    bytes,
    pageScores: validation.pageScores,
    worstPage: validation.worstPage,
    images,
    stages,
    validation: validation.report,
    causes,
    ms: now() - started,
  };
}

interface StageOutput {
  bytes: Uint8Array;
  stages: StageSaving[];
  images: CompressionResult["images"];
  causes: string[];
}

async function runStages(
  input: Uint8Array,
  inventory: Inventory,
  options: CompressOptions,
  onProgress: ProgressSink,
  span: (t: number) => number,
  cache: ResultCache<CachedResult>,
): Promise<StageOutput> {
  const mode = MODES[options.mode];
  // A fresh parse per pass: the stages mutate the object graph, so the primary
  // and the safer alternative cannot share one. Object numbers come from the
  // file itself, so the inventory's effective-DPI map still keys correctly.
  const doc = await loadDocument(input);

  const stages: StageSaving[] = [];
  const causes: string[] = [];

  onProgress({ stage: "structural", message: "Collecting dead objects and re-compressing streams", fraction: span(0.04) });
  let t = now();
  const structuralReport = optimiseStructure(doc);
  stages.push({
    stage: "structural",
    label: "Structure and streams",
    bytes: structuralReport.bytesSavedOnStreams,
    ms: now() - t,
  });
  if (structuralReport.objectsCollected > 0) {
    causes.push(`${structuralReport.objectsCollected} dead objects left by earlier edits were removed.`);
  }
  if (structuralReport.objectsDeduplicated > 0) {
    causes.push(`${structuralReport.objectsDeduplicated} duplicate objects were merged into shared references.`);
  }

  onProgress({ stage: "fonts", message: "Merging duplicate font programs", fraction: span(0.12) });
  t = now();
  const fontReport = optimiseFonts(doc, inventory.flags);
  stages.push({ stage: "fonts", label: "Fonts", bytes: fontReport.bytesSaved, ms: now() - t });
  if (fontReport.programsMerged > 0) {
    causes.push(`${fontReport.programsMerged} duplicate font embeddings were merged.`);
  }

  onProgress({ stage: "strip", message: "Removing thumbnails and identifying metadata", fraction: span(0.16) });
  t = now();
  const stripReport = strip(doc, options, inventory.flags);
  stages.push({ stage: "strip", label: "Thumbnails and metadata", bytes: 0, ms: now() - t });
  if (stripReport.thumbnails > 0) causes.push(`${stripReport.thumbnails} stored page thumbnails were dropped — viewers regenerate them.`);
  if (stripReport.metadataStripped) causes.push("Author, producer and creation-host metadata were removed.");

  let images: CompressionResult["images"] = [];
  if (mode.lossy) {
    t = now();
    images = await recompressImages(
      doc,
      inventory,
      options,
      cache,
      (done, total) => {
        onProgress({
          stage: "images",
          message: total === 0 ? "No images to compress" : `Image ${Math.min(done + 1, total)} of ${total} — encode, score, decide`,
          fraction: span(0.2 + 0.5 * (total === 0 ? 1 : done / total)),
        });
      },
    );
    const savedBytes = images.reduce((sum, image) => sum + (image.beforeBytes - image.afterBytes), 0);
    stages.push({ stage: "images", label: "Images", bytes: savedBytes, ms: now() - t });
    causes.push(...describeImageWork(images));
  }

  onProgress({ stage: "structural", message: "Writing the file", fraction: span(0.72) });
  const bytes = await doc.save({
    // FR-2.3 — pack small objects into object streams and write a compressed
    // cross-reference stream.
    useObjectStreams: true,
    addDefaultPage: false,
    objectsPerTick: Number.MAX_SAFE_INTEGER,
  });

  if (inventory.flags.linearized) {
    causes.push("This file was linearised for fast web view; the rewritten file is not, since pdf-lib cannot re-linearise.");
  }

  return { bytes, stages, images, causes };
}

/** FR-6.6 — name the cause in plain language, not the codec. */
function describeImageWork(images: CompressionResult["images"]): string[] {
  const causes: string[] = [];
  const downsampled = images.filter((image) => image.action === "downsampled");
  const recompressed = images.filter((image) => image.action === "recompressed");
  const bilevel = recompressed.filter((image) => image.klass === "bilevel");

  if (downsampled.length > 0) {
    const from = median(downsampled.map((image) => image.fromDpi ?? 0).filter(Boolean));
    const to = median(downsampled.map((image) => image.toDpi ?? 0).filter(Boolean));
    causes.push(
      from && to
        ? `${downsampled.length} image${downsampled.length === 1 ? "" : "s"} reduced from about ${Math.round(from)} DPI to ${Math.round(to)} DPI.`
        : `${downsampled.length} images were reduced in resolution to match how large they appear on the page.`,
    );
  }
  const photoRecompressed = recompressed.length - bilevel.length;
  if (photoRecompressed > 0) {
    causes.push(`${photoRecompressed} photo${photoRecompressed === 1 ? " was" : "s were"} re-encoded at a lower JPEG quality.`);
  }
  if (bilevel.length > 0) {
    causes.push(`${bilevel.length} scanned page${bilevel.length === 1 ? "" : "s"} converted to black and white, which is how scans compress best.`);
  }
  const kept = images.filter((image) => image.action === "kept" || image.action === "skipped-already-optimal");
  if (kept.length > 0) {
    causes.push(`${kept.length} image${kept.length === 1 ? " was" : "s were"} left untouched — nothing smaller passed the quality gate.`);
  }
  return causes;
}

/* -------------------------------------------------------------- the gate */

/**
 * PRD §6. The headline rule is the ratio, but ratio alone fires constantly on
 * bloated scans where nothing was lost, and users learn to dismiss it without
 * reading. So the ratio decides *whether* to speak and the quality evidence
 * decides *how*: a confident notice that does not block, or a choice that does.
 */
export function evaluateGate(result: CompressionResult, options: CompressOptions): GateState {
  const pagesBelow = result.pageScores
    .map((score, index) => ({ score, index }))
    .filter((page) => page.score < VISUALLY_LOSSLESS_FLOOR)
    .map((page) => page.index);

  const ratioFired = result.ratio > options.gateThreshold;
  // FR-6.2 — a 60% reduction that wrecked one page deserves the same
  // interruption. The ratio rule catches the common case; this catches the
  // dangerous one.
  const scoreFired = pagesBelow.length > 0;

  if (!ratioFired && !scoreFired) {
    return { fired: false, branch: "none", reason: null, pagesBelowVisuallyLossless: [], policy: options.policy };
  }

  return {
    fired: true,
    branch: scoreFired ? "choice" : "confident",
    reason: ratioFired && scoreFired ? "both" : ratioFired ? "ratio" : "page-score",
    pagesBelowVisuallyLossless: pagesBelow,
    policy: options.policy,
  };
}

function isMoreAggressiveThan(mode: ModeId, other: ModeId): boolean {
  const order: ModeId[] = ["lossless", "visually-lossless", "balanced", "aggressive"];
  return order.indexOf(mode) > order.indexOf(other);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
