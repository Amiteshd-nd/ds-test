import { NextResponse } from "next/server";
import { resubmitJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/jobs/:id/retry — resubmit a failed capture to KIRI, reusing the
// source files already on disk (no re-upload from the device). Costs a credit.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await resubmitJob(id);
  if (!job) return NextResponse.json({ error: "Capture not found or not retryable." }, { status: 404 });
  return NextResponse.json({ job });
}
