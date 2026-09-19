// Automation rules. PRD §12's `rule` surface, and §3's non-goal in the same breath:
// "Automation rules are a *trigger surface*, not a no-code builder."
//
// So a rule is four fields — which host event wakes it, which agent runs, as whom, and
// what it is asked. There is no branching, no loop, no expression language beyond the
// one already used for router policies, and no UI for building one. A rule that needs
// more than this wants an agent, and agents are manifests too.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadConfig } from '../config/config.ts';
import type { Surface } from '../adapters/types.ts';
import { CortexError } from '../errors.ts';
import { evaluate } from '../router/policies.ts';
import type { AgentRegistry } from '../agents/registry.ts';

const manifestDir = (config = loadConfig()): string => path.join(config.resolved.manifests, 'rules');

export interface RuleManifest {
  id: string;
  name: string;
  description: string;
  owner: string;
  enabled: boolean;
  /** `event:<name>` for a host event, or `schedule` for a timer. */
  on: string;
  /** Optional guard over the event payload, same tiny grammar as router policies. */
  when?: string;
  /** Seconds between runs, for `on: schedule`. */
  everySeconds?: number;
  agent: string;
  /** Whose permissions the run uses. A rule never runs as nobody. */
  as: string;
  /** The prompt, with `{{ field }}` filled from the event payload. */
  ask: string;
  surface: Surface;
}

export interface HostEvent {
  name: string;
  payload: Record<string, unknown>;
  at: string;
}

interface RawRule {
  id: string; name: string; description: string; owner: string;
  enabled?: boolean; on: string; when?: string; every_seconds?: number;
  agent: string; as: string; ask: string; surface?: Surface;
}

export class RuleRegistry {
  readonly rules = new Map<string, RuleManifest>();

  static load(agents: AgentRegistry, dir = manifestDir()): RuleRegistry {
    const reg = new RuleRegistry();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.rule.yaml')) : [];
    for (const file of files) {
      const raw = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) as RawRule;
      const rule: RuleManifest = {
        id: raw.id, name: raw.name, description: raw.description, owner: raw.owner,
        enabled: raw.enabled ?? true, on: raw.on, when: raw.when,
        everySeconds: raw.every_seconds, agent: raw.agent, as: raw.as, ask: raw.ask,
        surface: raw.surface ?? (raw.on === 'schedule' ? 'background' : 'rule'),
      };

      // Validate at load, like everything else here: a rule pointed at an agent that
      // cannot run on the surface it names fails the build, not the 3am firing.
      const agent = agents.agents.get(rule.agent);
      if (!agent) throw new CortexError('internal', `${file}: rule targets unknown agent "${rule.agent}"`);
      if (!agent.surfaces.includes(rule.surface)) {
        throw new CortexError('internal', `${file}: agent "${rule.agent}" does not declare the "${rule.surface}" surface`);
      }
      if (rule.on === 'schedule' && !rule.everySeconds) {
        throw new CortexError('internal', `${file}: a scheduled rule needs every_seconds`);
      }
      reg.rules.set(rule.id, rule);
    }
    return reg;
  }

  /** Rules that this event should wake, guard included. */
  matching(event: HostEvent): RuleManifest[] {
    return [...this.rules.values()].filter((rule) => {
      if (!rule.enabled || rule.on !== `event:${event.name}`) return false;
      if (!rule.when) return true;
      try {
        return evaluate(rule.when, { event: event.payload });
      } catch {
        // A rule whose guard cannot be parsed does not fire. The alternative — firing
        // whenever the guard is broken — is how an automation rule becomes an incident.
        return false;
      }
    });
  }

  scheduled(): RuleManifest[] {
    return [...this.rules.values()].filter((r) => r.enabled && r.on === 'schedule');
  }
}

/** `{{ field }}` from the event payload. Undefined fields render as the empty string. */
export function renderAsk(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), payload);
    return value === undefined || value === null ? '' : String(value);
  });
}
