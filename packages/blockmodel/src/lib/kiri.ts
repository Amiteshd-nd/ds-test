import { logKiri } from "./logger";
import type { JobStatus } from "./types";

// ── KIRI Engine API client ─────────────────────────────────────────────────
// Contract per KIRI's "KIRIENGINE API Instruction 1.2".
//   Base:   https://api.kiriengine.app/api
//   Auth:   Authorization: Bearer <key>
//   Submit: POST /v1/open/photo/image   (multipart, field `imagesFiles`)
//   Status: GET  /v1/open/model/getStatus?serialize=...
//   Model:  GET  /v1/open/model/getModelZip?serialize=...  -> temp zip url
//   Money:  GET  /v1/open/balance

const BASE_URL = (process.env.KIRI_BASE_URL || "https://api.kiriengine.app/api").replace(/\/$/, "");

function apiKey(): string {
  const key = process.env.KIRI_API_KEY;
  if (!key || key.startsWith("kiri-your-key")) {
    throw new KiriError(
      "no_api_key",
      "No KIRI_API_KEY set. Add your key to blockmodel/.env.local (see .env.example).",
      0,
    );
  }
  return key;
}

export class KiriError extends Error {
  constructor(
    public code: string | number,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = "KiriError";
  }
}

interface KiriEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  ok: boolean;
}

// KIRI's numeric status -> our lifecycle enum.
export function mapKiriStatus(status: number): JobStatus {
  switch (status) {
    case -1:
      return "uploading";
    case 3:
      return "queued";
    case 0:
      return "processing";
    case 2:
    case 4: // Exported — model is ready
      return "succeeded";
    case 1:
    default:
      return "failed";
  }
}

async function parseEnvelope<T>(res: Response, method: string, url: string): Promise<T> {
  const text = await res.text();
  let json: KiriEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as KiriEnvelope<T>) : null;
  } catch {
    /* non-JSON body (e.g. gateway error) */
  }

  logKiri({ direction: "response", method, url, status: res.status, body: json ?? text.slice(0, 500) });

  if (res.status === 401) {
    throw new KiriError(401, "KIRI rejected the API key (401). Check KIRI_API_KEY.", 401);
  }
  if (res.status === 403) {
    throw new KiriError(403, "Out of KIRI credits (403). Top up your KIRI account to run more scans.", 403);
  }
  if (!res.ok || !json || json.ok === false || json.code !== 0) {
    const code = json?.code ?? res.status;
    const msg = json?.msg || `KIRI request failed (HTTP ${res.status}).`;
    throw new KiriError(code, msg, res.status);
  }
  return json.data;
}

// Submit a photo set for photogrammetry (Photo Scan, calculateType 1).
// Returns KIRI's `serialize` — the task id we poll on.
export async function submitPhotoScan(
  files: { filename: string; data: Buffer; contentType: string }[],
  opts?: { fileFormat?: string; modelQuality?: number; textureQuality?: number; isMask?: number },
): Promise<string> {
  const url = `${BASE_URL}/v1/open/photo/image`;
  const fileFormat = opts?.fileFormat ?? "glb";
  const modelQuality = opts?.modelQuality ?? Number(process.env.KIRI_MODEL_QUALITY ?? 0);
  const textureQuality = opts?.textureQuality ?? Number(process.env.KIRI_TEXTURE_QUALITY ?? 0);
  const isMask = opts?.isMask ?? 0;
  const key = apiKey(); // resolve first — throws cleanly if no key, before we log anything

  const form = new FormData();
  for (const f of files) {
    form.append("imagesFiles", new Blob([new Uint8Array(f.data)], { type: f.contentType }), f.filename);
  }
  form.append("fileFormat", fileFormat);
  form.append("modelQuality", String(modelQuality));
  form.append("textureQuality", String(textureQuality));
  // Docs are inconsistent (isMask vs ifMask); send both to be safe.
  form.append("isMask", String(isMask));
  form.append("ifMask", String(isMask));
  form.append("textureSmoothing", "0");

  logKiri({
    direction: "request",
    method: "POST",
    url,
    meta: { photoCount: files.length, fileFormat, modelQuality, textureQuality, isMask },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await parseEnvelope<{ serialize: string; calculateType: number }>(res, "POST", url);
  return data.serialize;
}

// Poll a task's status. Returns both the raw code and our mapped lifecycle status.
export async function getStatus(serialize: string): Promise<{ raw: number; status: JobStatus }> {
  const url = `${BASE_URL}/v1/open/model/getStatus?serialize=${encodeURIComponent(serialize)}`;
  const key = apiKey();
  logKiri({ direction: "request", method: "GET", url });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await parseEnvelope<{ serialize: string; status: number }>(res, "GET", url);
  return { raw: data.status, status: mapKiriStatus(data.status) };
}

// Get a temporary download URL for the finished model zip (valid ~60 min).
export async function getModelZipUrl(serialize: string): Promise<string> {
  const url = `${BASE_URL}/v1/open/model/getModelZip?serialize=${encodeURIComponent(serialize)}`;
  const key = apiKey();
  logKiri({ direction: "request", method: "GET", url });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await parseEnvelope<{ modelUrl: string; serialize: string }>(res, "GET", url);
  return data.modelUrl;
}

// Remaining account credits (1 credit ≈ $1 ≈ 1 scan).
export async function getBalance(): Promise<number> {
  const url = `${BASE_URL}/v1/open/balance`;
  const key = apiKey();
  logKiri({ direction: "request", method: "GET", url });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await parseEnvelope<{ balance: number }>(res, "GET", url);
  return data.balance;
}
