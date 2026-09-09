// Shared types for blockmodel.
//
// Foundation v2 follows the Light-Polycam data model: a CAPTURE (one visit) owns
// ASSETS (files: sources and outputs) and JOBS (reconstruction attempts). The UI
// consumes a composed view-model (`Job` below) so components stay simple.

// ── Capture kinds ───────────────────────────────────────────────────────────
export type CaptureKind = "pano_360" | "photo_3d" | "splat_3dgs";

export function kindLabel(kind: CaptureKind): string {
  if (kind === "pano_360") return "360 tour";
  if (kind === "splat_3dgs") return "gaussian splat";
  return "3D scan";
}

// ── DB rows ─────────────────────────────────────────────────────────────────
export interface CaptureRow {
  id: string;
  name: string;
  kind: CaptureKind;
  createdAt: number; // epoch ms
  archivedAt: number | null; // rule: never hard-delete
}

export type AssetType =
  | "source_photos" // the uploaded photo set (dir of images)
  | "source_video" // the uploaded walkthrough video
  | "pano_360" // equirect panos (the 360 tour's own output = its input)
  | "mesh_glb" // extracted mesh
  | "splat_ply" // extracted gaussian splat
  | "model_zip"; // raw KIRI output zip

export type AssetStatus = "pending" | "ready" | "failed";

export interface AssetRow {
  id: string;
  captureId: string;
  type: AssetType;
  status: AssetStatus;
  path: string | null; // relative to storage/ — a dir for sources, a file for outputs
  bytes: number;
  count: number; // number of files (photos) — 1 for single-file assets
  createdAt: number;
}

// One reconstruction attempt against a provider (KIRI).
export type JobStatus =
  | "uploading" // sending source to the provider
  | "queued" // accepted, waiting in the provider's queue
  | "processing" // reconstruction running
  | "succeeded"
  | "failed";

export interface JobRow {
  id: string;
  captureId: string;
  outputAssetId: string | null; // set once the output asset is materialised
  provider: "kiri";
  providerJobId: string | null; // KIRI `serialize`
  status: JobStatus;
  attempts: number; // 1 for the first try, +1 per resubmit
  errorCode: string | null;
  errorMsg: string | null;
  submittedAt: number;
  completedAt: number | null;
}

export const TERMINAL_STATUSES: JobStatus[] = ["succeeded", "failed"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// ── Composed view-model (what the API returns and the UI renders) ──────────
// Shape-compatible with the v1 `Job` the components were built against, plus
// `assets` and `attempts`.
export interface Job {
  id: string; // capture id
  name: string;
  kind: CaptureKind;
  status: JobStatus; // derived: latest job, or "succeeded" for pano tours
  kiriSerialize: string | null;
  photoCount: number;
  totalBytes: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: string | null;
  errorMsg: string | null;
  modelPath: string | null; // primary viewable output (glb/ply), if any
  attempts: number;
  assets: AssetRow[];
}

// Plain-language label + one-line explanation for each stage.
export function stageLabel(status: JobStatus): { title: string; detail: string } {
  switch (status) {
    case "uploading":
      return { title: "Uploading", detail: "Sending your capture to KIRI Engine." };
    case "queued":
      return { title: "Waiting in queue", detail: "KIRI has your capture and will start shortly." };
    case "processing":
      return {
        title: "Reconstructing",
        detail: "Turning your capture into a 3D model. This usually takes 5–40 minutes.",
      };
    case "succeeded":
      return { title: "Done", detail: "Your model is ready to view." };
    case "failed":
      return { title: "Failed", detail: "Reconstruction didn't complete." };
  }
}
