'use server';

import { headers } from 'next/headers';

import { sendConfirmation } from '@/lib/mailer';
import { takeToken } from '@/lib/rate-limit';
import { HONEYPOT_FIELD } from '@/lib/honeypot';
import { signupSchema } from '@/lib/schema';
import { addToWaitlist } from '@/lib/waitlist';

export type SignupState =
  | { status: 'idle'; email: string }
  | { status: 'ok'; email: string }
  | { status: 'error'; email: string; reason: 'invalid' | 'failed' };

export async function joinWaitlist(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = String(formData.get('email') ?? '');

  // A bot filled the field no person can see. Tell it everything went fine.
  if (String(formData.get(HONEYPOT_FIELD) ?? '') !== '') return { status: 'ok', email: raw };

  const parsed = signupSchema.safeParse({ email: raw });
  if (!parsed.success) return { status: 'error', email: raw, reason: 'invalid' };
  const { email } = parsed.data;

  if (!takeToken(await clientKey())) return { status: 'error', email: raw, reason: 'failed' };

  try {
    await addToWaitlist(email);
    await sendConfirmation(email);
  } catch (err) {
    console.error('[joinWaitlist]', err);
    return { status: 'error', email: raw, reason: 'failed' };
  }
  return { status: 'ok', email: raw };
}

async function clientKey(): Promise<string> {
  const h = await headers();
  // On Vercel the platform sets x-forwarded-for and the first entry is the client.
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
