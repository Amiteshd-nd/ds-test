/// <reference lib="webworker" />
/**
 * The compression worker.
 *
 * Everything below `core/` runs here: parsing, encoding, scoring, rendering.
 * The main thread holds no PDF state at all, which is what keeps the page
 * responsive while a 200-page scan is being searched image by image — and it is
 * also the honest version of PRD §10's "workers are stateless": this one holds
 * finished job bytes only so the comparison viewer can ask for a page render
 * without shipping the whole file back and forth.
 */

import { analyseDocument, runJob, RefusalError } from "../core/pipeline";
import { openDocument, renderToDataUrl } from "../core/pdf/render";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

interface HeldJob {
  original: Uint8Array;
  primary: Uint8Array;
  alternative: Uint8Array | null;
}

const jobs = new Map<string, HeldJob>();

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.kind) {
      case "ping": {
        reply({ id: request.id, kind: "pong" });
        return;
      }
      case "analyse": {
        const inventory = await analyseDocument(new Uint8Array(request.bytes));
        reply({ id: request.id, kind: "analysed", inventory });
        return;
      }
      case "compress": {
        const input = new Uint8Array(request.bytes);
        const outcome = await runJob(input, request.options, (progress) => {
          reply({ id: request.id, kind: "progress", event: progress });
        });
        jobs.set(request.jobId, {
          original: input,
          primary: outcome.primary.bytes,
          alternative: outcome.alternative?.bytes ?? null,
        });
        const primaryBytes = copyOut(outcome.primary.bytes);
        const alternativeBytes = outcome.alternative ? copyOut(outcome.alternative.bytes) : null;
        reply(
          {
            id: request.id,
            kind: "compressed",
            outcome: {
              inventory: outcome.inventory,
              primary: { ...outcome.primary, bytes: primaryBytes },
              alternative: outcome.alternative ? { ...outcome.alternative, bytes: alternativeBytes! } : null,
              gate: outcome.gate,
            },
          },
          alternativeBytes ? [primaryBytes, alternativeBytes] : [primaryBytes],
        );
        return;
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
          reply({ id: request.id, kind: "preview", ...rendered });
        } finally {
          await doc.loadingTask.destroy();
        }
        return;
      }
      case "release": {
        jobs.delete(request.jobId);
        reply({ id: request.id, kind: "released" });
        return;
      }
    }
  } catch (error) {
    reply({
      id: request.id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof RefusalError ? error.code : null,
    });
  }
};

function reply(response: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

/** A detached copy, so transferring the buffer to the main thread does not
 *  empty the copy this worker keeps for previews. */
function copyOut(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
