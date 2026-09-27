/**
 * The shapes every other module agrees on.
 *
 * Two families live here. The persisted rows (PRD section 8) are the durable
 * record of what happened; the stream events are what the UI watches while it is
 * still happening. They are deliberately separate — a step row is written once
 * and never changes, while a step can emit many events on its way there.
 */

/* ------------------------------------------------------------------ records */

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_user'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type StepKind = 'llm' | 'tool' | 'subagent';
export type StepStatus = 'running' | 'ok' | 'error';

export interface User {
  id: string;
  email: string;
  plan: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

/**
 * Phase 1 fills this in from the onboarding interview. Phase 0 creates the row
 * empty so that the loop already reads its business context from one place and
 * nothing has to be re-plumbed later.
 */
export interface BusinessProfile {
  project_id: string;
  name: string | null;
  offer: string | null;
  audience: string | null;
  tone: string | null;
  brand_json: string | null;
  links_json: string | null;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  type: string;
  prompt: string;
  status: TaskStatus;
  cost_usd: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface TaskStep {
  id: string;
  task_id: string;
  seq: number;
  kind: StepKind;
  name: string;
  input_ref: string | null;
  output_ref: string | null;
  status: StepStatus;
  tokens_in: number;
  tokens_cached: number;
  tokens_out: number;
  cost_usd: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface Artifact {
  id: string;
  task_id: string;
  kind: 'site' | 'deck' | 'report' | 'image' | 'post' | 'file';
  storage_url: string;
  public_url: string | null;
  version: number;
  created_at: string;
}

export interface Approval {
  id: string;
  task_id: string;
  action_type: string;
  payload_json: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_at: string | null;
}

/* --------------------------------------------------------- usage & costing */

export interface Usage {
  input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
}

export const emptyUsage = (): Usage => ({
  input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 0,
});

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
  };
}

/**
 * Cache hit rate as PRD section 4 defines it: cached input tokens over total
 * input tokens. Cache *writes* count as input the model had to read in full, so
 * they sit in the denominator and not the numerator.
 */
export function cacheHitRate(u: Usage): number {
  const total =
    u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
  return total === 0 ? 0 : u.cache_read_input_tokens / total;
}

/* ------------------------------------------------------------- page checks */

/**
 * One mechanical assertion about a rendered page.
 *
 * These are measured in a real browser rather than judged by a model: line
 * counts, contrast ratios, overflow, whether the CTA is above the fold. A model
 * is good at "does this look right" and bad at "is this heading three lines",
 * and it is the second kind that decides whether a page ships.
 */
export interface PageCheck {
  id: string;
  label: string;
  viewport: 'desktop' | 'mobile' | 'both';
  passed: boolean;
  detail: string;
  /** False for advisory checks that should not fail a build on their own. */
  blocking: boolean;
}

/* ------------------------------------------------------------ stream events */

/**
 * What the SSE endpoint emits. Every event carries `seq` so a client that
 * reconnects can ask for everything after the last one it saw.
 */
/**
 * A `RunEvent` without the fields the bus stamps on.
 *
 * Written distributively (`T extends unknown ? ... : never`) because a plain
 * `Omit<RunEvent, 'seq' | 'at'>` over a union keeps only the keys every member
 * shares, which here is none of them.
 */
export type RunEventInput<T = RunEvent> = T extends unknown
  ? Omit<T, 'seq' | 'at'>
  : never;

export type RunEvent =
  | { type: 'task.started'; seq: number; at: string; task_id: string }
  | { type: 'assistant.text'; seq: number; at: string; text: string }
  | { type: 'step.started'; seq: number; at: string; step: TaskStep }
  | { type: 'step.finished'; seq: number; at: string; step: TaskStep }
  | { type: 'plan.updated'; seq: number; at: string; todo: string }
  | { type: 'files.changed'; seq: number; at: string; paths: string[] }
  | { type: 'usage'; seq: number; at: string; usage: Usage; cost_usd: number }
  | {
      type: 'question';
      seq: number;
      at: string;
      question: string;
      step_id: string;
    }
  | {
      type: 'site.version';
      seq: number;
      at: string;
      version: number;
      preview_url: string;
    }
  | {
      type: 'site.deployed';
      seq: number;
      at: string;
      version: number;
      url: string;
      provider: string;
    }
  | {
      type: 'research.planned';
      seq: number;
      at: string;
      questions: string[];
    }
  | {
      type: 'research.finished';
      seq: number;
      at: string;
      sources: Array<{ n: number; title: string; url: string }>;
    }
  | {
      type: 'artifact.ready';
      seq: number;
      at: string;
      kind: string;
      label: string;
      /** Where the owner can open it. */
      href: string;
    }
  | {
      type: 'approval.queued';
      seq: number;
      at: string;
      approval_id: string;
      label: string;
      summary: string;
      scheduled_for: string | null;
    }
  | {
      type: 'approval.executed';
      seq: number;
      at: string;
      approval_id: string;
      label: string;
      ok: boolean;
      detail: string;
      /** False when nothing actually left this machine. */
      sent_externally: boolean;
    }
  | {
      type: 'balance';
      seq: number;
      at: string;
      balance_usd: number;
      spent_usd: number;
    }
  | {
      type: 'memory.proposed';
      seq: number;
      at: string;
      memory_id: string;
      text: string;
    }
  | {
      type: 'checks.updated';
      seq: number;
      at: string;
      checks: PageCheck[];
      screenshots: { desktop: string | null; mobile: string | null };
    }
  | {
      type: 'task.finished';
      seq: number;
      at: string;
      status: TaskStatus;
      error: string | null;
    };
