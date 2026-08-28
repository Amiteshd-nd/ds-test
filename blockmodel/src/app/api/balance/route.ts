import { NextResponse } from "next/server";
import { getBalance, KiriError } from "@/lib/kiri";

export const runtime = "nodejs";

// GET /api/balance — remaining KIRI credits (1 credit ≈ $1 ≈ one scan).
export async function GET() {
  try {
    const balance = await getBalance();
    return NextResponse.json({ balance });
  } catch (err) {
    // KiriError carries the right HTTP status; httpStatus 0 = local config error (no key).
    const status = err instanceof KiriError ? err.httpStatus || 400 : 500;
    const message = err instanceof Error ? err.message : "Could not fetch balance.";
    return NextResponse.json({ error: message }, { status });
  }
}
