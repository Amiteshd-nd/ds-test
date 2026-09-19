// The one place in the repo that speaks to a model vendor. Nothing else may import an
// SDK or call an API directly — §8.3, enforced by scripts/lint-boundaries.mjs.

import type { CompletionChunk, CompletionRequest, CompletionResult, ModelMessage, Provider } from '../types.ts';
import { CortexError } from '../../errors.ts';

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

/**
 * Regions this vendor can be pinned to. A `residency` the vendor cannot guarantee must
 * raise (addendum C2) — the alternative is a request that looks successful and quietly
 * broke a commitment someone made in a contract.
 */
const SUPPORTED_RESIDENCY = new Set(['any', 'us']);

/** Published USD per million tokens, input/output. Used for the budget ledger (§8.3). */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5': [15, 75],
  'claude-sonnet-5': [3, 15],
  'claude-haiku-4-5-20251001': [1, 5],
};

export function createAnthropicProvider(): Provider {
  let last: Omit<CompletionResult, 'text'> = {
    tokensIn: 0, tokensOut: 0, costUsd: 0, modelId: '', provider: 'anthropic', dataHandling: 'no_training',
  };

  return {
    name: 'anthropic',
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),

    async *complete(model: string, req: CompletionRequest): AsyncIterable<CompletionChunk> {
      const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const messages = req.messages.filter((m) => m.role !== 'system');

      const res = await fetch(API, {
        method: 'POST',
        signal: req.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': VERSION,
        },
        body: JSON.stringify({
          model,
          system: system || undefined,
          messages,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      let tokensIn = 0;
      let tokensOut = 0;
      for await (const event of sseLines(res.body)) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield { text: event.delta.text as string };
        } else if (event.type === 'message_start') {
          tokensIn = event.message?.usage?.input_tokens ?? 0;
        } else if (event.type === 'message_delta') {
          tokensOut = event.usage?.output_tokens ?? tokensOut;
        }
      }

      const [inPrice, outPrice] = PRICES[model] ?? [0, 0];
      last = {
        tokensIn,
        tokensOut,
        costUsd: (tokensIn * inPrice + tokensOut * outPrice) / 1_000_000,
        modelId: model,
        provider: 'anthropic',
        dataHandling: 'no_training',
      };
    },

    usage: () => last,

    countTokens(messages: ModelMessage[]): number {
      // Four characters to a token is the usual approximation and is what the budget
      // projection needs. The authoritative count comes back in `usage()` after the
      // call; this one only has to be good enough to refuse a request before making it.
      return Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
    },

    price(tokensIn: number, tokensOut: number, model: string): number {
      const [inPrice, outPrice] = PRICES[model] ?? [0, 0];
      return (tokensIn * inPrice + tokensOut * outPrice) / 1_000_000;
    },

    // Anthropic does not train on API inputs or outputs by default, which is what this
    // records. It is a statement about the vendor's posture, not a guarantee this code
    // can enforce, and the trace says which provider served each step so the claim is
    // auditable rather than assumed.
    retentionPosture: 'no_training',

    assertCanHonour(req: CompletionRequest): void {
      if (req.residency && !SUPPORTED_RESIDENCY.has(req.residency)) {
        throw new CortexError(
          'model_unavailable',
          `This request requires data residency "${req.residency}", which the anthropic provider cannot guarantee. It was not sent.`,
          { provider: 'anthropic', residency: req.residency },
        );
      }
      // `noTraining` is satisfiable here; a provider that trains on inputs by default
      // would raise instead, and the router would fall through to the next candidate.
    },
  };
}

type SseEvent = {
  type: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number } };
  usage?: { output_tokens?: number };
};

async function* sseLines(body: ReadableStream<Uint8Array>): AsyncIterable<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload && payload !== '[DONE]') yield JSON.parse(payload) as SseEvent;
      }
    }
  }
}
