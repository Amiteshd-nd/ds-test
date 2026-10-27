import 'server-only';

import { render } from '@react-email/render';

import ConfirmationEmail from '../../emails/confirmation';
import { content } from '../content';
import { env, isDryRun } from './env';
import { getResend } from './resend';
import { siteUrl } from './site';

export async function sendConfirmation(email: string): Promise<void> {
  const element = <ConfirmationEmail siteUrl={siteUrl.origin} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  if (isDryRun) {
    console.info(`[mailer] dry run (no RESEND_API_KEY): would send "${content.email.subject}" to ${email}`);
    return;
  }
  if (!env.emailFrom) throw new Error('EMAIL_FROM is not set');

  const { error } = await getResend().emails.send(
    {
      from: env.emailFrom,
      to: email,
      subject: content.email.subject,
      html,
      text,
      replyTo: content.contactEmail,
    },
    // Resend drops a repeat of the same key for 24 hours, so a double submit or a
    // retry after a half-failed signup cannot put two copies in someone's inbox.
    { idempotencyKey: `waitlist-confirmation/${email}` },
  );
  if (error) throw new Error(`Resend emails.send: ${error.name}: ${error.message}`);
}
