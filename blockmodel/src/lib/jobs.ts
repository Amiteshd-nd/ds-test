import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { createJob, getJob, listJobs, updateJob } from "./db";
import { logKiri } from "./logger";
import { getModelZipUrl, getStatus, KiriError, submitPhotoScan } from "./kiri";
import { savePhotos } from "./storage";
import { saveModelBytes } from "./storage";
import { isTerminal, type Job } from "./types";

export { getJob, listJobs };

// Create a job, save its photos, and hand it to KIRI. Any failure leaves a
// `failed` job behind (never a silent throw) so the UI always has something to show.
export async function createAndSubmit(
  name: string,
  files: { name: string; type: string; data: Buffer }[],
): Promise<Job> {
  const id = randomUUID();
  const now = Date.now();
  const totalBytes = files.reduce((s, f) => s + f.data.byteLength, 0);

  const job: Job = {
    id,
    name: name.trim() || "Untitled scan",
    status: "uploading",
    kiriSerialize: null,
    photoCount: files.length,
    totalBytes,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    errorMsg: null,
    modelPath: null,
  };
  createJob(job);

  try {
    await savePhotos(
      id,
      files.map((f) => ({ name: f.name, data: f.data })),
    );
    const serialize = await submitPhotoScan(
      files.map((f, i) => ({
        filename: f.name || `photo-${i}.jpg`,
        data: f.data,
        contentType: f.type || "image/jpeg",
      })),
    );
    return (
      updateJob(id, { kiriSerialize: serialize, status: "queued", startedAt: Date.now() }) ?? job
    );
  } catch (err) {
    const { code, msg } = errorInfo(err);
    logKiri({ direction: "error", method: "POST", url: "createAndSubmit", body: msg });
    return (
      updateJob(id, {
        status: "failed",
        errorCode: String(code),
        errorMsg: msg,
        finishedAt: Date.now(),
      }) ?? job
    );
  }
}

// Poll KIRI for a job's current state and persist any change. Idempotent and
// safe to call on every UI poll. Downloads + extracts the model exactly once.
export async function syncJob(id: string): Promise<Job | null> {
  const job = getJob(id);
  if (!job) return null;
  if (isTerminal(job.status)) return job;
  if (!job.kiriSerialize) return job; // still uploading / never submitted

  try {
    const { status } = await getStatus(job.kiriSerialize);

    if (status === "succeeded") {
      // Only fetch the model once.
      if (!job.modelPath) {
        const modelPath = await downloadAndExtractModel(job);
        return updateJob(id, { status: "succeeded", modelPath, finishedAt: Date.now() });
      }
      return updateJob(id, { status: "succeeded" });
    }

    if (status === "failed") {
      return updateJob(id, {
        status: "failed",
        errorCode: "reconstruction_failed",
        errorMsg:
          "KIRI could not reconstruct a model from these photos. This usually means too little overlap, motion blur, too few angles, or a reflective/featureless subject.",
        finishedAt: Date.now(),
      });
    }

    // Still in flight (uploading / queued / processing).
    return updateJob(id, { status });
  } catch (err) {
    const { code, msg } = errorInfo(err);
    logKiri({ direction: "error", method: "GET", url: "syncJob", body: msg });
    // A transient poll error shouldn't kill the job — only a hard credit/auth
    // error is worth surfacing as terminal.
    if (err instanceof KiriError && (err.httpStatus === 401 || err.httpStatus === 403)) {
      return updateJob(id, {
        status: "failed",
        errorCode: String(code),
        errorMsg: msg,
        finishedAt: Date.now(),
      });
    }
    return job;
  }
}

async function downloadAndExtractModel(job: Job): Promise<string> {
  const zipUrl = await getModelZipUrl(job.kiriSerialize!);
  logKiri({ direction: "request", method: "GET", url: "download-zip", meta: { zipUrl: zipUrl.slice(0, 80) } });
  const res = await fetch(zipUrl);
  if (!res.ok) throw new KiriError(res.status, `Failed to download model zip (HTTP ${res.status}).`, res.status);
  const buf = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  // Prefer a .glb, then .gltf, then fall back to the first mesh file.
  const pick =
    entries.find((e) => /\.glb$/i.test(e.entryName)) ??
    entries.find((e) => /\.gltf$/i.test(e.entryName)) ??
    entries.find((e) => /\.(obj|ply|stl)$/i.test(e.entryName));

  // Always keep the raw zip too, so the viewer's Download button has the full asset.
  await saveModelBytes(job.id, "model.zip", buf);

  if (!pick) {
    // Nothing viewable, but the zip is saved. Record so the viewer can explain.
    return saveModelBytes(job.id, "model.zip", buf);
  }
  const ext = pick.entryName.split(".").pop()!.toLowerCase();
  return saveModelBytes(job.id, `model.${ext}`, pick.getData());
}

function errorInfo(err: unknown): { code: string | number; msg: string } {
  if (err instanceof KiriError) return { code: err.code, msg: err.message };
  if (err instanceof Error) return { code: "error", msg: err.message };
  return { code: "error", msg: String(err) };
}
