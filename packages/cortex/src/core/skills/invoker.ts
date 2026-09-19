// One place where a skill actually runs, so every guarantee applies to every call.
//
// In order: entitlements, host policy, injection escalation (§14.2), argument schema,
// rate limit and idempotency (§6.2), timeout, retry, output schema. A skill that
// bypasses any of these is a skill that bypasses all of them eventually.

import crypto from 'node:crypto';
import type { PolicyAdapter } from '../adapters/policy.ts';
import type { SkillAdapter } from '../adapters/skill.ts';
import type { InvocationContext, Principal, SkillManifest, SkillResult } from '../adapters/types.ts';
import { CortexError } from '../errors.ts';
import { mustEscalate } from '../guardrails/injection.ts';
import { checkLimits, recordInvocation } from '../guardrails/limits.ts';
import type { RunStore } from '../runtime/store.ts';
import { describeIssues, validateAgainstSchema } from './schema.ts';
import { span } from '../telemetry/trace.ts';

export interface InvokeRequest {
  skill: SkillManifest;
  /** The invoking agent's declared gates, from its manifest. */
  gates: { on: string; mode: 'require_approval' | 'notify' }[];
  args: Record<string, unknown>;
  principal: Principal;
  entitlements: Set<string>;
  runId: string;
  stepId: string;
  argsFromUntrustedContent: boolean;
  /**
   * Set only when a human has answered the gate for this exact invocation.
   *
   * It skips the two checks whose question has been answered — the host's
   * `require_approval` decision, and the §14.2 escalation for arguments derived from
   * untrusted content — and skips nothing else. Entitlements are still checked, an
   * outright `deny` is still a deny, arguments are still validated against the schema,
   * and rate limits and idempotency still apply. A human approving an action does not
   * grant them a permission they lack.
   */
  approved?: boolean;
}

export type InvokeOutcome =
  | { kind: 'ok'; result: SkillResult }
  | { kind: 'needs_approval'; reason: string }
  | { kind: 'denied'; reason: string };

export class SkillInvoker {
  readonly adapter: SkillAdapter;
  readonly policy: PolicyAdapter;
  readonly store: RunStore;

  constructor(adapter: SkillAdapter, policy: PolicyAdapter, store: RunStore) {
    this.adapter = adapter;
    this.policy = policy;
    this.store = store;
  }

  async invoke(req: InvokeRequest): Promise<InvokeOutcome> {
    const { skill, args, principal } = req;

    return span('skill.invoke', req.runId, { skill_id: skill.id, side_effect: skill.sideEffect }, async (set) => {
      // 1. Entitlements — the agent's allow-list is not the user's permission.
      const missing = skill.requiresEntitlements.filter((e) => !req.entitlements.has(e));
      if (missing.length) {
        return { kind: 'denied', reason: `You do not have ${missing.join(', ')}, which ${skill.name} needs.` };
      }

      // 2. The host's own answer, which may be "ask a human".
      const decision = await this.policy.canInvoke(principal, skill.id, args);
      if (decision.outcome === 'deny') return { kind: 'denied', reason: decision.reason };
      if (decision.outcome === 'require_approval' && !req.approved) return { kind: 'needs_approval', reason: decision.reason };

      // 3. §14.2 — retrieved content may never authorise an action, whatever the
      //    manifest says. This check is not configurable on purpose.
      if (!req.approved && mustEscalate(skill.sideEffect, req.argsFromUntrustedContent)) {
        return {
          kind: 'needs_approval',
          reason: `${skill.name} would act on details taken from retrieved content, so it needs your approval first.`,
        };
      }

      // 3b. The agent's own HITL gates (§6.1 `hitl.gates`). A side-effecting skill in an
      //     agent that declares `on: skill.side_effect != "none"` never runs unasked —
      //     and the manifest validator refuses to load an agent that has the first
      //     without the second, so this cannot be skipped by omission.
      if (!req.approved && req.gates.some((g) => g.mode === 'require_approval' && matchesGate(g.on, skill.sideEffect))) {
        return {
          kind: 'needs_approval',
          reason: `${skill.name} changes something, so it needs your approval before it runs.`,
        };
      }

      // 4. Arguments.
      const issues = validateAgainstSchema(args, skill.inputSchema);
      if (issues.length) throw new CortexError('invalid_arguments', `${skill.id}: ${describeIssues(issues)}`);

      // 5. Rate limit, and idempotency replay inside the window.
      const { replay } = checkLimits({ store: this.store, principalId: principal.id, skill, args });
      if (replay !== undefined) {
        set({ replayed: true });
        return { kind: 'ok', result: replay as SkillResult };
      }

      const ctx: InvocationContext = {
        runId: req.runId,
        stepId: req.stepId,
        principal,
        argsFromUntrustedContent: req.argsFromUntrustedContent,
      };

      const attempts = skill.retry?.attempts ?? 1;
      let lastErr: unknown;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const result = await withTimeout(this.adapter.invoke(skill.id, args, ctx), skill.timeoutMs, skill.id);
          const outIssues = result.ok && result.data !== undefined ? validateAgainstSchema(result.data, skill.outputSchema) : [];
          if (outIssues.length) throw new CortexError('internal', `${skill.id} returned ${describeIssues(outIssues)}`);
          recordInvocation(this.store, principal.id, skill, args, result);
          set({ attempt: attempt + 1 });
          return { kind: 'ok', result };
        } catch (err) {
          lastErr = err;
          const kind = err instanceof CortexError ? err.kind : 'internal';
          const retryable = (skill.retry?.on ?? []).some((o) => (o === 'timeout' && kind === 'timeout') || o === '5xx');
          if (!retryable || attempt === attempts - 1) break;
          // Jittered backoff, per §9.3.
          await new Promise((r) => setTimeout(r, 120 * 2 ** attempt + Math.random() * 80));
        }
      }
      throw lastErr instanceof CortexError ? lastErr : new CortexError('internal', String(lastErr));
    });
  }
}

/**
 * Gate conditions are declarative strings in the agent manifest. Only the side-effect
 * form is interpreted today; a condition this does not understand is treated as
 * *matching*, because the safe reading of an unrecognised gate is that it applies.
 */
export function matchesGate(condition: string, sideEffect: string): boolean {
  const m = /side_effect\s*(!=|==)\s*"?(\w+)"?/.exec(condition);
  if (!m) return !/cost_projection|latency/.test(condition);
  const [, op, value] = m;
  return op === '!=' ? sideEffect !== value : sideEffect === value;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new CortexError('timeout', `${label} did not answer within ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export const newStepId = (): string => `step_${crypto.randomUUID().slice(0, 12)}`;
