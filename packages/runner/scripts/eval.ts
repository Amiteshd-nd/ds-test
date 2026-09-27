/**
 * The golden-task runner (PRD section 6.8).
 *
 * Five suites, one per task type. `basics` are the Phase 0 tasks and each
 * declares its own checks; `landing`, `research`, `slides` and `growth` are sets
 * of briefs sharing one set, because for those the interesting question is not
 * whether one passed but what the set looks like together.
 *
 *   node scripts/eval.ts                       # everything
 *   node scripts/eval.ts research              # one suite
 *   node scripts/eval.ts landing --limit 5     # the first five, to sanity check
 *   ANTHROPIC_API_KEY=... node scripts/eval.ts research
 *
 * Thirty real runs cost real money. The runner prints a running total and a
 * cost per site, which is the number PRD section 9 asks Phase 1 to track.
 *
 * No LLM judge. Phase 1's outcomes are checkable - it built or it did not, the
 * heading is two lines or it is three - and a judge would add cost and variance
 * without adding signal. Where a model's opinion does earn its place is inside
 * the build loop, as the advisory visual review.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Store } from '../src/core/db/store.ts';
import { runTask, DEFAULT_BUDGET } from '../src/core/agent/loop.ts';
import { llmProvider, sandboxProvider, traceSink } from '../src/core/providers/registry.ts';
import { browserProvider } from '../src/core/providers/browser-playwright.ts';
import { serveDirectory } from '../src/core/site/server.ts';
import { templateIsSeeded } from '../src/core/site/seed.ts';
import { distDir, latestVersion } from '../src/core/site/workspace.ts';
import { cacheHitRate } from '../src/core/types.ts';
import type { PageCheck } from '../src/core/types.ts';
import { artifactDir, listArtifacts } from '../src/core/artifacts.ts';
import { parseDeck } from '../src/core/slides/deck.ts';
import { validateAction } from '../src/core/growth/actions.ts';
import { actionOf } from '../src/core/growth/gate.ts';

/* ------------------------------------------------------------------- types */

interface SimpleTask {
  id: string;
  prompt: string;
  note?: string;
  checks: {
    status?: string;
    tools_called?: string[];
    files_exist?: string[];
    output_contains?: string[];
    file_matches?: Record<string, string>;
    max_repeated_identical_commands?: number;
  };
}

interface LandingSuite {
  note?: string;
  checks: Record<string, unknown>;
  tasks: Array<{
    id: string;
    type: string;
    prompt: string;
    profile: Record<string, string>;
  }>;
}

/** The research and slides suites share a shape: named profiles, and tasks referencing one. */
interface BriefSuite {
  note?: string;
  checks: Record<string, unknown>;
  profiles: Record<string, Record<string, string>>;
  tasks: Array<{ id: string; profile: string; prompt: string }>;
}

interface Outcome {
  id: string;
  passed: boolean;
  failures: string[];
  seconds: number;
  cost: number;
  cacheHitRate: number;
  /** For the suite-level variety check. */
  design?: { palette: string; type: string; rhythm: string; radius: string };
}

const TASKS_DIR = path.join(process.cwd(), 'evals', 'golden_tasks');

/** The design axes land on <html> as data attributes, which is how the suite reads them back. */
function attr(html: string, name: string): string | null {
  return new RegExp(`${name}="([^"]+)"`).exec(html)?.[1] ?? null;
}

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const limitFlag = args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(args[limitFlag + 1]) : Infinity;

const llm = llmProvider();
const sandboxes = sandboxProvider();
const trace = traceSink();
const scripted = llm.name === 'scripted';

console.log(`providers: llm=${llm.name} sandbox=${sandboxes.name} trace=${trace.name}`);
if (scripted) {
  console.log(
    'NOTE: the scripted provider replays one fixed script per agent. Only the two tasks it was\n' +
      '      written for can pass; everything else is reported N/A, not as a failure.',
  );
}
console.log('');

const db = path.join(mkdtempSync(path.join(tmpdir(), 'runner-eval-')), 'runner.db');
const store = new Store(db);
const user = store.upsertUser('evals@localhost');
const deps = { store, llm, sandboxes, trace };

