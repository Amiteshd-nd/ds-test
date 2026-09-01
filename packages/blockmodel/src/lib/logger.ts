import fs from "node:fs";
import path from "node:path";
import { KIRI_LOG_PATH, LOGS_DIR } from "./paths";

// Dead-simple append-only logger. One JSON object per line so the file is both
// human-scannable and grep/jq-able when a scan misbehaves.
function append(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(KIRI_LOG_PATH, line);
  } catch (err) {
    // Never let logging break a request.
    console.error("[logger] failed to write", err);
  }
}

export interface KiriLogEntry {
  direction: "request" | "response" | "error";
  method: string;
  url: string;
  status?: number;
  // Small, safe metadata only — never the raw image bytes.
  meta?: Record<string, unknown>;
  body?: unknown;
}

export function logKiri(entry: KiriLogEntry) {
  append({ source: "kiri", ...entry });
  // Mirror to the dev console too, so `npm run dev` shows it live.
  const tag = `[kiri:${entry.direction}] ${entry.method} ${entry.url}`;
  if (entry.direction === "error") console.error(tag, entry.body ?? entry.meta ?? "");
  else console.log(tag, entry.status ?? "");
}

export function logPath() {
  return path.relative(process.cwd(), KIRI_LOG_PATH);
}
