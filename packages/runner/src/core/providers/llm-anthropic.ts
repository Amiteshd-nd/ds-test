/**
 * The Anthropic-backed `LLMProvider`.
 *
 * Two things here are load-bearing and easy to break by accident.
 *
 * **Caching.** The request renders as tools → system → messages, and a cache hit
 * is a prefix match: one changed byte anywhere before a breakpoint invalidates
 * everything after it. So the system prompt is frozen for the life of a task (no
 * clock, no ids, no "you are on step 4 of 9"), the tool list is fixed at task
 * start and sorted deterministically, and the two breakpoints sit at the end of
 * the tools and the end of the system block. Everything volatile goes in
 * `messages`, which is append-only. PRD section 4 wants a 70% cache hit rate;
 * this is the whole of how we get it, and `usage.cache_read_input_tokens`
 * reading zero across a run means something above is no longer true.
 *
 * **Thinking replay.** Thinking blocks come back from the model and must be
 * echoed on the next turn unchanged, so they travel as `opaque` blocks and are
 * never parsed, reordered or re-serialised.
 */

import Anthropic from '@anthropic-ai/sdk';

import type { LLMProvider, LLMRequest, LLMResponse, LLMContentBlock } from './interfaces.ts';
import { emptyUsage, type Usage } from '../types.ts';

/**
 * PRD section 7: top tier plans and writes hard code, mid tier does most steps,
 * a small fast model summarises and classifies. Routing by step type is also
 * the cost lever section 10 asks for.
 */
export const MODEL_TIERS = {
  plan: 'claude-opus-5',
  step: 'claude-sonnet-5',
  fast: 'claude-haiku-4-5',
} as const;

/**
 * USD per million tokens, from the Anthropic pricing table. Cache reads bill at
 * a tenth of input; cache writes at 1.25x. These are hardcoded on purpose —
 * cost has to be attributable per step from day one (PRD section 4) and an
 * un-priced step is worse than a slightly stale one. Re-check on model changes.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

export function priceOf(model: string, usage: Usage): number {
  const p = PRICES[model];
  if (!p) return 0;
  const perToken = p.in / 1_000_000;
  return (
    usage.input_tokens * perToken +
    usage.cache_creation_input_tokens * perToken * 1.25 +
    usage.cache_read_input_tokens * perToken * 0.1 +
    (usage.output_tokens * p.out) / 1_000_000
  );
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    // No key argument resolves ANTHROPIC_API_KEY, then ANTHROPIC_AUTH_TOKEN,
    // then an `ant auth login` profile. Passing undefined keeps that chain.
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = MODEL_TIERS[request.tier ?? 'step'];

    const stream = this.client.messages.stream(
      {
        model,
        // Streaming, so there is room; a truncated turn costs a whole retry.
        max_tokens: request.max_tokens ?? 16_000,
        thinking: { type: 'adaptive' },
        system: [
          {
            type: 'text',
            text: request.system,
            // Breakpoint two. Tools are rendered before system, so caching here
            // covers the tool definitions as well.
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: toAnthropicTools(request.tools),
        messages: request.messages.map(toAnthropicMessage),
      },
      { signal: request.signal },
    );

    if (request.onTextDelta) {
      stream.on('text', (delta: string) => request.onTextDelta!(delta));
    }

    const message = await stream.finalMessage();

    // A safety decline is a 200 with no usable content. Surface it as a normal
    // failed step rather than letting the loop treat empty content as "done".
    if (message.stop_reason === 'refusal') {
      throw new Error(
        `model declined the request (${message.stop_details?.category ?? 'unspecified'})`,
      );
    }

    const usage: Usage = {
      input_tokens: message.usage.input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      output_tokens: message.usage.output_tokens ?? 0,
    };

    return {
      content: message.content.map(fromAnthropicBlock),
      stop_reason: message.stop_reason,
      usage,
      model: message.model,
      cost_usd: priceOf(message.model, usage),
    };
  }
}

/**
 * Sorted by name, and the last one carries the cache breakpoint.
 *
 * Sorting matters more than it looks: the tool list is built from an object
 * whose key order nobody guarantees, and a reordered list is a different prefix
 * and therefore a cache miss on every single request.
 */
function toAnthropicTools(tools: LLMRequest['tools']): Anthropic.Tool[] {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((t, i) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    ...(i === sorted.length - 1
      ? { cache_control: { type: 'ephemeral' as const } }
      : {}),
  }));
}

function toAnthropicMessage(m: LLMRequest['messages'][number]): Anthropic.MessageParam {
  if (typeof m.content === 'string') return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: m.content.map((b): Anthropic.ContentBlockParam => {
      switch (b.type) {
        case 'text':
          return { type: 'text', text: b.text };
        case 'tool_use':
          return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: b.tool_use_id,
            content: b.content,
            ...(b.is_error ? { is_error: true } : {}),
          };
        case 'image':
          return {
            type: 'image',
            source: { type: 'base64', media_type: b.media_type, data: b.data },
          };
        case 'opaque':
          // Thinking blocks and anything else we do not model: replayed exactly
          // as received.
          return b.raw as Anthropic.ContentBlockParam;
      }
    }),
  };
}

function fromAnthropicBlock(block: Anthropic.ContentBlock): LLMContentBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    default:
      return { type: 'opaque', raw: block };
  }
}

export { emptyUsage };