process.env.RUNNER_KEEP_SANDBOX = '1';

const outcomes: Outcome[] = [];
let skipped = 0;

/* -------------------------------------------------------- phase 0 suite */

if (!only || only === 'basics') {
  const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json') && f !== 'landing.json');
  if (files.length > 0) console.log('Basics\n');

  for (const file of files) {
    const golden = JSON.parse(readFileSync(path.join(TASKS_DIR, file), 'utf8')) as SimpleTask;

    if (scripted && golden.id !== 'hello-world') {
      console.log(`  N/A   ${golden.id}  - needs a real model`);
      skipped += 1;
      continue;
    }

    const project = store.createProject(user.id, golden.id);
    const task = store.createTask(project.id, 'eval', golden.prompt);
    const started = Date.now();
    const result = await runTask(task.id, deps, DEFAULT_BUDGET);
    const steps = store.listSteps(task.id);
    const failures: string[] = [];
    const c = golden.checks;

    if (c.status && result.status !== c.status) {
      failures.push(`status ${result.status}, wanted ${c.status} (${result.error ?? 'no error'})`);
    }
    for (const tool of c.tools_called ?? []) {
      if (!steps.some((s) => s.name === tool && s.status === 'ok')) {
        failures.push(`never called ${tool} successfully`);
      }
    }

    const workdir = sandboxFor(task.id);
    for (const file of c.files_exist ?? []) {
      if (!workdir || !existsSync(path.join(workdir, file))) failures.push(`missing ${file}`);
    }
    for (const [name, wanted] of Object.entries(c.file_matches ?? {})) {
      const full = workdir ? path.join(workdir, name) : '';
      const contents = full && existsSync(full) ? readFileSync(full, 'utf8').trim() : '';
      if (!contents.includes(wanted)) failures.push(`${name} does not contain "${wanted}"`);
    }

    const allOutput = steps.map((s) => s.output_ref ?? '').join('\n');
    for (const needle of c.output_contains ?? []) {
      if (!allOutput.includes(needle)) failures.push(`no step output contained "${needle}"`);
    }

    if (c.max_repeated_identical_commands !== undefined) {
      const counts = new Map<string, number>();
      for (const step of steps.filter((s) => s.name === 'shell_exec')) {
        const command = parseField(step.input_ref, 'command');
        if (command) counts.set(command, (counts.get(command) ?? 0) + 1);
      }
      for (const [command, n] of counts) {
        if (n > c.max_repeated_identical_commands) {
          failures.push(`repeated \`${command}\` ${n} times, so it is not learning from the error`);
        }
      }
    }

    record(golden.id, failures, Date.now() - started, result.cost_usd, cacheHitRate(result.usage));
  }
  console.log('');
}

/* -------------------------------------------------------- phase 1 suite */

