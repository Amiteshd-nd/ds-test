// Shared types for blockmodel.

// Our own job lifecycle — deliberately decoupled from KIRI's numeric codes so
// the UI never has to know about them.
export type JobStatus =
  | "uploading" // sending photos to KIRI
  | "queued" // accepted, waiting in KIRI's queue
  | "processing" // reconstruction running
  | "succeeded" // model ready to download/view
  | "failed"; // reconstruction or upload failed

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  kiriSerialize: string | null;
  photoCount: number;
  totalBytes: number;
  createdAt: number; // epoch ms
  startedAt: number | null; // when we handed it to KIRI
  finishedAt: number | null; // when it reached a terminal state
  errorCode: string | null;
  errorMsg: string | null;
  modelPath: string | null; // relative path under storage/ to the extracted .glb
}

export const TERMINAL_STATUSES: JobStatus[] = ["succeeded", "failed"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// Plain-language label + one-line explanation for each stage.
export function stageLabel(status: JobStatus): { title: string; detail: string } {
  switch (status) {
    case "uploading":
      return { title: "Uploading photos", detail: "Sending your photo set to KIRI Engine." };
    case "queued":
      return { title: "Waiting in queue", detail: "KIRI has your photos and will start shortly." };
    case "processing":
      return {
        title: "Reconstructing model",
        detail: "Turning your photos into a 3D model. This usually takes 5–40 minutes.",
      };
    case "succeeded":
      return { title: "Done", detail: "Your model is ready to view." };
    case "failed":
      return { title: "Failed", detail: "Reconstruction didn't complete." };
  }
}
