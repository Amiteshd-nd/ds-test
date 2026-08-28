import { getJob } from "@/lib/jobs";
import { readModelFile } from "@/lib/storage";
import path from "node:path";

export const runtime = "nodejs";

// GET /api/jobs/:id/download — serves the full KIRI model zip as an attachment.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job?.modelPath) return new Response("No model for this job.", { status: 404 });

  // model.zip lives alongside the extracted file in storage/<id>/model/.
  const zipRel = path.join(id, "model", "model.zip");
  const bytes = readModelFile(zipRel);
  if (!bytes) return new Response("Model zip missing on disk.", { status: 404 });

  const safeName = job.name.replace(/[^a-z0-9-_]+/gi, "_") || "model";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
