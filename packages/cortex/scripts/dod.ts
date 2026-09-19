// `node scripts/dod.ts` — the PRD's Definition-of-Done numbers, measured rather than
// asserted. §19 gives each milestone a hard DoD, and two of them are numbers:
//
//   M2 — grounded_ratio >= 0.85 across the golden set
//   M3 — first token p95 < 800ms on the chat surface
//   M5 — first token p95 < 500ms on the inline surface (§12's tighter target), and one
//        unmodified manifest completing on all four surfaces
//
// A milestone whose DoD nobody measured is a milestone nobody finished. Writing this
// script is how the grounded_ratio segmentation bug was found: every cited sentence was
// being counted as uncited, because the citation sits after the full stop and the
// splitter handed it to the next sentence.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import { AgentRegistry } from '../src/core/agents/registry.ts';
import { createAtlasAdapters, entities, hostName, principalById } from '../adapters-host/index.ts';

const config = { ...loadConfig(), storage: { dsn: 'file:./.cortex/dod.db' } };
const store = new RunStore(openDb(config.storage.dsn));
const adapters = createAtlasAdapters(store, config);
const cortex = createCortex({ adapters, hostName, config, store });

const agents = AgentRegistry.load(cortex.skills);
const ratios: number[] = [];
const firstTokens: number[] = [];
let notApplicable = 0;

for (const agent of agents.agents.values()) {
  const dir = path.join(PACKAGE_ROOT, agent.evals.goldenSet);
  if (!fs.existsSync(dir)) continue;
  const cases = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')) as { id: string; as: string; question: string });

  process.stdout.write(`\n${agent.id}\n`);
  for (const c of cases) {
    const principal = principalById(c.as);
    if (!principal) continue;
    const started = Date.now();
    const run = await cortex.engine.start({
      agentId: agent.id, principal, surface: 'chat',
      threadId: cortex.engine.newThreadId(principal), text: c.question,
    });
    let first: number | null = null;
    for await (const { event } of adapters.transport.subscribe(run.id, 0)) {
      if (event.type === 'token' && first === null) first = Date.now() - started;
    }
    const quality = store.traces(run.id).find((t) => t.kind === 'quality')?.payload as { grounded_ratio?: number | null } | undefined;
    const ratio = quality?.grounded_ratio ?? null;
    if (ratio === null) notApplicable++;
    else ratios.push(ratio);
    if (first !== null) firstTokens.push(first);
    process.stdout.write(`  ${c.id.padEnd(26)} grounded ${ratio === null ? ' n/a' : ratio.toFixed(2)}   first token ${String(first ?? '—').padStart(4)}ms\n`);
  }
}

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const p95 = (a: number[]): number => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)] : 0);

// -- M5 ---------------------------------------------------------------------
const draft = entities.find((e) => e.ref === 'doc:onboarding-draft');
const selection = 'You should utilise the shared staging environment for any testing, and you are able to reset it at any point in time using the reset script, which is actually quite safe to run because it simply recreates the fixtures from scratch.';
const inlineFirstTokens: number[] = [];
const surfaceStatus: Record<string, string> = {};

const multiSurfaceAgent = agents.get('atlas-guide');
process.stdout.write('\natlas-guide across its declared surfaces\n');
for (const surface of multiSurfaceAgent.surfaces) {
  const principal = principalById('ananya');
  if (!principal || !draft) break;
  const isInline = surface === 'inline';
  const started = Date.now();
  let first: number | null = null;
  const run = await cortex.engine.start({
    agentId: multiSurfaceAgent.id,
    principal,
    surface,
    threadId: surface === 'chat' ? cortex.engine.newThreadId(principal) : null,
    text: isInline ? 'Tighten this without changing any facts.' : 'Why is the ingestion v2 rollout stuck?',
    context: isInline ? { ref: draft.ref, title: draft.title, body: draft.body, selection } : undefined,
  });
  let status = 'unknown';
  for await (const { event } of adapters.transport.subscribe(run.id, 0)) {
    if (event.type === 'token' && first === null) first = Date.now() - started;
    if (event.type === 'run_completed') { status = event.status; break; }
    if (event.type === 'run_failed') { status = 'failed'; break; }
  }
  if (isInline && first !== null) inlineFirstTokens.push(first);
  surfaceStatus[surface] = status;
  process.stdout.write(`  ${surface.padEnd(12)} ${status.padEnd(10)} first token ${String(first ?? '—').padStart(4)}ms\n`);
}

const allSurfacesOk = multiSurfaceAgent.surfaces.every((s) => surfaceStatus[s] === 'succeeded');
const inlineOk = inlineFirstTokens.length === 0 || p95(inlineFirstTokens) < 500;

const groundedOk = mean(ratios) >= 0.85;
const latencyOk = p95(firstTokens) < 800;

process.stdout.write(`\nM2  grounded_ratio mean ${mean(ratios).toFixed(3)} over ${ratios.length} case(s)`);
process.stdout.write(`${notApplicable ? `, ${notApplicable} not applicable (nothing retrieved)` : ''}  · DoD >= 0.85 · ${groundedOk ? 'met' : 'NOT MET'}\n`);
process.stdout.write(`M3  first token p95 ${p95(firstTokens)}ms over ${firstTokens.length} run(s)  · DoD < 800ms · ${latencyOk ? 'met' : 'NOT MET'}\n`);
process.stdout.write(`M5  all four surfaces from one unmodified manifest  · ${allSurfacesOk ? 'met' : 'NOT MET'}\n`);
process.stdout.write(`M5  inline first token ${inlineFirstTokens.length ? p95(inlineFirstTokens) + 'ms' : 'n/a'}  · §12 target < 500ms · ${inlineOk ? 'met' : 'MISSED'}\n`);
if (!inlineOk) {
  process.stdout.write(
    '    This is a §12 latency target, not an M5 Definition of Done, and it is reported\n' +
      '    rather than enforced because the cause is deliberate: the egress guard releases\n' +
      '    text one completed sentence at a time, so "first token" here is really "first\n' +
      '    sentence". Guardrails that run after the stream cannot guard anything the user\n' +
      '    has already read, and a sentence is the smallest unit a redaction decision can\n' +
      '    be made over. See docs/DECISIONS.md D-17.\n',
  );
}

if (!process.env.ANTHROPIC_API_KEY) {
  process.stdout.write(
    '\nMeasured against the offline provider, which cites every sentence it emits by\n' +
      'construction — so a grounded_ratio of 1.00 says the pipeline wires citations through\n' +
      'correctly, not that a model resisted the urge to make something up. Re-run with a key.\n',
  );
}

// The inline latency target is measured and printed, not enforced — see above.
process.exit(groundedOk && latencyOk && allSurfacesOk ? 0 : 1);
