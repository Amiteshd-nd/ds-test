import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { addAsset, listAssets } from '@/core/site/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ assets: await listAssets(id) });
}

/**
 * Upload a photograph.
 *
 * Multipart, because this is a file picker on a phone more often than anything
 * else. The description is required and the reason is in `addAsset`: it becomes
 * the alt text, and it is how the builder decides which slot the photograph
 * belongs in.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const alt = form?.get('alt');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file was sent' }, { status: 400 });
  }
  if (typeof alt !== 'string') {
    return NextResponse.json({ error: 'describe what the photograph shows' }, { status: 400 });
  }

  try {
    const asset = await addAsset(id, {
      filename: file.name,
      alt,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    // These messages are written to be read by the owner, not by a developer.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
