// Agents are declared, not coded. PRD §6.1 — this is what makes them configurable
// teammates rather than six hand-rolled Python classes.
//
// Everything in this file is load-time validation. An agent manifest that is wrong
// should fail the build, loudly, naming the line — not fail in front of a user three
// weeks later when a gate it never declared would have been the thing that saved you.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadConfig } from '../config/config.ts';
import type { Surface } from '../adapters/types.ts';
import { CortexError } from '../errors.ts';
import type { SkillRegistry } from '../skills/registry.ts';
import { PromptStore } from '../prompts/store.ts';

const manifestDir = (config = loadConfig()): string => path.join(config.resolved.manifests, 'agents');

export type OutputFormat = 'text' | 'entity_card' | 'diff_proposal' | 'skill_call' | 'choice';

export interface HitlGate {
  on: string;
  mode: 'require_approval' | 'notify';
}

export interface AgentManifest {
  id: string;
  version: number;
  name: string;
  description: string;
  owner: string;
  surfaces: Surface[];
  visibility: { entitlements: string[] };
  modelPolicy: {
    default: string;
    steps?: Record<string, string>;
    maxCostUsdPerRun: number;
    maxLatencyMsP95?: number;
  };
  prompt: { id: string; version: number };
  /**
   * Per-surface prompt overrides. §12 keeps surface differences out of the agent
   * author's hands, but the *prompt* is not a surface difference the runtime can invent:
   * "rewrite this passage" and "answer this question" want opposite things from a model.
   * One manifest still, one entry per surface that needs its own.
   */
  surfacePrompts: Partial<Record<Surface, { id: string; version: number }>>;
  skills: string[];
  /**
   * §9.1 Mode B. A supervisor's `skills` list may contain `agent:<id>` entries; those are
   * split out here so the skill registry never sees them and the orchestrator never has
   * to guess which is which.
   */
  subAgents: string[];
  grounding: {
    sources: string[];
    graph?: { enabled: boolean; seed: string[]; edgeTypes: string[]; depth: number };
    maxContextTokens: number;
  };
  memory: {
    session: { turns: number; semanticRecall: boolean };
    profile: { read: string[]; write: string[] };
  };
  hitl: { gates: HitlGate[] };
  output: { formats: OutputFormat[] };
  evals: { goldenSet: string; minPassRate: number };
}

/** Which block formats a surface cannot function without (§6.1 validation rule 2). */
const SURFACE_NEEDS: Record<Surface, OutputFormat[]> = {
  chat: ['text'],
  inline: ['diff_proposal'],
  rule: ['text'],
  background: ['text'],
};

export class AgentRegistry {
  readonly agents = new Map<string, AgentManifest>();

