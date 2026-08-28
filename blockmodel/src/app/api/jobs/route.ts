import { NextResponse } from "next/server";
import { createAndSubmit, listJobs } from "@/lib/jobs";

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
  const fileEntries = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No photos uploaded." }, { status: 400 });
  }
  // KIRI hard minimum. The client blocks this too, but never trust the client.
  if (fileEntries.length < 20) {
    return NextResponse.json(
      { error: `KIRI needs at least 20 photos to reconstruct a model. You sent ${fileEntries.length}.` },
      { status: 400 },
    );
  }
  if (fileEntries.length > 300) {
    return NextResponse.json(
      { error: `KIRI accepts at most 300 photos. You sent ${fileEntries.length}.` },
      { status: 400 },
    );
  }

  const files = await Promise.all(
    fileEntries.map(async (f) => ({
      name: f.name,
      type: f.type,
      data: Buffer.from(await f.arrayBuffer()),
    })),
  );

  const job = await createAndSubmit(name, files);
  return NextResponse.json({ job }, { status: 201 });
}