if (!only || only === 'landing') {
  const suite = JSON.parse(
    readFileSync(path.join(TASKS_DIR, 'landing.json'), 'utf8'),
  ) as LandingSuite;

  console.log(`Landing pages (${Math.min(limit, suite.tasks.length)} of ${suite.tasks.length})\n`);

  if (!templateIsSeeded()) {
    console.log('  the site template is not installed. Run `node scripts/seed-template.ts` first.\n');
  } else {
    let n = 0;
    for (const golden of suite.tasks) {
      if (n >= limit) break;
      n += 1;

      if (scripted && golden.id !== 'landing-hedgelaying') {
        console.log(`  N/A   ${golden.id}  - needs a real model`);
        skipped += 1;
        continue;
      }

      const project = store.createProject(user.id, golden.profile.name);
      // Through the profile, exactly as the onboarding interview fills it, so
      // the eval exercises the path a real user takes rather than a shortcut.
      store.updateProfile(project.id, {
        name: golden.profile.name,
        offer: golden.profile.offer,
        audience: golden.profile.audience,
        tone: golden.profile.tone,
        brand_json: JSON.stringify({
          area: golden.profile.area,
          since: golden.profile.since,
          differentiator: golden.profile.differentiator,
        }),
        links_json: JSON.stringify({
          email: golden.profile.email,
          phone: golden.profile.phone,
        }),
      });

      const task = store.createTask(project.id, 'site', golden.prompt);
      const started = Date.now();
      const result = await runTask(task.id, deps, {
        ...DEFAULT_BUDGET,
        max_steps: 40,
        max_cost_usd: 6,
        max_ms: 8 * 60_000,
      });

      const failures: string[] = [];
      if (result.status !== 'succeeded') {
        failures.push(`status ${result.status}: ${result.error ?? 'no error'}`);
      }
      if (result.site_version === null) failures.push('no site version was captured');

      let design: Outcome['design'];
      const latest = await latestVersion(project.id);
      if (latest) {
        const dist = distDir(project.id, latest.version);
        const html = existsSync(path.join(dist, 'index.html'))
          ? readFileSync(path.join(dist, 'index.html'), 'utf8')
          : '';

        if (!html) failures.push('the version has no built index.html');
        else {
          // Does the page actually say whose it is? A page that builds and
          // checks out but never names the business is a pass on paper only.
          if (!html.includes(golden.profile.name)) {
            failures.push(`the page never mentions "${golden.profile.name}"`);
          }
          if (/Halstead|Rowe|damp and timber/i.test(html)) {
            failures.push('the template\'s example content is still on the page');
          }
          design = {
            palette: attr(html, 'data-palette') ?? 'forest',
            type: attr(html, 'data-type') ?? 'grotesk',
            rhythm: 'n/a',
            radius: attr(html, 'data-radius') ?? 'sharp',
          };
        }

        const checkFailures = await runBrowserChecks(dist);
        failures.push(...checkFailures);
      }

      record(
        golden.id,
        failures,
        Date.now() - started,
        result.cost_usd,
        cacheHitRate(result.usage),
        design,
      );
    }
  }
}

/* -------------------------------------------------- phase 2 suites */

if (!only || only === 'research') {
  await runBriefSuite('research', 'Research reports', async (project, task, result) => {
    const failures: string[] = [];
    if (result.status !== 'succeeded') failures.push(`status ${result.status}: ${result.error ?? ''}`);

    const reports = (await listArtifacts(project)).filter(
      (a) => a.task_id === task && a.filename.endsWith('.md'),
    );
    if (reports.length === 0) {
      failures.push('no report was filed');
      return failures;
    }

    const text = readFileSync(
      path.join(artifactDir(project, task), reports[0].filename),
      'utf8',
    );

    if (text.length < 500) failures.push(`the report is ${text.length} characters, which is a paragraph`);
    if (!/##\s*Sources/i.test(text)) failures.push('no Sources section');

    // The check that matters. A bracket pointing at nothing is worse than no
    // citation, because it reads as having been checked.
    const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    const listed = new Set([...text.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1])));
    const dangling = [...cited].filter((n) => !listed.has(n));
    if (dangling.length > 0) failures.push(`citations ${dangling.join(', ')} point at no listed source`);

    const distinct = [...cited].filter((n) => listed.has(n)).length;
    if (distinct < 3) failures.push(`only ${distinct} distinct sources cited`);

    return failures;
  });
}

if (!only || only === 'slides') {
  await runBriefSuite('slides', 'Decks', async (project, task, result) => {
    const failures: string[] = [];
    if (result.status !== 'succeeded') failures.push(`status ${result.status}: ${result.error ?? ''}`);

    const files = (await listArtifacts(project)).filter((a) => a.task_id === task);
    const pdf = files.find((f) => f.filename.endsWith('.pdf'));
    const pptx = files.find((f) => f.filename.endsWith('.pptx'));

    if (!pdf) failures.push('no PDF was filed');
    if (!pptx) failures.push('no PowerPoint was filed');
    // A PPTX of slide images would be roughly the size of the PNGs. A real one
    // with text boxes is small, and this is a cheap proxy for "editable".
    if (pptx && pptx.bytes < 15_000) failures.push(`the PowerPoint is only ${pptx.bytes} bytes`);
    if (pdf && pdf.bytes < 15_000) failures.push(`the PDF is only ${pdf.bytes} bytes`);

    // The deck itself, so Content, Design and Coherence can be asserted on the
    // structure rather than guessed at from the exports.
    const sandbox = sandboxFor(task);
    const deckFile = sandbox ? path.join(sandbox, 'deck', 'deck.json') : '';
    if (!deckFile || !existsSync(deckFile)) {
      failures.push('no deck.json to inspect');
      return failures;
    }

    const parsed = parseDeck(readFileSync(deckFile, 'utf8'));
    if ('problems' in parsed) {
      failures.push(...parsed.problems.map((p) => `deck: ${p}`));
      return failures;
    }

    const layouts = parsed.deck.slides.map((s) => s.layout);
    if (layouts[0] !== 'title') failures.push('the deck does not open on a title slide');
    if (layouts.at(-1) !== 'closing') failures.push('the deck does not close on next steps');
    if (new Set(layouts).size < 4) {
      failures.push(`only ${new Set(layouts).size} distinct layouts across ${layouts.length} slides`);
    }

    return failures;
  });
}

