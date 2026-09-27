/**
 * Postiz, through its public API.
 *
 * **Status: written, not exercised.** No instance has been authorised.
 *
 * Postiz is **AGPL-3.0**. PRD section 0, rule 3 puts AGPL in the do-not-copy
 * list, and section 6.7 anticipated this: "integrate via its **public API** or
 * self-hosted instance rather than copying code". So this file talks HTTP to a
 * running instance and nothing from that repository is present here, studied
 * for structure or otherwise.
 *
 * The practical warning from section 6.7 is worth repeating: connecting Meta,
 * TikTok or YouTube needs platform app review, which takes weeks. Postiz is the
 * integration; the accounts are the long pole.
 */

import { renderPost, type SocialPost } from './actions.ts';
import type { ExecutionToken, PublishProvider, SendResult } from './gate.ts';

export class PostizPublishProvider implements PublishProvider {
  readonly name = 'postiz';
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async publish(action: SocialPost, token: ExecutionToken): Promise<SendResult> {
    const response = await fetch(`${this.baseUrl}/api/public/v1/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: this.apiKey },
      body: JSON.stringify({
        // Already approved and already due by the time we are called, so this
        // goes out now. The scheduling is ours, not theirs: a second scheduler
        // holding a copy of the queue is a second place for it to be wrong.
        type: 'now',
        posts: [
          {
            // Postiz keys channels by its own integration id, which is set up
            // in its UI. `POSTIZ_CHANNELS` maps our platform names onto them.
            integration: { id: channelFor(action.platform) },
            value: [{ content: renderPost(action) }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `Postiz returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string; url?: string };
    return { local: false, external_id: body.id ?? token.approvalId, url: body.url };
  }
}

/**
 * `POSTIZ_CHANNELS=x:abc123,linkedin:def456`.
 *
 * Read per call rather than cached: a channel reconnected in Postiz's UI gets a
 * new id, and a cached map would keep posting into the old one until restart.
 */
function channelFor(platform: string): string {
  const raw = process.env.POSTIZ_CHANNELS ?? '';
  const found = raw
    .split(',')
    .map((pair) => pair.split(':'))
    .find(([name]) => name?.trim() === platform);

  if (!found?.[1]) {
    throw new Error(
      `no Postiz channel for "${platform}". Set POSTIZ_CHANNELS, for example ` +
        '"x:abc123,linkedin:def456", using the integration ids from your Postiz instance.',
    );
  }
  return found[1].trim();
}
