/**
 * The waitlist store. Everything else talks to `addToWaitlist` and nothing else,
 * so moving to Postgres or Supabase later means rewriting this file only.
 *
 * Backed by Resend contacts. Resend renamed Audiences to Segments in late 2025 and
 * kept the IDs, so RESEND_AUDIENCE_ID is passed as a segment ID.
 */
import 'server-only';

import { env, isDryRun } from './env';
import { getResend } from './resend';

/**
 * Adds an email to the waitlist. Idempotent: an address already on the list is
 * not an error. Throws on anything else, and the caller turns that into a
 * generic message so nobody can probe who has signed up.
 */
export async function addToWaitlist(email: string): Promise<void> {
  if (isDryRun) {
    console.info(`[waitlist] dry run (no RESEND_API_KEY): would add ${email}`);
    return;
  }
  if (!env.audienceId) throw new Error('RESEND_AUDIENCE_ID is not set');

  const resend = getResend();
  const created = await resend.contacts.create({
    email,
    unsubscribed: false,
    segments: [{ id: env.audienceId }],
  });
  if (!created.error) return;

  // Contacts are global in Resend now. An existing contact makes `create` fail,
  // so attach the one we have to the segment instead. Adding a contact that is
  // already in the segment is itself harmless.
  if (!/already exists/i.test(created.error.message)) {
    throw new Error(`Resend contacts.create: ${created.error.name}: ${created.error.message}`);
  }
  const added = await resend.contacts.segments.add({ email, segmentId: env.audienceId });
  if (added.error && !/already/i.test(added.error.message)) {
    throw new Error(`Resend contacts.segments.add: ${added.error.name}: ${added.error.message}`);
  }
}
