import path from "node:path";

// Central place for all on-disk locations, relative to the project root
// (process.cwd() is the blockmodel/ dir when running `npm run dev`).
export const ROOT = process.cwd();
export const STORAGE_DIR = path.join(ROOT, "storage");
export const DATA_DIR = path.join(ROOT, "data");
export const LOGS_DIR = path.join(ROOT, "logs");
export const DB_PATH = path.join(DATA_DIR, "blockmodel.db");
export const KIRI_LOG_PATH = path.join(LOGS_DIR, "kiri.log");

export function jobDir(jobId: string): string {
  return path.join(STORAGE_DIR, jobId);
}
export function jobPhotosDir(jobId: string): string {
  return path.join(jobDir(jobId), "photos");
}
export function jobModelDir(jobId: string): string {
  return path.join(jobDir(jobId), "model");
}
