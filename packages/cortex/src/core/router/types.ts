import type { JsonSchema } from '../adapters/types.ts';

export interface ModelMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface CompletionRequest {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Prefer a provider's native structured-output path over "respond in JSON" (§8.3). */
  schema?: JsonSchema;
  signal?: AbortSignal;
  /**
   * Addendum C2. These two ride on every request, and a provider that cannot honour one
   * must **raise rather than ignore it**. That is the whole clause: a silent failure here
   * is a compliance breach that looks like a successful request, and it is discovered in
   * an audit rather than in a log.
   */
  noTraining?: boolean;
  residency?: string;
}

export interface CompletionChunk { text: string }

/** §14.3 — recorded in every trace so compliance can audit posture after the fact. */
export type RetentionPosture = 'zero_retention' | 'no_training' | 'local' | 'unknown';

export interface CompletionResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  modelId: string;
  provider: string;
  dataHandling: RetentionPosture;
}

/**
 * Every provider presents this surface — deliberately OpenAI-compatible in shape — so
 * swapping a model is a config change and not an application change (§8.3).
 */
export interface Provider {
  name: string;
  available(): boolean;
  complete(model: string, req: CompletionRequest): AsyncIterable<CompletionChunk>;
  /** Called after the stream finishes, so usage and cost come from the provider. */
  usage(): Omit<CompletionResult, 'text'>;
  embed?(model: string, texts: string[]): Promise<Float32Array[]>;

  // -- addendum C2: the contract every vendor adapter owes the router ---------

  /**
   * An estimate is fine; what matters is that it is the *provider's* estimate, because
   * budget projection before a call has no other source.
   */
  countTokens(messages: ModelMessage[]): number;

  /** USD for a given usage on a given model. Returns 0 for local and self-hosted. */
  price(tokensIn: number, tokensOut: number, model: string): number;

  /** What this vendor does with the data. Recorded in every trace. */
  readonly retentionPosture: RetentionPosture;

  /**
   * Raises when this provider cannot honour a request's `noTraining` or `residency`.
   * The router calls it before dispatching, so an unhonourable requirement fails as a
   * typed error rather than quietly not happening.
   */
  assertCanHonour(req: CompletionRequest): void;
}
