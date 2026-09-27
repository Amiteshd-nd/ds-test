/**
 * The local outbox: what would have been sent, written to disk.
 *
 * Nothing here reaches the internet. It exists so the entire gate - draft,
 * queue, approve, schedule, fire, record - is exercisable end to end without a
 * Postiz instance, a Meta app review, or a domain with SPF set up.
 *
 * It is not a simulation of success. It records the exact bytes that would have
 * gone out, including the two lines the law requires on an email, and returns
 * `local: true` so that every surface showing the result can say so. A "sent"
 * badge on something that never left the machine would be the worst possible
 * outcome of this phase.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { renderEmail, renderPost, type ColdEmail, type SocialPost } from './actions.ts';
import type { EmailProvider, ExecutionToken, PublishProvider, SendResult } from './gate.ts';

export function outboxFile(): string {
  return path.join(process.cwd(), '.runner', 'outbox.jsonl');
}

interface OutboxEntry {
  at: string;
  approval_id: string;
  kind: string;
  /** Exactly what would have gone out. */
  rendered: string;
  meta: Record<string, unknown>;
}

async function record(entry: OutboxEntry): Promise<void> {
  await mkdir(path.dirname(outboxFile()), { recursive: true });
  await appendFile(outboxFile(), `${JSON.stringify(entry)}\n`, 'utf8');
}

export class OutboxPublishProvider implements PublishProvider {
  readonly name = 'outbox';

  async publish(action: SocialPost, token: ExecutionToken): Promise<SendResult> {
    await record({
      at: new Date().toISOString(),
      approval_id: token.approvalId,
      kind: `social_post:${action.platform}`,
      rendered: renderPost(action),
      meta: { platform: action.platform, link: action.link ?? null },
    });
    return { local: true, external_id: `outbox:${token.approvalId}` };
  }
}

export class OutboxEmailProvider implements EmailProvider {
  readonly name = 'outbox';

  async send(action: ColdEmail, token: ExecutionToken): Promise<SendResult> {
    await record({
      at: new Date().toISOString(),
      approval_id: token.approvalId,
      kind: 'email',
      rendered: `To: ${action.to}\nSubject: ${action.subject}\n\n${renderEmail(action)}`,
      meta: { to: action.to },
    });
    return { local: true, external_id: `outbox:${token.approvalId}` };
  }
}

/** Everything the outbox has recorded, newest first. For the UI and the tests. */
export async function readOutbox(): Promise<OutboxEntry[]> {
  if (!existsSync(outboxFile())) return [];
  const text = await readFile(outboxFile(), 'utf8');
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxEntry)
    .reverse();
}
