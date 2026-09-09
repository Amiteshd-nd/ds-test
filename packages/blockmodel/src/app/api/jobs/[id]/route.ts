import { NextResponse } from "next/server";
import { archiveCapture, getJob, syncJob } from "@/lib/jobs";
import { listPhotoFilenames } from "@/lib/storage";

export const runtime = "nodejs";

// GET /api/jobs/:id — returns the job, after polling KIRI for the latest status.
// The client polls this every ~10s while a scan is in flight.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // syncJob polls KIRI and persists any change; falls back to the stored job.
  const job = (await syncJob(id)) ?? getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json({
    job,
    photos: listPhotoFilenames(id),
    hasModel: Boolean(job.modelPath && /\.(glb|gltf)$/i.test(job.modelPath)),
  });
}

// DELETE /api/jobs/:id — archive a capture (soft delete: files and rows stay;
// it just leaves the list). This is a records product — nothing is hard-deleted.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!archiveCapture(id)) return NextResponse.json({ error: "Capture not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
