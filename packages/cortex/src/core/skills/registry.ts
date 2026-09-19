// The skill registry. PRD §6.2.
//
// Downstream teams declare what they provide; agents discover and invoke at runtime,
// rather than every agent wrapping the same API a sixth time. Two controls keep that
// from becoming four hundred near-duplicate skills in eighteen months:
//
//   1. an embedding-similarity check at load (warn > 0.88, fail > 0.94), and
//   2. a CODEOWNERS rule on manifests/skills/ — see .github/CODEOWNERS.
//
// Plus a description lint, because bad skill descriptions are the single largest source
// of wrong tool calls: a description must say when to use the skill *and* when not to.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadConfig } from '../config/config.ts';
import type { JsonSchema, Principal, SkillManifest } from '../adapters/types.ts';
import { CortexError } from '../errors.ts';
import { cosine, embedText } from '../router/providers/local.ts';

const manifestDir = (config = loadConfig()): string => path.join(config.resolved.manifests, 'skills');

export interface RegistryIssue { skillId: string; level: 'warn' | 'error'; message: string }

interface RawSkill {
  id: string; version: number; name: string; description: string; owner: string;
  input_schema: JsonSchema; output_schema: JsonSchema;
  side_effect: SkillManifest['sideEffect'];
  requires_entitlements?: string[];
  rate_limit?: { per_principal_per_day?: number };
  idempotency?: { key_fields: string[]; window_minutes: number };
  timeout_ms?: number;
  retry?: { attempts: number; on: string[] };
  binding: SkillManifest['binding'];
}

export class SkillRegistry {
  readonly skills = new Map<string, SkillManifest>();
  readonly issues: RegistryIssue[] = [];

  static load(dir = manifestDir()): SkillRegistry {
    const reg = new SkillRegistry();
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.skill.yaml')) : [];
    for (const f of files) {
      const raw = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')) as RawSkill;
      reg.#add(normalise(raw), f);
    }
    reg.#similarityCheck();
    return reg;
  }

  #add(manifest: SkillManifest, file: string): void {
    if (this.skills.has(manifest.id)) {
      throw new CortexError('internal', `two manifests declare skill ${manifest.id} (${file})`);
    }
    for (const issue of lintDescription(manifest)) this.issues.push(issue);

    // Non-negotiable 3 / D-7: read-only skills ship before write skills. While the flag
    // is off, a side-effecting manifest is a load error, not a runtime surprise.
    if (manifest.sideEffect !== 'none' && !loadConfig().features['write_skills.enabled']) {
      throw new CortexError(
        'internal',
        `skill ${manifest.id} has side_effect "${manifest.sideEffect}" but features.write_skills.enabled is false. ` +
          'Read-only skills ship first; turn the flag on only once the read-only golden set passes.',
      );
    }
    this.skills.set(manifest.id, manifest);
  }

  /** §6.2 — embed name + description + input schema, flag near-duplicates. */
  #similarityCheck(): void {
    const entries = [...this.skills.values()].map((s) => ({
      id: s.id,
      vec: embedText(`${s.name} ${s.description} ${JSON.stringify(s.inputSchema)}`),
    }));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const sim = cosine(entries[i].vec, entries[j].vec);
        if (sim > 0.94) {
          this.issues.push({ skillId: entries[j].id, level: 'error', message: `is ${(sim * 100).toFixed(1)}% similar to ${entries[i].id} — merge them or make the difference explicit in the description` });
        } else if (sim > 0.88) {
          this.issues.push({ skillId: entries[j].id, level: 'warn', message: `is ${(sim * 100).toFixed(1)}% similar to ${entries[i].id}` });
        }
      }
    }
  }

  get(id: string): SkillManifest {
    const s = this.skills.get(id);
    if (!s) throw new CortexError('not_found', `unknown skill ${id}`);
    return s;
  }

  /** What this principal may actually call — the allow-list, intersected with entitlements. */
  visibleTo(allowList: string[], entitlements: Set<string>): SkillManifest[] {
    return allowList
      .map((id) => this.get(id))
      .filter((s) => s.requiresEntitlements.every((e) => entitlements.has(e)));
  }

  errors(): RegistryIssue[] {
    return this.issues.filter((i) => i.level === 'error');
  }
}

function normalise(raw: RawSkill): SkillManifest {
  return {
    id: raw.id,
    version: raw.version,
    name: raw.name,
    description: raw.description.trim(),
    owner: raw.owner,
    inputSchema: raw.input_schema,
    outputSchema: raw.output_schema,
    sideEffect: raw.side_effect,
    requiresEntitlements: raw.requires_entitlements ?? [],
    rateLimit: raw.rate_limit ? { perPrincipalPerDay: raw.rate_limit.per_principal_per_day } : undefined,
    idempotency: raw.idempotency ? { keyFields: raw.idempotency.key_fields, windowMinutes: raw.idempotency.window_minutes } : undefined,
    timeoutMs: raw.timeout_ms ?? 5000,
    retry: raw.retry,
    binding: raw.binding,
  };
}

/** §6.2 description quality lint. */
export function lintDescription(s: SkillManifest): RegistryIssue[] {
  const out: RegistryIssue[] = [];
  const words = s.description.split(/\s+/).filter(Boolean).length;
  if (words < 20) out.push({ skillId: s.id, level: 'error', message: `description is ${words} words; 20 is the floor` });
  if (!/\buse (this|it) (when|for|to)\b|\buse when\b/i.test(s.description)) {
    out.push({ skillId: s.id, level: 'error', message: 'description does not say when to use this skill' });
  }
  if (!/\bdo not use\b|\bnot for\b|\bnever use\b|\binstead\b/i.test(s.description)) {
    out.push({ skillId: s.id, level: 'error', message: 'description does not say when NOT to use this skill' });
  }
  if (!s.inputSchema.properties || Object.keys(s.inputSchema.properties).length === 0) {
    out.push({ skillId: s.id, level: 'warn', message: 'input schema has no properties' });
  } else {
    for (const [k, v] of Object.entries(s.inputSchema.properties)) {
      if (!v.description) out.push({ skillId: s.id, level: 'warn', message: `input property "${k}" has no description` });
    }
  }
  return out;
}

/** Entitlement check used by the orchestrator before any invocation. */
export function entitledTo(s: SkillManifest, entitlements: Set<string>, principal: Principal): boolean {
  void principal;
  return s.requiresEntitlements.every((e) => entitlements.has(e));
}
