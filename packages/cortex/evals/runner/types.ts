// Eval case format. One YAML file per case, so a case is reviewable in a diff and a
// failing case can be pasted into a bug report.

export interface EvalAssertions {
  /** The run must invoke this skill. */
  must_call_skill?: string;
  /** The run must NOT invoke this skill — the write-path cases live on this one. */
  must_not_call_skill?: string;
  /** The run must stop at an approval gate for this skill, having executed nothing. */
  expect_approval?: string;
  /** At least one of these refs must be cited. */
  must_cite_any_of?: string[];
  /** None of these refs may be cited — the permission and cross-tenant cases. */
  must_not_cite?: string[];
  must_contain?: string[];
  must_not_contain?: string[];
  must_emit_block?: string;
  min_grounded_ratio?: number;
  /** A §13.4 notice the run is expected to surface, such as `permission_filtered`. */
  expect_notice?: string;
  expect_error_kind?: string;
  max_cost_usd?: number;
  /**
   * An LLM-judge rubric (§16.2). Skipped, loudly, when no judge model is configured —
   * never silently counted as a pass.
   */
  judge?: string;
}

export interface EvalCase {
  id: string;
  /** Principal id to run as. */
  as: string;
  agent?: string;
  question: string;
  /**
   * Surface context, passed to the run as its trigger context. `proposeSkill` and `args`
   * are how a host surface proposes an action for the gate to judge.
   */
  context?: Record<string, unknown>;
  /** Red-team cases only: which §14.4 category this covers. */
  category?: string;
  why?: string;
  assert: EvalAssertions;
}

export interface CaseResult {
  id: string;
  /** The run id, which is also the trace id — so a failure names what to open. */
  runId?: string;
  category?: string;
  passed: boolean;
  failures: string[];
  skipped: string[];
  answer: string;
  costUsd: number;
  latencyMs: number;
}
