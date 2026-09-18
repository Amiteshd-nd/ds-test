/**
 * Main-thread side of the worker boundary: one request/response channel with
 * progress events, and a same-thread fallback so the app still works where a
 * module worker cannot be constructed.
 */

import type { CompressOptions, Inventory, ProgressEvent } from "../core/types";
import type { SerialisedOutcome, WhichFile, WorkerRequest, WorkerResponse } from "./protocol";

/** Distributes over the union — a plain `Omit<WorkerRequest, "id">` collapses
 *  the variants into their common keys and loses `bytes`, `jobId` and friends. */
type UnsentRequest = WorkerRequest extends infer T ? (T extends { id: string } ? Omit<T, "id"> : never) : never;

/** Built by scripts/build-worker.mjs and served from /public. See that file for
 *  why this is not `new URL("./compress.worker.ts", import.meta.url)`. */
const WORKER_URL = "/compress-worker.js";
const HANDSHAKE_TIMEOUT_MS = 8000;

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
};

/** Resolves when the worker answers, rejects if it never loads. */
function ping(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The compression worker did not start."));
    }, HANDSHAKE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data?.kind !== "pong") return;
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The compression worker failed to load."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id: "handshake", kind: "ping" });
  });
}

export class CompressorError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "CompressorError";
  }
}

export class CompressorClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, Pending>();
  private sequence = 0;
  /** Set when worker construction failed and we fell back to the main thread. */
  private fallback: typeof import("./fallback") | null = null;

  private async ensureWorker(): Promise<Worker | null> {
    if (this.worker) return this.worker;
    if (this.fallback) return null;
    try {
      const worker = new Worker(WORKER_URL, { type: "module" });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data);
      worker.onerror = (event) => this.failAll(new Error(event.message || "The compression worker crashed."));
      // Handshake before trusting it. A worker that fails to load does not throw
      // here — it fires an error event later — and the difference between "slow"
      // and "never started" is one the user would otherwise discover as a page
      // that hangs on its first file.
      await ping(worker);
      this.worker = worker;
      return worker;
    } catch {
      // Not fatal: the same pipeline runs on the main thread, it just blocks it.
      this.fallback = await import("./fallback");
      return null;
    }
  }

  private receive(response: WorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.kind === "progress") {
      pending.onProgress?.(response.event);
      return;
    }
    this.pending.delete(response.id);
    if (response.kind === "error") {
      pending.reject(new CompressorError(response.message, response.code));
      return;
    }
    pending.resolve(response);
  }

  private failAll(error: Error): void {
    for (const [, pending] of this.pending) pending.reject(error);
    this.pending.clear();
  }

  private async send(
    request: UnsentRequest,
    onProgress?: (event: ProgressEvent) => void,
    transfer: Transferable[] = [],
  ): Promise<WorkerResponse> {
    const id = `r${(this.sequence += 1)}`;
    const worker = await this.ensureWorker();
    if (!worker) {
      return this.fallback!.handle({ ...request, id } as WorkerRequest, onProgress);
    }
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      worker.postMessage({ ...request, id }, transfer);
    });
  }

  async analyse(file: ArrayBuffer): Promise<Inventory> {
    const response = await this.send({ kind: "analyse", bytes: file });
    if (response.kind !== "analysed") throw new Error("Unexpected response to analyse.");
    return response.inventory;
  }

  async compress(
    jobId: string,
    file: ArrayBuffer,
    options: CompressOptions,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<SerialisedOutcome> {
    const response = await this.send({ kind: "compress", jobId, bytes: file, options }, onProgress);
    if (response.kind !== "compressed") throw new Error("Unexpected response to compress.");
    return response.outcome;
  }

  async preview(
    jobId: string,
    which: WhichFile,
    page: number,
    dpi: number,
  ): Promise<{ url: string; width: number; height: number }> {
    const response = await this.send({ kind: "preview", jobId, which, page, dpi });
    if (response.kind !== "preview") throw new Error("Unexpected response to preview.");
    return { url: response.url, width: response.width, height: response.height };
  }

  async release(jobId: string): Promise<void> {
    await this.send({ kind: "release", jobId });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
