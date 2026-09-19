// `node scripts/doctor.ts [graph]` — PRD §17.2.
//
// Runs the conformance suite against this host's adapters and reports a readiness score,
// plus the graph health check from §11.3. "A host cannot ship to production below a
// green doctor report" is the gate that makes the five-day integration claim honest:
// without it, "integrated" means "it compiled".
//
// The graph section is the one that saves projects. If ownership is fuzzy and names are
// inconsistent, the agent inherits the mess — and it is much cheaper to publish that
// before anyone has promised a launch date than after.

import { loadConfig, openDb, RunStore, SkillRegistry, AgentRegistry, PromptStore } from '../src/core/index.ts';
import { hostFor } from '../hosts/registry.ts';
import { runConformance, summarise } from '../tests/conformance/suite.ts';
import type { CheckResult } from '../tests/conformance/suite.ts';

const MODE = process.argv[2] ?? 'all';
const out = (s: string) => process.stdout.write(s);
const bar = (pct: number) => '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');

const config = { ...loadConfig(), storage: { dsn: `file:./.cortex/doctor-${loadConfig().host.id}.db` } };
const host = await hostFor(config);
const store = new RunStore(openDb(config.storage.dsn));
const adapters = host.createAdapters(store, config);

out(`\n${host.name} · ${config.host.id}\n`);

let hardFailures = 0;

// -- adapters ---------------------------------------------------------------
if (MODE === 'all' || MODE === 'adapters') {
  if (!host.conformanceFixture) {
    out('\nadapters  — no conformance fixture exported by this host.\n');
    out('  Export `conformanceFixture()` from its index.ts: two principals, a ref the first\n');
    out('  may read, one they may not, and a query. Without it the suite cannot run, and\n');
    out('  the suite is the only thing that checks your adapters before an agent does.\n');
    hardFailures++;
  } else {
  // A fresh scaffold's fixture throws, because its adapters are stubs. That is the
  // expected first run, and it deserves a sentence rather than a stack trace — this is
  // the first thing a new integrator sees.
  let fixture;
  try {
    fixture = await host.conformanceFixture();
  } catch (err) {
    out('\nadapters  — the conformance fixture could not be built yet.\n\n');
    out(`  ${err instanceof Error ? err.message : String(err)}\n\n`);
    out('  This is what a new host looks like before its adapters exist. Work through\n');
    out(`  hosts/${config.host.id}/CHECKLIST.md and run this again; identity and policy\n`);
    out('  come first, and everything else waits on them.\n');
    hardFailures++;
    fixture = null;
  }

  if (fixture) {
  const results = await runConformance(adapters, fixture);

  const summary = summarise(results);
  out(`\nadapters  ${bar(summary.score)}  ${summary.score}%  (${summary.passed}/${summary.passed + summary.failed})\n\n`);
  const byAdapter = new Map<string, CheckResult[]>();
  for (const r of results) byAdapter.set(r.adapter, [...(byAdapter.get(r.adapter) ?? []), r]);
  for (const [adapter, checks] of byAdapter) {
    const failed = checks.filter((c) => !c.pass && !c.soft);
    const note = checks.find((c) => c.soft && c.name === 'not implemented');
    out(`  ${failed.length === 0 ? '✔' : '✖'} ${adapter.padEnd(11)} ${checks.length} check(s)${note ? '  — ' + note.detail : ''}\n`);
    for (const f of failed) out(`      ✖ ${f.name}\n        ${f.detail}\n`);
  }
  hardFailures += summary.failed;
  }
  }
}

// -- registries -------------------------------------------------------------
if (MODE === 'all' || MODE === 'manifests') {
  const skills = SkillRegistry.load();
  const agents = AgentRegistry.load(skills, undefined, new PromptStore());
  const errors = skills.errors();
  const warnings = skills.issues.filter((i) => i.level === 'warn');
  out(`\nmanifests  ${agents.agents.size} agent(s), ${skills.skills.size} skill(s), ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  for (const w of warnings) out(`  ~ ${w.skillId}: ${w.message}\n`);
  for (const e of errors) out(`  ✖ ${e.skillId}: ${e.message}\n`);
  hardFailures += errors.length;
}

// -- graph health (§11.3) ---------------------------------------------------
if ((MODE === 'all' || MODE === 'graph') && adapters.graph) {
  const { entities, edges } = await import('../adapters-host/index.ts');
  const nodeTypes = new Map<string, number>();
  for (const e of entities) nodeTypes.set(e.type, (nodeTypes.get(e.type) ?? 0) + 1);

  const schema = adapters.graph?.schema();
  const knownEdgeTypes = new Set(schema?.edgeTypes ?? []);
  const validEdges = edges.filter((e) => knownEdgeTypes.has(e.type)).length;

  const owned = new Set(edges.filter((e) => e.type === 'OWNS' || e.type === 'LEADS').map((e) => e.to));
  const ownable = entities.filter((e) => e.type !== 'person');
  const ownershipPct = Math.round((ownable.filter((e) => owned.has(e.ref)).length / Math.max(ownable.length, 1)) * 100);

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const orphans = entities.filter((e) => !degree.has(e.ref));
  const degrees = [...degree.values()].sort((a, b) => a - b);
  const median = degrees.length ? degrees[Math.floor(degrees.length / 2)] : 0;
  const biggest = Math.max(0, ...degrees);

  const names = entities.map((e) => e.title.split('—')[0].trim().toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);

  out('\ngraph health\n');
  out(`  entities              ${entities.length}  (${[...nodeTypes].map(([t, n]) => `${t} ${n}`).join(', ')})\n`);
  out(`  edges                 ${edges.length}, ${validEdges} with a type in the schema\n`);
  out(`  ownership coverage    ${ownershipPct}% of non-person entities have an owner or lead\n`);
  out(`  orphan rate           ${Math.round((orphans.length / entities.length) * 100)}%  ${orphans.length ? `(${orphans.map((o) => o.ref).join(', ')})` : ''}\n`);
  out(`  duplicate names       ${dupes.length}\n`);
  out(`  neighbourhood size    median ${median}, largest ${biggest}\n`);

  if (validEdges !== edges.length) { out('  ✖ some edges have a type the schema does not declare\n'); hardFailures++; }
  if (ownershipPct < 60) { out('  ✖ ownership coverage below 60% — the agent will not know who to route work to. Fix the data before shipping the feature.\n'); hardFailures++; }
  if (biggest > 5000) { out('  ✖ a node with thousands of neighbours is useless for grounding; exclude it or split the edge type\n'); hardFailures++; }
  if (entities.length < 500) {
    out('  ~ this graph is a fixture. It proves the check runs, not that your data is good.\n');
  }
}

if ((MODE === 'all' || MODE === 'graph') && !adapters.graph) {
  out('\ngraph health\n  ~ no GraphAdapter. It is the optional one, and this host does not have\n    relationships worth traversing. Nothing to check.\n');
}

out(`\n${hardFailures === 0 ? 'green — this host may ship.' : `red — ${hardFailures} blocking issue(s). Fix these before a production ramp.`}\n`);
process.exit(hardFailures === 0 ? 0 : 1);
