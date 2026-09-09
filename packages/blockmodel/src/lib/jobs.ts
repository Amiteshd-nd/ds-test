import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import {
  archiveCaptureRow,
  countJobsForCapture,
  getCapture,
  insertAsset,
  insertCapture,
  insertJob,
  latestJobForCapture,
  listActiveJobs,
  listAssets,
  listCaptures,
  updateAsset,
  updateJobRow,
} from "./db";
import { logKiri } from "./logger";
import { getModelZipUrl, getStatus, KiriError, submit3dgs, submitPhotoScan, type KiriFile } from "./kiri";
import { listSourceFilenames, readPhoto, saveModelBytes, savePhotos } from "./storage";
import {
  isTerminal,
  type AssetRow,
  type CaptureKind,
  type CaptureRow,
  type Job,
  type JobRow,
} from "./types";

// ── Orchestration over captures / assets / jobs ─────────────────────────────
// The UI consumes the composed `Job` view-model; components never see rows.

interface UploadFile {
  name: string;
  type: string;
  data: Buffer;
}

// ── Composition: rows → view-model ──────────────────────────────────────────

function composeJob(capture: CaptureRow): Job {
  const assets = listAssets(capture.id);
  const job = latestJobForCapture(capture.id);

  const source = assets.find((a) =>
    ["source_photos", "source_video", "pano_360"].includes(a.type),
  );
  const output = assets.find(
    (a) => (a.type === "mesh_glb" || a.type === "splat_ply") && a.status === "ready" && a.path,
  );

  return {
    id: capture.id,
    name: capture.name,
    kind: capture.kind,
    // Pano tours have no reconstruction — they're done the moment they exist.
    status: capture.kind === "pano_360" ? "succeeded" : (job?.status ?? "failed"),
    kiriSerialize: job?.providerJobId ?? null,
    photoCount: source?.count ?? 0,
    totalBytes: source?.bytes ?? 0,
    createdAt: capture.createdAt,
    startedAt: job?.submittedAt ?? capture.createdAt,
    finishedAt: job?.completedAt ?? (capture.kind === "pano_360" ? capture.createdAt : null),
    errorCode: job?.errorCode ?? null,
    errorMsg: job?.errorMsg ?? null,
    modelPath: output?.path ?? null,
    attempts: job ? countJobsForCapture(capture.id) : 0,
    assets,
  };
}

export function getJob(id: string): Job | null {
  const capture = getCapture(id);
  return capture ? composeJob(capture) : null;
}

export function listJobs(): Job[] {
  return listCaptures().map(composeJob);
}

export function archiveCapture(id: string): boolean {
  if (!getCapture(id)) return false;
  archiveCaptureRow(id);
  return true;
}

// ── Creation ────────────────────────────────────────────────────────────────

// 360 tour: no reconstruction, no KIRI — the uploaded panos ARE the output.
export async function createPano(name: string, files: UploadFile[]): Promise<Job> {
  const id = randomUUID();
  const now = Date.now();
  const totalBytes = files.reduce((s, f) => s + f.data.byteLength, 0);

  await savePhotos(
    id,
    files.map((f) => ({ name: f.name, data: f.data })),
  );

  insertCapture({ id, name: name.trim() || "Untitled tour", kind: "pano_360", createdAt: now, archivedAt: null });
  insertAsset({
    id: randomUUID(),
    captureId: id,
    type: "pano_360",
    status: "ready",
    path: `${id}/photos`,
    bytes: totalBytes,
    count: files.length,
    createdAt: now,
  });
  return composeJob(getCapture(id)!);
}

// Photo set → mesh via KIRI photogrammetry.
export async function createAndSubmit(name: string, files: UploadFile[]): Promise<Job> {
  return createReconCapture(name, files, "photo_3d", "source_photos");
}

// Walkthrough video (or photo set) → gaussian splat via KIRI 3DGS.
export async function createSplatScan(
  name: string,
  files: UploadFile[],
  source: "video" | "image",
): Promise<Job> {
  return createReconCapture(name, files, "splat_3dgs", source === "video" ? "source_video" : "source_photos");
}