if (!only || only === 'growth') {
  await runBriefSuite('growth', 'Posts and emails', async (project, task, result) => {
    const failures: string[] = [];
    if (result.status !== 'succeeded') failures.push(`status ${result.status}: ${result.error ?? ''}`);

    const queued = store.listApprovals(project).filter((a) => a.task_id === task);
    if (queued.length < 3) failures.push(`only ${queued.length} drafts queued`);

    // The one that matters. Drafting must never send.
    const sent = queued.filter((a) => a.executed_at !== null);
    if (sent.length > 0) failures.push(`${sent.length} items were executed by drafting alone`);

    const decided = queued.filter((a) => a.status !== 'pending');
    if (decided.length > 0) failures.push(`${decided.length} items decided themselves`);

    for (const [i, row] of queued.entries()) {
      const problems = validateAction(actionOf(row));
      if (problems.length > 0) failures.push(`item ${i + 1}: ${problems.join(' ')}`);
    }

    return failures;
  });
}

/* ------------------------------------------------------------- the report */

store.close();

const attempted = outcomes.length;
const passed = outcomes.filter((o) => o.passed).length;
const totalCost = outcomes.reduce((sum, o) => sum + o.cost, 0);

console.log('');
if (attempted === 0) {
  console.log(`nothing ran${skipped ? ` (${skipped} skipped)` : ''}.`);
  process.exit(0);
}

const rate = (passed / attempted) * 100;
console.log(`${passed}/${attempted} passed${skipped ? `, ${skipped} skipped` : ''}`);
console.log(`task success rate   ${rate.toFixed(0)}%   (PRD section 9 target: >= 70%)`);
console.log(`total cost          $${totalCost.toFixed(4)}`);
console.log(`cost per task       $${(totalCost / attempted).toFixed(4)}`);
console.log(`median duration     ${median(outcomes.map((o) => o.seconds)).toFixed(1)}s   (target: < 180s)`);
if (!scripted) {
  console.log(
    `cache hit rate      ${(median(outcomes.map((o) => o.cacheHitRate)) * 100).toFixed(0)}%   (target: >= 70%)`,
  );
}

// The check only a suite can make. Thirty pages that each pass on their own but
// share one palette and one typeface are a template that nobody chose axes for,
// and that is the failure mode this whole design exists to prevent.
const designs = outcomes.map((o) => o.design).filter(Boolean) as NonNullable<Outcome['design']>[];
if (designs.length >= 5) {
  const palettes = new Set(designs.map((d) => d.palette));
  const types = new Set(designs.map((d) => d.type));
  console.log('');
  console.log(
    `design variety      ${palettes.size} palettes, ${types.size} typefaces across ${designs.length} pages`,
  );
  if (palettes.size < 3) {
    console.log('  WARNING: the pages are reaching for the same palette. They will look like one site.');
  }
}

process.exit(rate >= 70 ? 0 : 1);

/* ----------------------------------------------------------------- helpers */

/**
 * Runs one of the profile-and-prompt suites.
 *
 * The profile is written first and the prompt never repeats it, which is Phase
 * 2's acceptance criterion made mechanical: if the output needs the business to
 * be named in the prompt, the suite fails rather than quietly passing.
 */
