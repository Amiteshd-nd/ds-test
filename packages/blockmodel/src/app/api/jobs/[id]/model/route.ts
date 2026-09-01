import { getJob } from "@/lib/jobs";
import { readModelFile } from "@/lib/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "text/plain",
  ply: "application/octet-stream",
  stl: "application/octet-stream",
};

// GET /api/jobs/:id/model — serves the extracted model file for the 3D viewer.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job?.modelPath) return new Response("No model for this job.", { status: 404 });

  const bytes = readModelFile(job.modelPath);
  if (!bytes) return new Response("Model file missing on disk.", { status: 404 });

  const ext = job.modelPath.split(".").pop()!.toLowerCase();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
