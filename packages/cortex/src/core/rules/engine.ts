// Firing rules, and the scheduler behind the `background` surface.
//
// Both are thin on purpose: a rule turns a host event into a run, and the scheduler turns
// a clock into the same thing. Everything that makes a run safe — entitlements, the
// permission filter, gates, budgets — is the run's business, not the trigger's.

import type { Engine } from '../runtime/engine.ts';
import type { HostEvent, RuleManifest, RuleRegistry } from './registry.ts';
import { renderAsk } from './registry.ts';
import type { Principal } from '../adapters/types.ts';
import { span } from '../telemetry/trace.ts';

export interface RuleRunner {
  /** Resolve the principal a rule runs as. A rule never runs as nobody. */
  resolvePrincipal(id: string): Promise<Principal | null>;
}

export class RuleEngine {
  readonly rules: RuleRegistry;
  readonly engine: Engine;
  readonly runner: RuleRunner;
  #timers: NodeJS.Timeout[] = [];

  constructor(rules: RuleRegistry, engine: Engine, runner: RuleRunner) {
    this.rules = rules;
    this.engine = engine;
    this.runner = runner;
  }

  /** The host calls this when something happens. Returns the runs it started. */
  async fire(event: HostEvent): Promise<{ ruleId: string; runId: string | null; reason?: string }[]> {
    const matched = this.rules.matching(event);
    const out: { ruleId: string; runId: string | null; reason?: string }[] = [];

    for (const rule of matched) {
      const result = await this.#start(rule, event.payload);
      out.push({ ruleId: rule.id, ...result });
    }
    return out;
  }

  /** Starts the scheduler. Returns a teardown, and calling it twice is safe. */
  start(): () => void {
    this.stop();
    for (const rule of this.rules.scheduled()) {
      // §12 — "Background agents should be scheduled into off-peak windows where latency
      // doesn't matter." The router already prefers `fast.cheap` for this surface; the
      // interval here is the demo's stand-in for a cron expression.
      const timer = setInterval(() => {
        void this.#start(rule, { firedAt: new Date().toISOString() });
      }, (rule.everySeconds ?? 3600) * 1000);
      // A scheduler must never be the reason a process cannot exit.
      timer.unref?.();
      this.#timers.push(timer);
    }
    return () => this.stop();
  }

  stop(): void {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
  }

  async #start(rule: RuleManifest, payload: Record<string, unknown>): Promise<{ runId: string | null; reason?: string }> {
    return span('rule.fire', `rule:${rule.id}`, { rule_id: rule.id, agent_id: rule.agent }, async () => {
      const principal = await this.runner.resolvePrincipal(rule.as);
      if (!principal) return { runId: null, reason: `rule ${rule.id} runs as "${rule.as}", who does not resolve` };
      try {
        const run = await this.engine.start({
          agentId: rule.agent,
          principal,
          surface: rule.surface,
          threadId: null,
          text: renderAsk(rule.ask, payload),
          context: { rule: rule.id, event: payload },
        });
        return { runId: run.id };
      } catch (err) {
        // A rule that cannot start is a configuration problem, not a run failure. It is
        // reported to the caller and traced; it does not take the host's event with it.
        return { runId: null, reason: err instanceof Error ? err.message : String(err) };
      }
    });
  }
}
