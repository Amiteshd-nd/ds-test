import { NextResponse } from "next/server";
import { createAndSubmit, createPano, createSplatScan, listJobs } from "@/lib/jobs";
import type { CaptureKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300; // uploads of large photo sets can take a while

// GET /api/jobs — list all jobs (newest first) for the home screen.
export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

// POST /api/jobs — multipart form: `name` + repeated `photos` files.
// Saves photos, submits to KIRI, returns the created job.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const name = (form.get("name") as string | null) ?? "";
  const rawKind = form.get("kind");
  const kind: CaptureKind =
    rawKind === "pano_360" ? "pano_360" : rawKind === "splat_3dgs" ? "splat_3dgs" : "photo_3d";
  const source = form.get("source") === "video" ? "video" : "image";
  const fileEntries = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  if (kind === "splat_3dgs" && source === "video") {
    // A single walkthrough video, straight to KIRI 3DGS.
    if (fileEntries.length !== 1 || !fileEntries[0].type.startsWith("video/")) {
      return NextResponse.json({ error: "Upload a single walkthrough video." }, { status: 400 });
    }
  } else {
    // Photo-based modes: all images. KIRI needs 20–300 for reconstruction.
    if (!fileEntries.every((f) => f.type.startsWith("image/"))) {
      return NextResponse.json({ error: "All uploads must be images." }, { status: 400 });
    }
    if (kind !== "pano_360") {
      if (fileEntries.length < 20) {
        return NextResponse.json(
          { error: `KIRI needs at least 20 photos to reconstruct. You sent ${fileEntries.length}.` },
          { status: 400 },
        );
      }
      if (fileEntries.length > 300) {
        return NextResponse.json(
          { error: `KIRI accepts at most 300 photos. You sent ${fileEntries.length}.` },
          { status: 400 },
        );
      }
    }
  }

  const files = await Promise.all(
    fileEntries.map(async (f) => ({
      name: f.name,
      type: f.type,
      data: Buffer.from(await f.arrayBuffer()),
    })),
  );

  const job =
    kind === "pano_360"
      ? await createPano(name, files)
      : kind === "splat_3dgs"
        ? await createSplatScan(name, files, source)
        : await createAndSubmit(name, files);
  return NextResponse.json({ job }, { status: 201 });
}
