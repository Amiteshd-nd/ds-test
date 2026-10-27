/**
 * Server-only configuration. Never import this from a client component: the
 * values would not be there anyway (no NEXT_PUBLIC_ prefix), and the import
 * would be a sign that a key is about to travel somewhere it should not.
 */
import 'server-only';

export const env = {
  resendApiKey: process.env.RESEND_API_KEY || undefined,
  audienceId: process.env.RESEND_AUDIENCE_ID || undefined,
  emailFrom: process.env.EMAIL_FROM || undefined,
};

/** True when Resend is not configured and we are not in production. */
export const isDryRun = !env.resendApiKey && process.env.NODE_ENV !== 'production';
