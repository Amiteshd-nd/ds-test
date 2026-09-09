import { logKiri } from "./logger";
import type { JobStatus } from "./types";

// ── KIRI Engine API client ─────────────────────────────────────────────────
// Contract per KIRI's "KIRIENGINE API Instruction 1.2".
//   Base:   https://api.kiriengine.app/api
//   Auth:   Authorization: Bearer <key>
//   Submit: POST /v1/open/photo/image        (photogrammetry, field `imagesFiles`)
//           POST /v1/open/3dgs/{video,image} (gaussian splatting)
//   Status: GET  /v1/open/model/getStatus?serialize=...
//   Model:  GET  /v1/open/model/getModelZip?serialize=...  -> temp zip url
//   Money:  GET  /v1/open/balance
//
// Hardening: every request carries a timeout; GETs retry once on transient
// network failure; uploads never auto-retry (each submission costs credits).

const BASE_URL = (process.env.KIRI_BASE_URL || "https://api.kiriengine.app/api").replace(/\/$/, "");
const GET_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000; // photo sets / videos can be hundreds of MB

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

// Authenticated GET with timeout + one retry on transient network failure.
// (HTTP-level errors are NOT retried — parseEnvelope turns them into KiriErrors.)
async function kiriGet<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const key = apiKey();
  logKiri({ direction: "request", method: "GET", url });

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(GET_TIMEOUT_MS),
      });
      return await parseEnvelope<T>(res, "GET", url);
    } catch (err) {
      const transient = !(err instanceof KiriError); // network / timeout / abort
      if (transient && attempt === 0) {
        logKiri({ direction: "error", method: "GET", url, body: `transient failure, retrying: ${String(err)}` });
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

// Authenticated multipart POST (an upload). Long timeout, never auto-retried.
async function kiriUpload<T>(path: string, form: FormData, meta: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const key = apiKey();
  logKiri({ direction: "request", method: "POST", url, meta });
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  return parseEnvelope<T>(res, "POST", url);
}

type SubmitResponse = { serialize: string; calculateType: number };

export interface KiriFile {
  filename: string;
  data: Buffer;
  contentType: string;
}

function appendFile(form: FormData, field: string, f: KiriFile) {
  form.append(field, new Blob([new Uint8Array(f.data)], { type: f.contentType }), f.filename);
}

// Submit a photo set for photogrammetry (Photo Scan, calculateType 1).
export async function submitPhotoScan(
  files: KiriFile[],
  opts?: { fileFormat?: string; modelQuality?: number; textureQuality?: number; isMask?: number },
): Promise<string> {
  const fileFormat = opts?.fileFormat ?? "glb";
  const modelQuality = opts?.modelQuality ?? Number(process.env.KIRI_MODEL_QUALITY ?? 0);
  const textureQuality = opts?.textureQuality ?? Number(process.env.KIRI_TEXTURE_QUALITY ?? 0);
  const isMask = opts?.isMask ?? 0;

  const form = new FormData();
  for (const f of files) appendFile(form, "imagesFiles", f);
  form.append("fileFormat", fileFormat);
  form.append("modelQuality", String(modelQuality));
  form.append("textureQuality", String(textureQuality));
  // Docs are inconsistent (isMask vs ifMask); send both to be safe.
  form.append("isMask", String(isMask));
  form.append("ifMask", String(isMask));
  form.append("textureSmoothing", "0");

  const data = await kiriUpload<SubmitResponse>("/v1/open/photo/image", form, {
    photoCount: files.length,
    fileFormat,
    modelQuality,
    textureQuality,
  });
  return data.serialize;
}

// Submit for 3D Gaussian Splatting (calculateType 3): a video (≤1920×1080,
// ≤3 min) or a photo set. Output is a gaussian-splat .ply.
export async function submit3dgs(files: KiriFile[], opts: { source: "video" | "image" }): Promise<string> {
  const isVideo = opts.source === "video";
  const form = new FormData();
  if (isVideo) appendFile(form, "videoFile", files[0]);
  else for (const f of files) appendFile(form, "imagesFiles", f);
  form.append("isMesh", "0"); // splat only, no mesh conversion
  form.append("isMask", "0");

  const data = await kiriUpload<SubmitResponse>(`/v1/open/3dgs/${isVideo ? "video" : "image"}`, form, {
    source: opts.source,
    files: files.length,
  });
  return data.serialize;
}

// Poll a task's status. Returns both the raw code and our mapped lifecycle status.
export async function getStatus(serialize: string): Promise<{ raw: number; status: JobStatus }> {
  const data = await kiriGet<{ serialize: string; status: number }>(
    `/v1/open/model/getStatus?serialize=${encodeURIComponent(serialize)}`,
  );
  return { raw: data.status, status: mapKiriStatus(data.status) };
}

// Get a temporary download URL for the finished model zip (valid ~60 min).
export async function getModelZipUrl(serialize: string): Promise<string> {
  const data = await kiriGet<{ modelUrl: string; serialize: string }>(
    `/v1/open/model/getModelZip?serialize=${encodeURIComponent(serialize)}`,
  );
  return data.modelUrl;
}

// Remaining account credits (1 credit ≈ $1 ≈ 1 scan). Cached briefly so the
// home page doesn't hit KIRI on every load.
let balanceCache: { value: number; at: number } | null = null;
const BALANCE_TTL_MS = 60_000;

export async function getBalance(): Promise<number> {
  if (balanceCache && Date.now() - balanceCache.at < BALANCE_TTL_MS) return balanceCache.value;
  const data = await kiriGet<{ balance: number }>("/v1/open/balance");
  balanceCache = { value: data.balance, at: Date.now() };
  return data.balance;
}
