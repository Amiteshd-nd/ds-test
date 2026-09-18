/** The worker boundary. Kept in its own module so both sides share one type. */

import type { CompressOptions, Inventory, JobOutcome, ProgressEvent } from "../core/types";

export type WhichFile = "original" | "primary" | "alternative";

export type WorkerRequest =
  | { id: string; kind: "ping" }
  | { id: string; kind: "analyse"; bytes: ArrayBuffer }
  | { id: string; kind: "compress"; jobId: string; bytes: ArrayBuffer; options: CompressOptions }
  | { id: string; kind: "preview"; jobId: string; which: WhichFile; page: number; dpi: number }
  | { id: string; kind: "release"; jobId: string };

export type WorkerResponse =
  | { id: string; kind: "pong" }
  | { id: string; kind: "progress"; event: ProgressEvent }
  | { id: string; kind: "analysed"; inventory: Inventory }
  | { id: string; kind: "compressed"; outcome: SerialisedOutcome }
  | { id: string; kind: "preview"; url: string; width: number; height: number }
  | { id: string; kind: "released" }
  | { id: string; kind: "error"; message: string; code: string | null };

/**
 * The outcome minus the file bytes for the alternative, which the UI never
 * needs until the user picks it — and plus a blob-ready copy of whichever file
 * is currently selected. Keeping both full files in the main thread doubles
 * memory on exactly the large documents where that hurts.
 */
export type ResultView = Omit<JobOutcome["primary"], "bytes"> & { bytes: ArrayBuffer };

export interface SerialisedOutcome {
  inventory: Inventory;
  primary: ResultView;
  alternative: ResultView | null;
  gate: JobOutcome["gate"];
}