async function runBriefSuite(
  name: 'research' | 'slides' | 'growth',
  label: string,
  checkOne: (
    projectId: string,
    taskId: string,
    result: Awaited<ReturnType<typeof runTask>>,
  ) => Promise<string[]>,
): Promise<void> {
  const suite = JSON.parse(
    readFileSync(path.join(TASKS_DIR, `${name}.json`), 'utf8'),
  ) as BriefSuite;

  console.log(`${label} (${Math.min(limit, suite.tasks.length)} of ${suite.tasks.length})\n`);

  if (scripted) {
    for (const task of suite.tasks) {
      console.log(`  N/A   ${task.id}  - needs a real model`);
      skipped += 1;
    }
    console.log('');
    return;
  }

  if (name === 'research' && searchIsFixtures()) {
    console.log(
      '  the fixture search provider only covers recorded queries, so these would be\n' +
        '  measuring the fixtures. Set TAVILY_API_KEY to run them.\n',
    );
    skipped += suite.tasks.length;
    return;
  }

  let n = 0;
  for (const golden of suite.tasks) {
    if (n >= limit) break;
    n += 1;

    const profile = suite.profiles[golden.profile];
    const project = store.createProject(user.id, profile.name);
    store.updateProfile(project.id, {
      name: profile.name,
      offer: profile.offer,
      audience: profile.audience,
      tone: profile.tone,
      brand_json: JSON.stringify({ area: profile.area, since: profile.since }),
    });

    const task = store.createTask(project.id, name, golden.prompt);
    const started = Date.now();
    const result = await runTask(task.id, deps, {
      ...DEFAULT_BUDGET,
      max_steps: 40,
      max_cost_usd: name === 'research' ? 3 : name === 'growth' ? 2 : 4,
      max_ms: 10 * 60_000,
    });

    const failures = await checkOne(project.id, task.id, result);
    record(golden.id, failures, Date.now() - started, result.cost_usd, cacheHitRate(result.usage));
  }
  console.log('');
}

function searchIsFixtures(): boolean {
  return !process.env.TAVILY_API_KEY && process.env.SEARCH_PROVIDER !== 'tavily';
}

function record(
  id: string,
  failures: string[],
  ms: number,
  cost: number,
  hitRate: number,
  design?: Outcome['design'],
): void {
  const passed = failures.length === 0;
  outcomes.push({ id, passed, failures, seconds: ms / 1000, cost, cacheHitRate: hitRate, design });
  console.log(
    `  ${passed ? 'PASS' : 'FAIL'}  ${id}  - ${(ms / 1000).toFixed(1)}s, $${cost.toFixed(4)}` +
      (design ? `, ${design.palette}/${design.type}` : ''),
  );
  for (const failure of failures) console.log(`          ${failure}`);
}

async function runBrowserChecks(dist: string): Promise<string[]> {
  if (!existsSync(path.join(dist, 'index.html'))) return [];
  const server = await serveDirectory(dist);
  const browser = await browserProvider();
  try {
    const checks: PageCheck[] = [];
    for (const viewport of ['desktop', 'mobile'] as const) {
      const report = await browser.inspect(
        `${server.url}/`,
        viewport,
        path.join(tmpdir(), `runner-eval-${viewport}.png`),
      );
      checks.push(...report.checks);
    }
    return checks
      .filter((c) => !c.passed && c.blocking)
      .map((c) => `${c.label} (${c.viewport}): ${c.detail}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * The sandbox belonging to one task.
 *
 * By task id, not by whichever directory is newest. `.runner` is shared with
 * whatever ran before - an acceptance run, an earlier suite - and
 * `RUNNER_KEEP_SANDBOX` means those are all still on disk. Picking the newest
 * made a suite pass or fail depending on what had been run beforehand, which is
 * the one thing an eval must never do.
 *
 * `LocalSandboxProvider` names each directory `<first 24 chars of task id>-XXXX`.
 */
function sandboxFor(taskId: string): string | null {
  const root = path.join(process.cwd(), '.runner', 'sandboxes');
  if (!existsSync(root)) return null;

  const prefix = taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const match = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
    .map((d) => path.join(root, d.name))
    .sort()
    .at(-1);

  return match ?? null;
}

function parseField(json: string | null, field: string): string | null {
  if (!json) return null;
  try {
    const value = (JSON.parse(json) as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
