// The vocabulary shared by every adapter. PRD §4 and §6.
//
// These mirror the PRD's Pydantic v2 models one-for-one, deliberately: if the core is
// ever ported to Python (docs/DECISIONS.md D-1), this file is the translation table.
// Nothing here imports anything.

/** PRD §4 — where an agent was invoked from. */
export type Surface = 'chat' | 'inline' | 'rule' | 'background';

/** Who is asking. Adapter 1. */
export interface Principal {
  id: string;
  type: 'member' | 'lead' | 'admin' | 'service';
  orgId: string;
  locale: string;
  tz: string;
  /**
   * Host-supplied, opaque to core. Router policies in cortex.config.yaml address these
   * keys verbatim (`principal.org.data_residency == 'eu'`), so the key names here are
   * the host's own spelling — snake_case, matching the config file, not the codebase.
   */
  org?: Record<string, unknown>;
}

/** A pointer to one thing in the host's world: `person:12345`, `doc:rfc-7`. */
export type EntityRef = string;

export type EntityType = string;

export interface Document {
  ref: EntityRef;
  type: EntityType;
  title: string;
  body: string;
  /** Host metadata passed through untouched — shown in cards, never in prompts. */
  meta?: Record<string, unknown>;
  updatedAt?: string;
}

/** One retrieved, citable span. `sourceId` is stable for the life of a run (§11.2). */
export interface Chunk {
  sourceId: string;
  ref: EntityRef;
  title: string;
  text: string;
  score: number;
  /** Which leg of the hybrid retrieval found it — kept for the trace, not the model. */
  via?: 'keyword' | 'vector' | 'graph';
}

export interface Query {
  text: string;
  /** Restrict to these host sources, as named in an agent manifest's `grounding.sources`. */
  sources?: string[];
  k?: number;
}

