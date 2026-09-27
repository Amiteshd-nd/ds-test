import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';
import {
  brandFacts,
  contactLinks,
  FIELD_LOCATION,
  INTERVIEW_FIELDS,
  isUsable,
  profileBrief,
  type ProfileField,
} from '@/core/business/profile';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const profile = getStore().getProfile(id);
  return NextResponse.json({
    profile,
    brand: brandFacts(profile),
    links: contactLinks(profile),
    usable: isUsable(profile),
    brief: profileBrief(profile),
  });
}

/**
 * Save interview answers.
 *
 * The client sends flat field names because that is what the interview is made
 * of; `FIELD_LOCATION` decides which of them are columns and which live in one
 * of the two JSON blobs the PRD's schema gives us. Doing that mapping here
 * rather than in the UI means the shape of `brand_json` has exactly one
 * definition.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const store = getStore();
  const existing = store.getProfile(id);

  const brand = brandFacts(existing) as Record<string, string>;
  const links = contactLinks(existing) as Record<string, string>;
  const columns: Record<string, string> = {};

  for (const field of INTERVIEW_FIELDS as ProfileField[]) {
    const value = body[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    const where = FIELD_LOCATION[field];

    if (where === 'column') columns[field] = trimmed;
    else if (where === 'brand_json') setOrDelete(brand, field, trimmed);
    else setOrDelete(links, field, trimmed);
  }

  store.updateProfile(id, {
    ...columns,
    brand_json: JSON.stringify(brand),
    links_json: JSON.stringify(links),
  });

  const profile = store.getProfile(id);
  return NextResponse.json({ profile, usable: isUsable(profile), brief: profileBrief(profile) });
}

/** An emptied field is removed, not stored as "". */
function setOrDelete(target: Record<string, string>, key: string, value: string): void {
  if (value) target[key] = value;
  else delete target[key];
}
