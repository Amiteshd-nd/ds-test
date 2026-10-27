import 'server-only';

import { Resend } from 'resend';

import { env } from './env';

let client: Resend | undefined;

/** One client per server instance, created on first use. */
export function getResend(): Resend {
  if (!env.resendApiKey) throw new Error('RESEND_API_KEY is not set');
  client ??= new Resend(env.resendApiKey);
  return client;
}
