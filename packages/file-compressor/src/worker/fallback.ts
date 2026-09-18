/**
 * The same handlers as the worker, running on the main thread.
 *
 * Only reached when `new Worker(...)` throws — a hardened browser, an unusual
 * embedding. The page freezes during a job, which is bad, but it is much better
 * than a tool that refuses to run at all, and the failure is loud enough in the
 * UI that nobody mistakes it for normal.
 */

import { analyseDocument, runJob, RefusalError } from "../core/pipeline";
import { openDocument, renderToDataUrl } from "../core/pdf/render";
import type { ProgressEvent } from "../core/types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const jobs = new Map<string, { original: Uint8Array; primary: Uint8Array; alternative: Uint8Array | null }>();

export async function handle(
  request: WorkerRequest,
  onProgress?: (event: ProgressEvent) => void,
): Promise<WorkerResponse> {
  try {
    switch (request.kind) {
      case "ping":
        return { id: request.id, kind: "pong" };
      case "analyse":
        return { id: request.id, kind: "analysed", inventory: await analyseDocument(new Uint8Array(request.bytes)) };
      case "compress": {
        const input = new Uint8Array(request.bytes);
        const outcome = await runJob(input, request.options, (event) => onProgress?.(event));
        jobs.set(request.jobId, {
          original: input,
          primary: outcome.primary.bytes,
          alternative: outcome.alternative?.bytes ?? null,
        });
        return {
          id: request.id,
          kind: "compressed",
          outcome: {
            inventory: outcome.inventory,
            primary: { ...outcome.primary, bytes: toBuffer(outcome.primary.bytes) },
            alternative: outcome.alternative
              ? { ...outcome.alternative, bytes: toBuffer(outcome.alternative.bytes) }
              : null,
            gate: outcome.gate,
          },
        };
      }
      case "preview": {
        const job = jobs.get(request.jobId);
        if (!job) throw new Error("That job is no longer held in memory. Re-run the compression to compare pages.");
        const bytes =
          request.which === "original" ? job.original : request.which === "primary" ? job.primary : job.alternative;
        if (!bytes) throw new Error("There is no alternative file for this job.");
        const doc = await openDocument(bytes);
        try {
          const rendered = await renderToDataUrl(doc, request.page + 1, request.dpi);
          return { id: request.id, kind: "preview", ...rendered };
        } finally {
          await doc.loadingTask.destroy();
        }
      }
      case "release":
        jobs.delete(request.jobId);
        return { id: request.id, kind: "released" };
    }
  } catch (error) {
    return {
      id: request.id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof RefusalError ? error.code : null,
    };
  }
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
