/**
 * Resend, for cold email.
 *
 * **Status: written, not exercised.** No account has been authorised.
 *
 * Plain text, not HTML. A cold email that arrives as a rendered template looks
 * like a mailshot and is treated like one by both the recipient and the spam
 * filter. The two lines the law requires are appended by `renderEmail`, not
 * left to the draft.
 *
 * Before this is ever switched on: the sending domain needs SPF, DKIM and
 * DMARC. Sending cold email from a domain without them is the fastest way to
 * get the business's real mail marked as spam, which is a considerably worse
 * outcome than the campaign not running.
 */

import { renderEmail, type ColdEmail } from './actions.ts';
import type { EmailProvider, ExecutionToken, SendResult } from './gate.ts';

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly apiKey: string;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(action: ColdEmail, token: ExecutionToken): Promise<SendResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        // Resend deduplicates on this, so a retry after a timeout cannot send
        // the same email twice. The approval id is the natural key: one
        // approval is one send, by definition.
        'Idempotency-Key': token.approvalId,
      },
      body: JSON.stringify({
        from: this.from,
        to: [action.to],
        subject: action.subject,
        text: renderEmail(action),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { local: false, external_id: body.id ?? token.approvalId };
  }
}
