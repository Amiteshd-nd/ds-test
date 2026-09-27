import { NextResponse } from 'next/server';

import { activeProviders } from '@/core/providers/registry';

export const runtime = 'nodejs';

/**
 * Which implementations this process is actually running.
 *
 * The UI shows it in the footer for one reason: a scripted run and a real one
 * look identical on screen, and mistaking one for the other is how a demo
 * becomes a wrong decision.
 */
export async function GET() {
  return NextResponse.json({ providers: activeProviders() });
}