async function createReconCapture(
  name: string,
  files: UploadFile[],
  kind: CaptureKind,
  sourceType: AssetRow["type"],
): Promise<Job> {
  const id = randomUUID();
  const now = Date.now();
  const totalBytes = files.reduce((s, f) => s + f.data.byteLength, 0);

  // Persist the source FIRST — a failed submission must never lose the upload.
  await savePhotos(
    id,
    files.map((f) => ({ name: f.name, data: f.data })),
  );

  insertCapture({
    id,
    name: name.trim() || (kind === "splat_3dgs" ? "Untitled capture" : "Untitled scan"),
    kind,
    createdAt: now,
    archivedAt: null,
  });
  insertAsset({
    id: randomUUID(),
    captureId: id,
    type: sourceType,
    status: "ready",
    path: `${id}/photos`,
    bytes: totalBytes,
    count: files.length,
    createdAt: now,
  });

  await submitAttempt(
    id,
    kind,
    files.map((f, i) => ({
      filename: f.name || `file-${i}`,
      data: f.data,
      contentType: f.type || "application/octet-stream",
    })),
    sourceType === "source_video" ? "video" : "image",
  );
  return composeJob(getCapture(id)!);
}

// One reconstruction attempt: insert a job row, hand the files to KIRI, record
// the outcome. Any failure lands on the job row — never a silent throw.
async function submitAttempt(
  captureId: string,
  kind: CaptureKind,
  files: KiriFile[],
  source: "video" | "image",
): Promise<JobRow> {
  const jobId = randomUUID();
  const attempts = countJobsForCapture(captureId) + 1;
  insertJob({
    id: jobId,
    captureId,
    outputAssetId: null,
    provider: "kiri",
    providerJobId: null,
    status: "uploading",
    attempts,
    errorCode: null,
    errorMsg: null,
    submittedAt: Date.now(),
    completedAt: null,
  });

  try {
    const serialize =
      kind === "splat_3dgs"
        ? await submit3dgs(files, { source })
        : await submitPhotoScan(files);
    updateJobRow(jobId, { providerJobId: serialize, status: "queued" });
  } catch (err) {
    const { code, msg } = errorInfo(err);
    logKiri({ direction: "error", method: "POST", url: `submitAttempt:${captureId}`, body: msg });
    updateJobRow(jobId, { status: "failed", errorCode: String(code), errorMsg: msg, completedAt: Date.now() });
  }
  return latestJobForCapture(captureId)!;
}

// Resubmit a failed capture using the source files already on disk. Costs a
// credit like any submission, but never a re-upload from the phone.
export async function resubmitJob(captureId: string): Promise<Job | null> {
  const capture = getCapture(captureId);
  if (!capture || capture.kind === "pano_360") return null;

  const latest = latestJobForCapture(captureId);
  if (latest && !isTerminal(latest.status)) return composeJob(capture); // already running

  const filenames = listSourceFilenames(captureId);
  const files: KiriFile[] = [];
  for (const name of filenames) {
    const data = readPhoto(captureId, name);
    if (data) files.push({ filename: name, data, contentType: contentTypeFor(name) });
  }
  if (files.length === 0) {
    logKiri({ direction: "error", method: "POST", url: `resubmit:${captureId}`, body: "no source files on disk" });
    return composeJob(capture);
  }

  const isVideo = files.some((f) => /\.(mp4|mov|webm|m4v)$/i.test(f.filename));
  await submitAttempt(captureId, capture.kind, files, isVideo ? "video" : "image");
  return composeJob(capture);
}

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

// ── Sync: poll KIRI and persist any change ──────────────────────────────────
// Idempotent; safe from both the UI poll and the server sweeper.

