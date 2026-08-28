import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR, jobModelDir, jobPhotosDir } from "./paths";

// ── Thin file-storage module ───────────────────────────────────────────────
// All photo/model bytes flow through here. To move to R2/S3 later, reimplement
// these functions (return object keys instead of paths) and nothing else moves.

export interface SavedPhoto {
  filename: string;
  bytes: number;
}

// Persist an uploaded photo set under storage/<jobId>/photos/.
export async function savePhotos(
  jobId: string,
  files: { name: string; data: Buffer }[],
): Promise<SavedPhoto[]> {
  const dir = jobPhotosDir(jobId);
  await fsp.mkdir(dir, { recursive: true });
  const saved: SavedPhoto[] = [];
  let i = 0;
  for (const file of files) {
    // Normalise filenames so a phone's odd names can't escape the dir.
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    const filename = `photo-${String(i).padStart(4, "0")}${ext}`;
    await fsp.writeFile(path.join(dir, filename), file.data);
    saved.push({ filename, bytes: file.data.byteLength });
    i++;
  }
  return saved;
}

export function listPhotoFilenames(jobId: string): string[] {
  const dir = jobPhotosDir(jobId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f))
    .sort();
}

export function readPhoto(jobId: string, filename: string): Buffer | null {
  // Guard against path traversal — only a bare filename is allowed.
  if (filename.includes("/") || filename.includes("..")) return null;
  const p = path.join(jobPhotosDir(jobId), filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export async function saveModelBytes(
  jobId: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const dir = jobModelDir(jobId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, filename), data);
  // Return a relative path (jobId/model/filename) so callers stay storage-agnostic.
  return path.join(jobId, "model", filename);
}

export function readModelFile(relativePath: string): Buffer | null {
  if (relativePath.includes("..")) return null;
  const p = path.join(STORAGE_DIR, relativePath);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
