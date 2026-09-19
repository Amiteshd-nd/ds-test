// CORTEX core. Nothing in this directory imports host code — that is the whole contract,
// and `pnpm lint` fails the build on a violation rather than leaving it to review.
//
//   import { createCortex } from '@cloud-march/cortex';
//   const cortex = createCortex({ adapters, hostName: 'Atlas' });

import { loadConfig } from './config/config.ts';
import type { CortexConfig } from './config/config.ts';
import type { HostAdapters } from './adapters/index.ts';
import type { Principal } from './adapters/types.ts';
import { AgentRegistry } from './agents/registry.ts';
import { RuleRegistry } from './rules/registry.ts';
import { RuleEngine } from './rules/engine.ts';
import { SkillRegistry } from './skills/registry.ts';
import { PromptStore } from './prompts/store.ts';
import { Router } from './router/router.ts';
import { RunStore, openDb } from './runtime/store.ts';
import { Engine } from './runtime/engine.ts';
import { Playground } from './playground/playground.ts';
import { TraceStore } from './telemetry/store.ts';
import { TraceExporter } from './telemetry/exporter.ts';
import { FileBlobStore, NullBlobStore } from './telemetry/blobs.ts';
import path from 'node:path';
import { PACKAGE_ROOT } from './config/config.ts';
import { CortexError } from './errors.ts';

export interface CortexOptions {
  adapters: HostAdapters;
  hostName: string;
  config?: CortexConfig;
  /**
   * The host's memory and transport adapters usually need the same store, and they are
   * constructed before this call — so it can be handed in rather than opened twice.
   */
  store?: RunStore;
}

export interface Cortex {
  config: CortexConfig;
  adapters: HostAdapters;
  agents: AgentRegistry;
  skills: SkillRegistry;
  prompts: PromptStore;
  router: Router;
  store: RunStore;
  engine: Engine;
  playground: Playground;
  traces: TraceStore;
  exporter: TraceExporter;
  rules: RuleRegistry;
  ruleEngine: RuleEngine;
}

export function createCortex(opts: CortexOptions): Cortex {
  const config = opts.config ?? loadConfig();
  const skills = SkillRegistry.load();

  // A registry error is a build error. An agent pointed at a skill whose description
  // does not say when *not* to use it will call it at the wrong moment, and that is
  // cheaper to fix here than in a trace three weeks from now.
  const errors = skills.errors();
  if (errors.length) {
    throw new CortexError('internal', `skill registry:\n${errors.map((e) => `  ${e.skillId}: ${e.message}`).join('\n')}`);
  }

  const prompts = new PromptStore();
  const agents = AgentRegistry.load(skills, undefined, prompts);
  const store = opts.store ?? new RunStore(openDb(config.storage.dsn));
  const router = new Router(config);

  // Addendum C1 — spans land in a store we own, and payloads land beside it rather than
  // inside it. Nothing is exported anywhere; there is no collector to configure and no
  // account to hold.
  const traces = new TraceStore(store.db);
  const mode = config.telemetry.mode ?? 'development';
  const exporter = new TraceExporter({
    traces,
    blobs: config.telemetry.payloads === 'none' ? new NullBlobStore() : new FileBlobStore(path.join(PACKAGE_ROOT, '.cortex', 'blobs')),
    mode,
    policy: opts.adapters.policy,
    retentionDays: mode === 'production' ? config.telemetry.retention_days_production : config.telemetry.retention_days_development,
  });
  exporter.start();

  const engine = new Engine({ config, adapters: opts.adapters, agents, skills, store, router, prompts, hostName: opts.hostName, exporter });

  const playground = new Playground(config, opts.adapters, agents, skills, prompts, opts.hostName);

  // §12's `rule` and `background` surfaces. The registry validates at load — a rule
  // pointed at an agent that cannot run on the surface it names fails here rather than
  // at three in the morning.
  const rules = RuleRegistry.load(agents);
  const identity = opts.adapters.identity as { resolvePrincipal?: (id: string) => Promise<Principal | null> };
  const ruleEngine = new RuleEngine(rules, engine, {
    resolvePrincipal: async (id) => (identity.resolvePrincipal ? identity.resolvePrincipal(id) : null),
  });

  return { config, adapters: opts.adapters, agents, skills, prompts, router, store, engine, playground, traces, exporter, rules, ruleEngine };
}

export { CortexError } from './errors.ts';
export { RunStore, openDb } from './runtime/store.ts';
export { InProcessTransport } from './runtime/transport.ts';
export { SqliteMemory } from './memory/sqlite-memory.ts';
export { LocalRetrieval } from './grounding/local-retrieval.ts';
export { GroundingPipeline, rerank, dedupe, rewrite, estimateTokens, assertPermissionBoundary, PermissionBoundaryViolation } from './grounding/pipeline.ts';
export { EgressGuard } from './guardrails/egress.ts';
export { MemoryService } from './memory/service.ts';
export { Router } from './router/router.ts';
export { PromptStore } from './prompts/store.ts';
export { SkillRegistry, lintDescription } from './skills/registry.ts';
export { AgentRegistry } from './agents/registry.ts';
export { RuleRegistry, renderAsk } from './rules/registry.ts';
export { RuleEngine } from './rules/engine.ts';
export type { RuleManifest, HostEvent } from './rules/registry.ts';
export { Playground, diffLines } from './playground/playground.ts';
export { TraceStore } from './telemetry/store.ts';
export { TraceExporter } from './telemetry/exporter.ts';
export { FileBlobStore, NullBlobStore } from './telemetry/blobs.ts';
export { span, record, onSpan, hashPrincipal } from './telemetry/trace.ts';
export { validateAgainstSchema, describeIssues } from './skills/schema.ts';
export { BlockStreamParser } from './orchestrator/blocks.ts';
export { StateGraph } from './orchestrator/graph.ts';
export { scanForInjection, stripExfiltratingUrls, redactInjectedInstructions, mustEscalate } from './guardrails/injection.ts';
export { detectPii, applyPiiPolicy } from './guardrails/pii.ts';
export { loadConfig } from './config/config.ts';
export { embedText, cosine } from './router/providers/local.ts';
export type * from './adapters/index.ts';
export type { AgentManifest } from './agents/registry.ts';
export type { CortexConfig } from './config/config.ts';