export async function syncJob(captureId: string): Promise<Job | null> {
  const capture = getCapture(captureId);
  if (!capture) return null;
  if (capture.kind === "pano_360") return composeJob(capture);

  const job = latestJobForCapture(captureId);
  if (!job || isTerminal(job.status) || !job.providerJobId) return composeJob(capture);

  try {
    const { status } = await getStatus(job.providerJobId);

    if (status === "succeeded") {
      if (!job.outputAssetId) {
        await downloadAndExtractModel(capture, job);
      }
      updateJobRow(job.id, { status: "succeeded", completedAt: job.completedAt ?? Date.now() });
    } else if (status === "failed") {
      updateJobRow(job.id, {
        status: "failed",
        errorCode: "reconstruction_failed",
        errorMsg:
          "KIRI could not reconstruct a model from this capture. This usually means too little overlap, motion blur, too few angles, or a reflective/featureless subject.",
        completedAt: Date.now(),
      });
    } else {
      updateJobRow(job.id, { status });
    }
  } catch (err) {
    const { code, msg } = errorInfo(err);
    logKiri({ direction: "error", method: "GET", url: `syncJob:${captureId}`, body: msg });
    // Transient poll errors don't kill the job — only hard auth/credit errors do.
    if (err instanceof KiriError && (err.httpStatus === 401 || err.httpStatus === 403)) {
      updateJobRow(job.id, { status: "failed", errorCode: String(code), errorMsg: msg, completedAt: Date.now() });
    }
  }
  return composeJob(capture);
}

// Sweep every in-flight job: used by the server-side sweeper so captures
// complete even with no browser tab open. Also fails-out jobs stuck in
// `uploading` (a server restart mid-submit leaves them stranded).
const STUCK_UPLOAD_MS = 10 * 60_000;

export async function sweepActiveJobs(): Promise<number> {
  const active = listActiveJobs();
  for (const job of active) {
    if (job.status === "uploading" && !job.providerJobId) {
      if (Date.now() - job.submittedAt > STUCK_UPLOAD_MS) {
        updateJobRow(job.id, {
          status: "failed",
          errorCode: "interrupted",
          errorMsg: "The upload was interrupted before it reached KIRI. Your files are safe — resubmit to try again.",
          completedAt: Date.now(),
        });
        logKiri({ direction: "error", method: "SWEEP", url: `job:${job.id}`, body: "stuck uploading — failed out" });
      }
      continue; // still uploading (or just failed out) — nothing to poll
    }
    await syncJob(job.captureId);
  }
  return active.length;
}

// ── Model download + extraction ─────────────────────────────────────────────

async function downloadAndExtractModel(capture: CaptureRow, job: JobRow): Promise<void> {
  const zipUrl = await getModelZipUrl(job.providerJobId!);
  logKiri({ direction: "request", method: "GET", url: "download-zip", meta: { zipUrl: zipUrl.slice(0, 80) } });
  const res = await fetch(zipUrl, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new KiriError(res.status, `Failed to download model zip (HTTP ${res.status}).`, res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const now = Date.now();

  // Always keep the raw zip (the Download button serves it).
  const zipPath = await saveModelBytes(capture.id, "model.zip", buf);
  insertAsset({
    id: randomUUID(),
    captureId: capture.id,
    type: "model_zip",
    status: "ready",
    path: zipPath,
    bytes: buf.byteLength,
    count: 1,
    createdAt: now,
  });

  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  // Splat jobs want the gaussian .ply; mesh jobs want the .glb.
  const pick =
    capture.kind === "splat_3dgs"
      ? (entries.find((e) => /\.(ply|splat|ksplat)$/i.test(e.entryName)) ??
        entries.find((e) => /\.glb$/i.test(e.entryName)))
      : (entries.find((e) => /\.glb$/i.test(e.entryName)) ??
        entries.find((e) => /\.gltf$/i.test(e.entryName)) ??
        entries.find((e) => /\.(obj|ply|stl)$/i.test(e.entryName)));
  if (!pick) return; // zip saved; viewer will explain there's nothing viewable

  const ext = pick.entryName.split(".").pop()!.toLowerCase();
  const data = pick.getData();
  const outPath = await saveModelBytes(capture.id, `model.${ext}`, data);
  const outId = randomUUID();
  insertAsset({
    id: outId,
    captureId: capture.id,
    type: ext === "glb" || ext === "gltf" || ext === "obj" || ext === "stl" ? "mesh_glb" : "splat_ply",
    status: "ready",
    path: outPath,
    bytes: data.byteLength,
    count: 1,
    createdAt: now,
  });
  updateJobRow(job.id, { outputAssetId: outId });
}

function errorInfo(err: unknown): { code: string | number; msg: string } {
  if (err instanceof KiriError) return { code: err.code, msg: err.message };
  if (err instanceof Error) return { code: "error", msg: err.message };
  return { code: "error", msg: String(err) };
}