  static load(skills: SkillRegistry, dir = manifestDir(), prompts = new PromptStore()): AgentRegistry {
    const reg = new AgentRegistry();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.agent.yaml')) : [];
    // Two passes: every manifest is parsed before any is validated, because a supervisor
    // is validated against the sub-agents it names and load order is alphabetical.
    const parsed: { manifest: AgentManifest; file: string }[] = [];
    for (const f of files) {
      parsed.push({ manifest: normalise(yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')) as RawAgent), file: f });
    }
    const byId = new Map(parsed.map((p) => [p.manifest.id, p.manifest]));
    for (const { manifest, file } of parsed) {
      validate(manifest, skills, prompts, file, byId);
      reg.agents.set(manifest.id, manifest);
    }
    return reg;
  }

  get(id: string): AgentManifest {
    const a = this.agents.get(id);
    if (!a) throw new CortexError('not_found', `unknown agent ${id}`);
    return a;
  }

  /** §15 `GET /v1/agents` — what this principal may see. */
  visibleTo(entitlements: Set<string>, surface?: Surface): AgentManifest[] {
    return [...this.agents.values()].filter(
      (a) =>
        a.visibility.entitlements.every((e) => entitlements.has(e)) &&
        (!surface || a.surfaces.includes(surface)),
    );
  }
}

/** §9.1 — "Max fan-out 5 parallel sub-agents per supervisor step." */
export const MAX_FAN_OUT = 5;

export function validate(
  a: AgentManifest,
  skills: SkillRegistry,
  prompts: PromptStore,
  file: string,
  allAgents?: Map<string, AgentManifest>,
): void {
  const fail = (msg: string): never => {
    throw new CortexError('internal', `${file}: ${msg}`);
  };

  // 1. Every skill exists, and every entitlement its skills demand is one this agent's
  //    own visibility rule guarantees the caller has.
  //
  //    The PRD states this the other way round ("the agent's visibility.entitlements are
  //    a subset of what those skills require"). Written that way it permits an agent
  //    visible to a principal who cannot call half its skills, which is the failure this
  //    check exists to prevent — see docs/DECISIONS.md D-9.
  for (const id of a.skills) {
    const skill = skills.skills.get(id) ?? fail(`declares skill "${id}", which is not in the registry`);
    for (const need of skill.requiresEntitlements) {
      if (!a.visibility.entitlements.includes(need)) {
        fail(`skill "${id}" requires entitlement "${need}", which this agent's visibility does not guarantee`);
      }
    }
  }

  // 2. Every declared surface is supported by the declared output formats.
  for (const surface of a.surfaces) {
    for (const need of SURFACE_NEEDS[surface]) {
      if (!a.output.formats.includes(need)) {
        fail(`declares surface "${surface}" but not output format "${need}", which that surface needs`);
      }
    }
  }

  // 3. Every prompt — the default and any per-surface override — resolves to a file.
  for (const [label, ref] of [['prompt', a.prompt], ...Object.entries(a.surfacePrompts)] as [string, { id: string; version: number }][]) {
    try {
      prompts.meta(ref.id, ref.version);
    } catch {
      fail(`${label} "${ref.id}@${ref.version}" does not resolve to a versioned prompt directory`);
    }
  }
  for (const surface of Object.keys(a.surfacePrompts) as Surface[]) {
    if (!a.surfaces.includes(surface)) fail(`declares a prompt for surface "${surface}", which it does not run on`);
  }

  // 4. Any side-effecting skill must have a matching gate. This is the one that fails
  //    the build (§6.1) — an agent that can act without a gate is not a configuration
  //    mistake, it is the thing the whole HITL section exists to make impossible.
  const sideEffecting = a.skills.map((id) => skills.skills.get(id)).filter((s) => s && s.sideEffect !== 'none');
  if (sideEffecting.length > 0) {
    const covered = a.hitl.gates.some(
      (g) => /side_effect\s*!=\s*"?none"?/.test(g.on) && g.mode === 'require_approval',
    );
    if (!covered) {
      fail(
        `declares side-effecting skills (${sideEffecting.map((s) => s?.id).join(', ')}) with no ` +
          '`hitl.gates` entry of `on: skill.side_effect != "none"` / `mode: require_approval`',
      );
    }
  }

  // 5. §9.1 Mode B — a supervisor may not grant a sub-agent anything it does not have.
  for (const subId of a.subAgents) {
    const sub = allAgents?.get(subId);
    if (!sub) {
      fail(`delegates to "agent:${subId}", which is not an agent this deployment has`);
      continue;
    }
    for (const need of sub.visibility.entitlements) {
      if (!a.visibility.entitlements.includes(need)) {
        fail(`delegates to "${subId}", which requires entitlement "${need}" that this supervisor's visibility does not guarantee`);
      }
    }
    if (sub.subAgents.length > 0) {
      // Max depth 2, enforced at load as well as at runtime. A chain that only fails
      // when it runs is a chain that fails in production.
      fail(`delegates to "${subId}", which is itself a supervisor — §9.1 caps delegation at one level`);
    }
    if (sub.id === a.id) fail('delegates to itself');
  }
  if (a.subAgents.length > MAX_FAN_OUT) {
    fail(`declares ${a.subAgents.length} sub-agents; §9.1 caps fan-out at ${MAX_FAN_OUT}`);
  }

  if (a.evals.minPassRate < 0.5 || a.evals.minPassRate > 1) fail('evals.min_pass_rate must be between 0.5 and 1');
  if (a.modelPolicy.maxCostUsdPerRun <= 0) fail('model_policy.max_cost_usd_per_run must be positive');
}

interface RawAgent {
  id: string; version: number; name: string; description: string; owner: string;
  surfaces: Surface[]; visibility: { entitlements: string[] };
  model_policy: { default: string; steps?: Record<string, string>; max_cost_usd_per_run: number; max_latency_ms_p95?: number };
  prompt: string;
  prompts?: Partial<Record<Surface, string>>;
  skills: string[];
  /**
   * §9.1 Mode B. A supervisor's `skills` list may contain `agent:<id>` entries; those are
   * split out here so the skill registry never sees them and the orchestrator never has
   * to guess which is which.
   */
  subAgents: string[];
  grounding: { sources: string[]; graph?: { enabled: boolean; seed: string[]; edge_types: string[]; depth: number }; max_context_tokens: number };
  memory: { session: { turns: number; semantic_recall: boolean }; profile: { read: string[]; write: string[] } };
  hitl?: { gates?: HitlGate[] };
  output: { formats: OutputFormat[] };
  evals: { golden_set: string; min_pass_rate: number };
}

function normalise(raw: RawAgent): AgentManifest {
  const [promptId, promptVersion] = raw.prompt.split('@');
  return {
    id: raw.id, version: raw.version, name: raw.name, description: raw.description, owner: raw.owner,
    surfaces: raw.surfaces, visibility: raw.visibility,
    modelPolicy: {
      default: raw.model_policy.default,
      steps: raw.model_policy.steps,
      maxCostUsdPerRun: raw.model_policy.max_cost_usd_per_run,
      maxLatencyMsP95: raw.model_policy.max_latency_ms_p95,
    },
    prompt: { id: promptId, version: Number(promptVersion) },
    surfacePrompts: Object.fromEntries(
      Object.entries(raw.prompts ?? {}).map(([surface, ref]) => {
        const [id, version] = String(ref).split('@');
        return [surface, { id, version: Number(version) }];
      }),
    ) as AgentManifest['surfacePrompts'],
    skills: (raw.skills ?? []).filter((id) => !id.startsWith('agent:')),
    subAgents: (raw.skills ?? []).filter((id) => id.startsWith('agent:')).map((id) => id.slice('agent:'.length)),
    grounding: {
      sources: raw.grounding.sources,
      graph: raw.grounding.graph
        ? { enabled: raw.grounding.graph.enabled, seed: raw.grounding.graph.seed, edgeTypes: raw.grounding.graph.edge_types, depth: raw.grounding.graph.depth }
        : undefined,
      maxContextTokens: raw.grounding.max_context_tokens,
    },
    memory: {
      session: { turns: raw.memory.session.turns, semanticRecall: raw.memory.session.semantic_recall },
      profile: raw.memory.profile,
    },
    hitl: { gates: raw.hitl?.gates ?? [] },
    output: raw.output,
    evals: { goldenSet: raw.evals.golden_set, minPassRate: raw.evals.min_pass_rate },
  };
}