/** PRD §5.3 adapter 2. `requireApproval` is not a soft deny — it is a gate. */
export interface Decision {
  outcome: 'allow' | 'deny' | 'require_approval';
  /** Surfaced verbatim to the user. A denial the user cannot understand is a bug. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Graph — adapter 4
// ---------------------------------------------------------------------------

export interface GraphEdge {
  from: EntityRef;
  type: string;
  to: EntityRef;
}

export interface Subgraph {
  nodes: EntityRef[];
  edges: GraphEdge[];
}

export interface GraphSchema {
  nodeTypes: EntityType[];
  edgeTypes: string[];
}

// ---------------------------------------------------------------------------
// Skills — adapter 5, PRD §6.2
// ---------------------------------------------------------------------------

/** `none` is the only class that may run without a human in the loop. */
export type SideEffect = 'none' | 'write' | 'irreversible' | 'external';

export interface SkillManifest {
  id: string;
  version: number;
  name: string;
  /** Must say when to use *and* when not to use. Linted (§6.2). */
  description: string;
  owner: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  sideEffect: SideEffect;
  requiresEntitlements: string[];
  rateLimit?: { perPrincipalPerDay?: number };
  idempotency?: { keyFields: string[]; windowMinutes: number };
  timeoutMs: number;
  retry?: { attempts: number; on: string[] };
  binding: { kind: 'openapi' | 'mcp' | 'native'; operationId?: string; name?: string };
}

/** Enough of JSON Schema to describe a tool call. Validated by `validateAgainstSchema`. */
export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: (string | number)[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  /**
   * CORTEX extension, spelled as it appears in the YAML manifest. Marks the one property
   * a deterministic selector may fill with the user's question verbatim. Without it the
   * offline selector declines the skill rather than inventing an argument — see
   * `EmbeddingSelector` in src/core/skills/selector.ts.
   */
  x_fill_from_question?: boolean;
}

export interface InvocationContext {
  runId: string;
  stepId: string;
  principal: Principal;
  /** Set when the arguments came, even partly, from retrieved content (§14.2). */
  argsFromUntrustedContent: boolean;
  signal?: AbortSignal;
}

export interface SkillResult {
  ok: boolean;
  data?: unknown;
  error?: { kind: ErrorKind; message: string };
  /** Refs the skill touched, so the run can cite and the trace can audit. */
  refs?: EntityRef[];
}

/** Every failure the system can have is one of these. §8.3: a budget is not a 500. */
export type ErrorKind =
  | 'permission_denied'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'model_unavailable'
  | 'timeout'
  | 'invalid_arguments'
  | 'not_found'
  | 'no_answer'
  | 'internal';

// ---------------------------------------------------------------------------
// Memory — adapter 6, PRD §10
// ---------------------------------------------------------------------------

export interface Turn {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  runId?: string;
}

export type MemoryRecordType = 'turn' | 'summary' | 'fact' | 'preference';

/** Every derived memory carries where it came from. §10.2 — non-negotiable. */
export interface Provenance {
  runId: string;
  evidence: string;
  at: string;
  observations?: number;
}

export interface MemoryRecord {
  id: string;
  principalId: string;
  type: MemoryRecordType;
  key?: string;
  value: string;
  provenance: Provenance;
  expiresAt?: string;
}

export interface ProfileMemory {
  facts: MemoryRecord[];
  preferences: MemoryRecord[];
}

/** What §10.1 returns: one ranked, budget-trimmed list, not two layers to merge. */
export interface MemoryBundle {
  items: { kind: MemoryRecordType; text: string; recordId?: string }[];
  tokensUsed: number;
}

// ---------------------------------------------------------------------------
// Transport — adapter 7, PRD §15
// ---------------------------------------------------------------------------

export type RunEvent =
  | { type: 'run_started'; runId: string; agentId: string; at: string }
  | { type: 'step_started'; runId: string; stepId: string; kind: StepKind; name: string; label: string }
  | { type: 'token'; runId: string; text: string }
  | { type: 'block'; runId: string; block: Block }
  | { type: 'citation'; runId: string; sourceId: string; ref: EntityRef; title: string }
  | { type: 'approval_requested'; runId: string; stepId: string; payload: ApprovalPayload }
  | { type: 'step_completed'; runId: string; stepId: string; status: StepStatus; latencyMs: number }
  | { type: 'progress'; runId: string; message: string; pct?: number }
  | { type: 'notice'; runId: string; kind: NoticeKind; message: string }
  | { type: 'run_completed'; runId: string; status: RunStatus }
  | { type: 'run_failed'; runId: string; error: { kind: ErrorKind; message: string } };

/** First-class UI states that are not errors but must be visible (§13.4). */
export type NoticeKind =
  | 'fallback_model_used'
  | 'partial_success'
  | 'permission_filtered'
  | 'budget_warning'
  | 'untrusted_content_removed'
  | 'no_answer';

export interface Notification {
  title: string;
  body: string;
  runId: string;
  deepLink?: string;
  /**
   * What the person is being told. `approval_needed` is the one that matters: a run on
   * an async surface that stopped at a gate is waiting on a human who has no idea.
   */
  kind?: 'info' | 'approval_needed' | 'failed';
}

export interface ApprovalPayload {
  action: string;
  args: Record<string, unknown>;
  human: string;
  reasoning: string;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Generative UI blocks — PRD §13.3
// ---------------------------------------------------------------------------

export type Block =
  | { type: 'text'; text: string }
  | { type: 'entity_card'; ref: EntityRef; density: 'compact' | 'full'; reason?: string }
  | { type: 'diff_proposal'; target: string; before: string; after: string }
  | { type: 'skill_call'; skill: string; args: Record<string, unknown>; state: 'running' | 'ok' | 'error' | 'awaiting_approval' }
  | { type: 'choice'; prompt: string; options: { id: string; label: string }[] };

// ---------------------------------------------------------------------------
// Run and Step — PRD §6.3
// ---------------------------------------------------------------------------

export type RunStatus =
  | 'queued' | 'running' | 'awaiting_approval'
  | 'succeeded' | 'failed' | 'cancelled' | 'expired';

export type StepKind = 'model' | 'skill' | 'retrieval' | 'gate' | 'subagent';
export type StepStatus = 'ok' | 'error' | 'denied' | 'timeout' | 'awaiting';

export interface Trigger {
  surface: Surface;
  /** The user message for `chat`; the rule id for `rule`; the schedule for `background`. */
  detail: string;
  context?: Record<string, unknown>;
}

export interface Run {
  id: string;
  agentId: string;
  agentVersion: number;
  principalId: string;
  surface: Surface;
  threadId: string | null;
  status: RunStatus;
  trigger: Trigger;
  createdAt: string;
  updatedAt: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  parentRunId: string | null;
}

export interface Step {
  id: string;
  runId: string;
  seq: number;
  kind: StepKind;
  name: string;
  /** A hash. Payloads live in the trace store, never in the hot table (§6.3). */
  inputDigest: string;
  status: StepStatus;
  latencyMs: number;
  costUsd: number;
  modelId: string | null;
}
