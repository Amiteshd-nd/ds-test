/**
 * Every external service sits behind one of these (PRD section 0, rule 4).
 *
 * The rule is not decoration. E2B, Anthropic, Tavily, Vercel and Langfuse all
 * have a plausible replacement, and the PRD's own architecture table already
 * hedges on two of them. Agent logic imports from this file and nothing else, so
 * swapping a vendor is a change to `registry.ts` and one new file.
 *
 * Phase 0 ships a working local implementation of each interface it needs, so
 * the acceptance test runs with no accounts and no keys. The vendor-backed
 * implementations are selected by environment variable.
 */

import type { Usage } from '../types.ts';

/* ------------------------------------------------------------------ sandbox */

export interface ExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  /** True when the command was killed for exceeding its timeout. */
  timed_out: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
}

/**
 * A per-task isolated environment with a filesystem and a shell.
 *
 * Deliberately narrow: no secret injection, no host network configuration, no
 * long-lived handles. Credentials are brokered server-side and never reach here
 * (PRD section 6.2).
 */
export interface Sandbox {
  readonly id: string;
  /** Absolute path of the agent's working directory inside the sandbox. */
  readonly workdir: string;

  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  listFiles(path?: string): Promise<string[]>;
  /** Public URL for a port inside the sandbox. */
  previewUrl?(port: number): Promise<string>;
  /**
   * Copy a directory out of the sandbox onto the host.
   *
   * Phase 1 needs this because a built site has to outlive the sandbox that
   * built it. It is optional on the interface rather than required because the
   * right implementation differs sharply by provider: a filesystem copy
   * locally, a tarball over the wire for a remote microVM.
   */
  exportDir?(source: string, destinationAbsolute: string, exclude?: string[]): Promise<void>;
  /** Copy a host directory into the sandbox. The counterpart of exportDir. */
  importDir?(sourceAbsolute: string, destination: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface SandboxProvider {
  readonly name: string;
  create(taskId: string): Promise<Sandbox>;
}

/* ---------------------------------------------------------------------- llm */

export interface LLMTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  /**
   * A screenshot, for the visual QA pass (PRD section 6.3). Base64, no data:
   * prefix - the provider adds whatever wrapper its API wants.
   */
  | { type: 'image'; media_type: 'image/png' | 'image/jpeg'; data: string }
  /**
   * A block we neither read nor rewrite — a thinking block, most often.
   * Thinking blocks must be replayed to the model byte-identical, so the loop
   * carries them through this case instead of trying to model them.
   */
  | { type: 'opaque'; raw: unknown };

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | LLMContentBlock[];
}

export interface LLMRequest {
  /** Frozen across a whole task. Everything cacheable lives here. */
  system: string;
  /** Stable for the life of the task — adding or removing one breaks the cache. */
  tools: LLMTool[];
  messages: LLMMessage[];
  max_tokens?: number;
  /** Which tier to route to. The registry maps this onto a concrete model id. */
  tier?: 'plan' | 'step' | 'fast';
  /**
   * Called as text arrives. This is what keeps "first streamed token under two
   * seconds" (PRD section 10) honest — without it the UI waits for the whole
   * turn before it can show anything.
   */
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: LLMContentBlock[];
  stop_reason: string | null;
  usage: Usage;
  model: string;
  cost_usd: number;
}

export interface LLMProvider {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/* -------------------------------------------------------------------- trace */

export interface TraceEvent {
  task_id: string;
  step_id: string;
  kind: 'llm' | 'tool' | 'subagent';
  name: string;
  status: 'ok' | 'error';
  started_at: string;
  duration_ms: number;
  usage?: Usage;
  cost_usd?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

/** Langfuse in production; a JSONL file on disk in Phase 0. */
export interface TraceSink {
  readonly name: string;
  record(event: TraceEvent): Promise<void>;
  flush(): Promise<void>;
}

/* ----------------------------------------------------- not needed until P2+ */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export interface DeployResult {
  public_url: string;
  deployment_id: string;
}

export interface DeployProvider {
  readonly name: string;
  /**
   * Publish a built directory.
   *
   * It takes a host path, not a sandbox: by the time anything is deployed the
   * sandbox that built it is gone and the site lives in the versioned
   * workspace. Deploying from the sandbox would mean keeping it alive for the
   * length of a human decision.
   */
  deploy(projectId: string, dir: string): Promise<DeployResult>;
}

export interface Memory {
  id: string;
  project_id: string;
  text: string;
  source_task_id: string | null;
  confirmed: boolean;
}

/**
 * Memory writes are gated (PRD section 6.6): the agent proposes, the user
 * confirms. `remember` therefore writes an unconfirmed row, and only an explicit
 * `confirm` promotes it.
 */
export interface MemoryStore {
  readonly name: string;
  remember(projectId: string, text: string, sourceTaskId: string | null): Promise<Memory>;
  confirm(memoryId: string): Promise<void>;
  /** Rejecting deletes. A fact the owner has called wrong should not linger. */
  reject(memoryId: string): Promise<void>;
  recall(projectId: string, query: string, limit?: number): Promise<Memory[]>;
}
