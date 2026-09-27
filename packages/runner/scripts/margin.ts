/**
 * Where the money goes, and what a different routing would have cost.
 *
 * PRD section 9, Phase 4: "model routing tuned for margin". This is the tuning
 * half - you cannot tune what you have not measured, and the measurement is
 * already on disk: every LLM call has been traced with its model, its tokens
 * and its cost since Phase 0.
 *
 *   node scripts/margin.ts                 # everything traced
 *   node scripts/margin.ts 7               # the last 7 days
 *
 * The counterfactuals at the end are arithmetic, not evidence. They say what
 * the same tokens would have cost on a different tier; they cannot say whether
 * the work would still have been good enough, and on the planning turns it
 * very likely would not. Treat them as the size of the prize before deciding
 * whether it is worth an eval run to find out.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { MODEL_TIERS, priceOf } from '../src/core/providers/llm-anthropic.ts';
import { cacheHitRate, emptyUsage, addUsage, type Usage } from '../src/core/types.ts';

interface TraceEvent {
  task_id: string;
  kind: string;
  name: string;
  status: string;
  started_at: string;
  duration_ms: number;
  usage?: Usage;
  cost_usd?: number;
}

const days = Number(process.argv[2] ?? 0);
const dir = path.join(process.cwd(), '.runner', 'traces');

if (!existsSync(dir)) {
  console.log('no traces yet. Run something first.');
  process.exit(0);
}

const since = days > 0 ? Date.now() - days * 86_400_000 : 0;

const events: TraceEvent[] = readdirSync(dir)
  .filter((f) => f.endsWith('.jsonl'))
  .flatMap((f) =>
    readFileSync(path.join(dir, f), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TraceEvent),
  )
  .filter((e) => e.kind === 'llm' && Date.parse(e.started_at) >= since);

if (events.length === 0) {
  console.log('no LLM calls in that window.');
  process.exit(0);
}

/* ------------------------------------------------------------- by agent */

interface Bucket {
  calls: number;
  cost: number;
  usage: Usage;
  ms: number;
}

const byAgent = new Map<string, Bucket>();
const byModel = new Map<string, Bucket>();

const bump = (map: Map<string, Bucket>, key: string, e: TraceEvent) => {
  const b = map.get(key) ?? { calls: 0, cost: 0, usage: emptyUsage(), ms: 0 };
  b.calls += 1;
  b.cost += e.cost_usd ?? 0;
  b.ms += e.duration_ms;
  if (e.usage) b.usage = addUsage(b.usage, e.usage);
  map.set(key, b);
};

for (const e of events) {
  // Traced as "web builder (claude-sonnet-5)". The agent is the useful axis;
  // the model is which tier that agent's turn landed on.
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(e.name);
  bump(byAgent, (match?.[1] ?? e.name).trim(), e);
  bump(byModel, match?.[2] ?? 'unknown', e);
}

const total = events.reduce((n, e) => n + (e.cost_usd ?? 0), 0);
const tasks = new Set(events.map((e) => e.task_id)).size;
const usage = events.reduce((u, e) => (e.usage ? addUsage(u, e.usage) : u), emptyUsage());

const money = (n: number) => `$${n.toFixed(4)}`;
const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

console.log('');
console.log(`${events.length} LLM calls across ${tasks} tasks${days ? `, last ${days} days` : ''}`);
console.log(`total ${money(total)}, ${money(total / Math.max(tasks, 1))} per task`);
console.log(`cache hit rate ${(cacheHitRate(usage) * 100).toFixed(0)}%   (PRD section 4 target: >= 70%)`);

console.log('');
console.log(`${pad('by agent', 26)} ${pad('calls', 6)} ${pad('cost', 10)} ${pad('share', 6)} avg latency`);
for (const [name, b] of [...byAgent].sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(
    `${pad(name, 26)} ${pad(String(b.calls), 6)} ${pad(money(b.cost), 10)} ${pad(pct(b.cost), 6)} ${(b.ms / b.calls / 1000).toFixed(1)}s`,
  );
}

console.log('');
console.log(`${pad('by model', 26)} ${pad('calls', 6)} ${pad('cost', 10)} ${pad('share', 6)} cached`);
for (const [name, b] of [...byModel].sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(
    `${pad(name, 26)} ${pad(String(b.calls), 6)} ${pad(money(b.cost), 10)} ${pad(pct(b.cost), 6)} ${(cacheHitRate(b.usage) * 100).toFixed(0)}%`,
  );
}

/* --------------------------------------------------------- counterfactuals */

console.log('');
console.log('If the same tokens had gone to one tier throughout:');
for (const [tier, model] of Object.entries(MODEL_TIERS)) {
  const cost = events.reduce((n, e) => n + (e.usage ? priceOf(model, e.usage) : 0), 0);
  const delta = cost - total;
  console.log(
    `  ${pad(`${tier} (${model})`, 34)} ${pad(money(cost), 10)} ` +
      `${delta === 0 ? '' : delta < 0 ? `${money(-delta)} cheaper` : `${money(delta)} dearer`}`,
  );
}

console.log('');
console.log('Arithmetic, not evidence. It says what the tokens would have cost, not whether the');
console.log('work would still have been good enough. Before moving a step down a tier, run that');
console.log("task type's eval suite on both and compare the pass rate, not the bill.");
console.log('');
