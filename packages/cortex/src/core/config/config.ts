// cortex.config.yaml — the one file a host edits after implementing its adapters.
// PRD §17.3.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ModelRef { provider: string; model: string }

export interface RouterClass { primary: ModelRef; fallback?: ModelRef[] }

export interface RouterPolicy {
  if: string;
  restrict_providers?: string[];
  prefer_class?: string;
  escalate_class?: boolean;
}

export interface CortexConfig {
  host: { id: string; tenancy: 'single' | 'multi' };
  /**
   * Where this deployment's manifests, prompts, and eval cases live, relative to the
   * config file itself.
   *
   * These were hard-coded to the package root until a second host was built against this
   * package, at which point every registry turned out to assume there was only ever one
   * set of manifests. Anchoring to the config file rather than to the package means a
   * host is a directory: its config, its adapters, its manifests, its prompts.
   */
  paths: { manifests: string; prompts: string; evals: string };
  server: { port: number; cors_origin: string };
  router: { classes: Record<string, RouterClass>; policies: RouterPolicy[] };
  budgets: {
    max_cost_usd_per_run: number;
    max_cost_usd_per_principal_per_day: number;
    max_steps_per_run: number;
  };
  storage: { dsn: string };
  grounding: {
    max_context_tokens: number;
    rerank_class: string;
    k_initial: number;
    k_final: number;
    min_score: number;
    min_score_ratio: number;
  };
  memory: { turn_ttl_days: number; preference_min_observations: number };
  telemetry: {
    exporter: string;
    hash_principal_ids: boolean;
    mode: 'development' | 'production';
    payloads: 'full' | 'none';
    retention_days_development: number;
    retention_days_production: number;
  };
  features: {
    'orchestration.dynamic': boolean;
    'surfaces.enabled': string[];
    'write_skills.enabled': boolean;
  };
  prompt_ramp: Record<string, Record<string, number>>;
  /** Absolute paths, resolved at load. Not written in the file. */
  readonly resolved: { manifests: string; prompts: string; evals: string; root: string };
}

/**
 * Keyed by file, not a single slot: two hosts in one process — which is what the eval
 * runner and the conformance suite do when they check a second integration — must not
 * silently share one deployment's configuration.
 */
const cached = new Map<string, CortexConfig>();

export const DEFAULT_CONFIG_FILE = path.join(PACKAGE_ROOT, 'cortex.config.yaml');

export function loadConfig(file = process.env.CORTEX_CONFIG ?? DEFAULT_CONFIG_FILE): CortexConfig {
  const key = path.resolve(file);
  const hit = cached.get(key);
  if (hit) return hit;
  const raw = yaml.load(fs.readFileSync(key, 'utf8')) as CortexConfig;
  // Env overrides for the two things a second instance must be able to move: the port it
  // listens on and the database it writes. Everything else stays in the file, where it
  // can be reviewed.
  if (process.env.CORTEX_PORT) raw.server.port = Number(process.env.CORTEX_PORT);
  if (process.env.CORTEX_DSN) raw.storage.dsn = process.env.CORTEX_DSN;
  const root = path.dirname(key);
  const paths = raw.paths ?? { manifests: 'manifests', prompts: 'prompts', evals: 'evals' };
  (raw as { resolved: CortexConfig['resolved'] }).resolved = {
    root,
    manifests: path.resolve(root, paths.manifests),
    prompts: path.resolve(root, paths.prompts),
    evals: path.resolve(root, paths.evals),
  };
  raw.paths = paths;

  assertValid(raw);
  cached.set(key, raw);
  return raw;
}

/** Only the invariants that would fail late and confusingly. Everything else is typed. */
function assertValid(c: CortexConfig): void {
  if (!c?.router?.classes) throw new Error('cortex.config.yaml: router.classes is required');
  for (const [name, klass] of Object.entries(c.router.classes)) {
    if (!klass.primary?.provider) throw new Error(`router.classes.${name}: primary.provider is required`);
  }
  // Repo rule, not a CORTEX rule: no port beginning with 4 or 5.
  const p = String(c.server?.port ?? '');
  if (/^[45]/.test(p)) {
    throw new Error(`server.port ${p} starts with 4 or 5 — see the repo's CLAUDE.md port allocation.`);
  }
  for (const ramp of Object.values(c.prompt_ramp ?? {})) {
    const total = Object.values(ramp).reduce((a, b) => a + b, 0);
    if (total !== 100) throw new Error(`prompt_ramp percentages must sum to 100, got ${total}`);
  }
}

/** Test seam. */
export function __setConfig(c: CortexConfig | null, file = DEFAULT_CONFIG_FILE): void {
  if (c) cached.set(path.resolve(file), c);
  else cached.delete(path.resolve(file));
}
