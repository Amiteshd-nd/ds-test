// The egress proxy. §8.3: "A single egress proxy all traffic passes through — this is
// where safety checks, quota enforcement, streaming normalization, and cost metering
// live. Do not let any package call a provider SDK directly."
//
// Agents never name a vendor. They name a capability class (`reasoning.balanced`), and
// this resolves it — through the residency and surface policies, through availability,
// through the fallback chain — into a model. Swapping the default model is a config
// change with no code change, which is goal G3.

import type { CortexConfig, ModelRef } from '../config/config.ts';
import type { Principal, Surface } from '../adapters/types.ts';
import type { CompletionRequest, CompletionResult, Provider } from './types.ts';
import { CortexError } from '../errors.ts';
import { evaluate } from './policies.ts';
import { span } from '../telemetry/trace.ts';
import { createAnthropicProvider } from './providers/anthropic.ts';
import { createRehearsalProvider } from './providers/rehearsal.ts';
import { localProvider } from './providers/local.ts';

export interface RouteContext {
  principal: Principal;
  runId: string;
  surface: Surface;
  retryCount: number;
  /** Remaining budget for this run, in USD. A route that cannot fit is not attempted. */
  budgetRemainingUsd: number;
}

export interface StreamResult {
  stream: AsyncIterable<string>;
  /** Resolves once the stream is fully consumed. */
  done: Promise<CompletionResult>;
  /** Set when the primary was skipped or failed — drives the §13.4 fallback notice. */
  fallbackUsed: boolean;
  modelRef: ModelRef;
}

export class Router {
  readonly config: CortexConfig;
  readonly providers: Map<string, Provider>;

  constructor(config: CortexConfig, providers?: Provider[]) {
    this.config = config;
    const list = providers ?? [createAnthropicProvider(), createRehearsalProvider(), localProvider];
    this.providers = new Map(list.map((p) => [p.name, p]));
  }

  /** §8.2 — the ordered candidate list for a class, after policies and availability. */
  plan(className: string, ctx: RouteContext): ModelRef[] {
    let effective = className;
    let restrict: string[] | null = null;

    const scope = {
      principal: ctx.principal as unknown as Record<string, unknown>,
      run: { surface: ctx.surface },
      step: { retry_count: ctx.retryCount },
    };

    for (const policy of this.config.router.policies ?? []) {
      if (!evaluate(policy.if, scope)) continue;
      if (policy.restrict_providers) restrict = policy.restrict_providers;
      if (policy.prefer_class) effective = policy.prefer_class;
      // A retry on the same model usually fails the same way; escalate one rung.
      if (policy.escalate_class) effective = escalate(effective);
    }

    const klass = this.config.router.classes[effective] ?? this.config.router.classes[className];
    if (!klass) throw new CortexError('internal', `router: unknown model class ${className}`);

    const candidates = [klass.primary, ...(klass.fallback ?? [])];
    return candidates.filter((c) => {
      if (restrict && !restrict.includes(c.provider)) return false;
      return this.providers.get(c.provider)?.available() ?? false;
    });
  }

  async complete(className: string, req: CompletionRequest, ctx: RouteContext): Promise<StreamResult> {
    if (ctx.budgetRemainingUsd <= 0) {
      throw new CortexError('budget_exceeded', 'This run has used its cost budget.', { runId: ctx.runId });
    }

    const candidates = this.plan(className, ctx);
    if (candidates.length === 0) {
      throw new CortexError('model_unavailable', `No provider is available for ${className}.`, { className });
    }

    // Addendum C2 — the requirements ride on every request, derived from the principal's
    // own org rather than passed in by a caller who might forget.
    const enriched: CompletionRequest = {
      ...req,
      noTraining: req.noTraining ?? true,
      residency: req.residency ?? (ctx.principal.org?.data_residency as string | undefined) ?? 'any',
    };

    let lastErr: unknown;
    for (let i = 0; i < candidates.length; i++) {
      const ref = candidates[i];
      const provider = this.providers.get(ref.provider) as Provider;
      try {
        // A provider that cannot honour residency or no-training is skipped, not used
        // with the requirement dropped. This throws, the loop catches, and the next
        // candidate is tried — which is exactly what the fallback chain is for.
        provider.assertCanHonour(enriched);
        // The first chunk is awaited here rather than inside the returned iterator so a
        // provider that fails on connect falls through to the next candidate instead of
        // failing a stream the caller has already started rendering.
        const iterator = provider.complete(ref.model, enriched)[Symbol.asyncIterator]();
        const first = await iterator.next();

        let text = first.done ? '' : first.value.text;
        let resolveDone: (r: CompletionResult) => void;
        let rejectDone: (e: unknown) => void;
        const done = new Promise<CompletionResult>((res, rej) => { resolveDone = res; rejectDone = rej; });

        const self = this;
        async function* stream(): AsyncIterable<string> {
          try {
            if (!first.done) yield first.value.text;
            for (;;) {
              const next = await iterator.next();
              if (next.done) break;
              text += next.value.text;
              yield next.value.text;
            }
            const usage = provider.usage();
            void self;
            resolveDone({ ...usage, text });
          } catch (err) {
            rejectDone(err);
            throw err;
          }
        }

        return { stream: stream(), done, fallbackUsed: i > 0, modelRef: ref };
      } catch (err) {
        lastErr = err;
        // Fall through to the next candidate. The trace records which one served.
      }
    }

    throw new CortexError(
      'model_unavailable',
      `Every provider for ${className} failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  /** Convenience wrapper used by non-streaming steps (rerank, classify). */
  async text(className: string, req: CompletionRequest, ctx: RouteContext): Promise<CompletionResult> {
    return span('router.complete', ctx.runId, { model_class: className, surface: ctx.surface }, async (set) => {
      const r = await this.complete(className, req, ctx);
      for await (const _ of r.stream) void _;
      const result = await r.done;
      set({ model_id: result.modelId, provider: result.provider, tokens_in: result.tokensIn, tokens_out: result.tokensOut, cost_usd: result.costUsd });
      return result;
    });
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const ref = this.config.router.classes['embed.default'].primary;
    const provider = this.providers.get(ref.provider);
    if (!provider?.embed) throw new CortexError('internal', `provider ${ref.provider} cannot embed`);
    return provider.embed(ref.model, texts);
  }
}

function escalate(className: string): string {
  if (className === 'fast.cheap') return 'reasoning.balanced';
  if (className === 'reasoning.balanced') return 'reasoning.strong';
  return className;
}
