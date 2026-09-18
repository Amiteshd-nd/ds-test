/**
 * Shared vocabulary for the whole pipeline.
 *
 * Everything here is structurally-typed plain data so it can cross the
 * worker boundary with `postMessage` unchanged. No classes, no Dates, no refs
 * to pdf-lib objects — those stay inside the stage that owns them.
 */

export type ModeId = "lossless" | "visually-lossless" | "balanced" | "aggressive";

/** A fidelity floor, not a quality setting. See PRD §4. */
export interface Mode {
  id: ModeId;
  label: string;
  /** Minimum perceptual score an individual re-encoded image must reach. */
  imageFloor: number;
  /**
   * Minimum perceptual score a rendered *page* must reach. Stricter than the
   * image floor on purpose: an image that passes in isolation can still look
   * wrong next to crisp vector text, and the page check is the one that governs
   * the final accept.
   */
  pageFloor: number;
  /** Images above this effective DPI are downsampled toward it. */
  dpiCeiling: number;
  /** False for Lossless — stage 5 never runs. */
  lossy: boolean;
  blurb: string;
}

/** Where a file's bytes actually go. Drives both routing and the UI. */
export interface ByteBudget {
  images: number;
  fonts: number;
  content: number;
  metadata: number;
  overhead: number;
  total: number;
}

export type ImageClass = "bilevel" | "indexed" | "greyscale" | "photographic" | "tiny";

export interface ImageInfo {
  /** pdf-lib object number — stable within one parse, used as the UI key. */
  id: number;
  width: number;
  height: number;
  /** Largest scale the image is drawn at, resolved from the CTM (FR-5.2). */
  effectiveDpi: number | null;
  bitsPerComponent: number;
  colorSpace: string;
  filter: string;
  bytes: number;
  klass: ImageClass;
  hasAlpha: boolean;
  pages: number[];
}

export interface FontInfo {
  id: number;
  name: string;
  bytes: number;
  subsetAlready: boolean;
  embedded: boolean;
}

/** Reasons we refuse to touch a file, or touch it only carefully (FR-1.2). */
export interface TriageFlags {
  encrypted: boolean;
  signed: boolean;
  linearized: boolean;
  /** "PDF/A-2b", "PDF/X-4", … when a conformance claim is present. */
  conformance: string | null;
  hasAcroForm: boolean;
  hasVariableTextFields: boolean;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
  hasTaggedStructure: boolean;
}

export interface Refusal {
  code: "encrypted" | "signed" | "conformance" | "corrupt";
  message: string;
  /** True when the user can override it with an explicit opt-out. */
  overridable: boolean;
}

export interface Inventory {
  pageCount: number;
  bytes: number;
  pdfVersion: string;
  budget: ByteBudget;
  images: ImageInfo[];
  fonts: FontInfo[];
  flags: TriageFlags;
  refusals: Refusal[];
  /** Per-mode estimate, derived from this inventory rather than a fixed guess. */
  estimates: Record<ModeId, { low: number; high: number }>;
  recommended: ModeId;
  /** One sentence of plain language explaining the recommendation (FR-7.3). */
  rationale: string;
}

/** What happened to one image under the quality gate. */
export interface ImageReport {
  id: number;
  klass: ImageClass;
  action: "kept" | "recompressed" | "downsampled" | "skipped-small" | "skipped-already-optimal";
  beforeBytes: number;
  afterBytes: number;
  score: number | null;
  quality: number | null;
  fromDpi: number | null;
  toDpi: number | null;
  /** Encode-and-score cycles actually spent. Cache hits report 0. */
  iterations: number;
  cacheHit: boolean;
}

export type StageId = "triage" | "structural" | "fonts" | "strip" | "images" | "validate";

export interface StageSaving {
  stage: StageId;
  label: string;
  bytes: number;
  ms: number;
}

export interface ValidationReport {
  opens: boolean;
  pageCountMatches: boolean;
  rendersAllPages: boolean;
  textExtractionMatches: boolean;
  /** Set when we fell back rather than shipping a failed output (FR-6.4). */
  fellBackTo: "lossless-only" | "original" | null;
  notes: string[];
}

export interface CompressionResult {
  mode: ModeId;
  inputBytes: number;
  outputBytes: number;
  /** 1 - out/in. 0.87 means "87% smaller". */
  ratio: number;
  bytes: Uint8Array;
  /** One perceptual score per page, index 0 = page 1. */
  pageScores: number[];
  worstPage: { index: number; score: number; region: Rect | null } | null;
  images: ImageReport[];
  stages: StageSaving[];
  validation: ValidationReport;
  /** Plain-language causes, e.g. "14 photos reduced from 600 to 150 DPI". */
  causes: string[];
  ms: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GatePolicy = "prompt" | "accept" | "fallback" | "fail";

export interface GateState {
  fired: boolean;
  /** "confident" = big saving with no measured loss; "choice" = blocking. */
  branch: "none" | "confident" | "choice";
  reason: "ratio" | "page-score" | "both" | null;
  pagesBelowVisuallyLossless: number[];
  policy: GatePolicy;
}

export interface JobOutcome {
  inventory: Inventory;
  primary: CompressionResult;
  /** The Visually Lossless result, computed alongside so the choice is between
   *  two real files rather than an offer to re-run (FR-6.4). */
  alternative: CompressionResult | null;
  gate: GateState;
}

export interface ProgressEvent {
  stage: StageId;
  message: string;
  /** 0..1 within the whole job, monotonic. */
  fraction: number;
}

export interface CompressOptions {
  mode: ModeId;
  /** Stage 4 toggles. Defaults follow FR-4.2/FR-4.3. */
  strip: {
    thumbnails: boolean;
    javascript: boolean;
    embeddedFiles: boolean;
    metadata: boolean;
  };
  /** Ratio above which the gate fires. Configurable per FR-6.1. */
  gateThreshold: number;
  policy: GatePolicy;
  /** Skip the search and take the seed model's prediction (PRD §11 fast mode). */
  fastMode: boolean;
  /** Proceed on a PDF/A or PDF/X file, dropping the conformance claim. */
  dropConformance: boolean;
}
