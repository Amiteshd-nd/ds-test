/**
 * The acceptance tests, run as a script rather than as unit tests.
 *
 * Phase 0 (PRD section 9): "agent can take 'create a hello-world Python script
 * and run it' end to end in a sandbox; every step visible in Langfuse; cache hit
 * rate reported per task."
 *
 * Phase 1: "describe your business, get a live landing page". A business
 * description goes in; a built, browser-checked, publishable site comes out,
 * with the time to first preview and the cost per site reported.
 *
 * Phase 2: "a deck and a competitor report generated without the user
 * repeating business info". The check that matters is the second half of that
 * sentence - the prompts are deliberately bare, and the outputs have to come
 * back knowing who the business is anyway.
 *
 * Phase 3: "no irreversible action can execute without a logged approval."
 * That is a security property, so it is checked by trying to break it rather
 * than by watching the happy path work.
 *
 * Phase 4: credits, metering and quotas. The property here is that a user
 * cannot spend what they do not have, and that nothing is charged twice - so
 * again it is checked by attacking it, not by spending happily.
 *
 * Both run the real loop, the real store, the real sandbox and a real browser
 * against whichever providers the environment selects. With no API key they use
 * the scripted provider, which proves the plumbing and nothing about the model.
 * With ANTHROPIC_API_KEY set it is a real run, and that is the only kind that
 * counts as evidence for a phase exit.
 *
 *   node scripts/acceptance.ts                       # both phases, offline
 *   node scripts/acceptance.ts 1                     # one phase
 *   ANTHROPIC_API_KEY=... node scripts/acceptance.ts # the real thing
 */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Store } from '../src/core/db/store.ts';
import { runTask, DEFAULT_BUDGET } from '../src/core/agent/loop.ts';
import { llmProvider, sandboxProvider, traceSink, deployProvider } from '../src/core/providers/registry.ts';
import { templateIsSeeded } from '../src/core/site/seed.ts';
import { distDir, latestVersion, listVersions } from '../src/core/site/workspace.ts';
import { browserProvider } from '../src/core/providers/browser-playwright.ts';
import { serveDirectory } from '../src/core/site/server.ts';
import { artifactDir, listArtifacts } from '../src/core/artifacts.ts';
import { businessBrief } from '../src/core/business/profile.ts';
import { execute } from '../src/core/growth/gate.ts';
import { growthProviders } from '../src/core/providers/registry.ts';
import { readOutbox } from '../src/core/growth/outbox.ts';
import { runDue } from '../src/core/growth/scheduler.ts';
import { validateAction } from '../src/core/growth/actions.ts';
import { admit } from '../src/core/billing/admission.ts';
import { planFor } from '../src/core/billing/plans.ts';
import { billingProvider } from '../src/core/billing/provider.ts';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });

const only = process.argv[2];
const runPhase0 = !only || only === '0';
const runPhase1 = !only || only === '1';
const runPhase2 = !only || only === '2';
const runPhase3 = !only || only === '3';
const runPhase4 = !only || only === '4';

const llm = llmProvider();
const sandboxes = sandboxProvider();
const trace = traceSink();

console.log(`providers: llm=${llm.name} sandbox=${sandboxes.name} trace=${trace.name}`);
if (llm.name === 'scripted') {
  console.log(
    'NOTE: the scripted provider is a test double. A pass here proves the loop, the store, the\n' +
      '      sandbox, the template pipeline and the browser checks work together. It proves\n' +
      '      nothing about whether the agent writes a good page.',
  );
}
console.log('');

// Keep sandboxes so the file assertions can look inside them.
process.env.RUNNER_KEEP_SANDBOX = '1';

const db = path.join(mkdtempSync(path.join(tmpdir(), 'runner-acceptance-')), 'runner.db');
const store = new Store(db);
const user = store.upsertUser('acceptance@localhost');
const deps = { store, llm, sandboxes, trace };

/* ------------------------------------------------------------------ phase 0 */

if (runPhase0) {
  console.log('Phase 0 - a hello-world script, end to end\n');

  const project = store.createProject(user.id, 'Acceptance 0');
  const task = store.createTask(project.id, 'general', 'Create a hello-world Python script and run it.');
  const started = Date.now();
  const result = await runTask(task.id, deps, DEFAULT_BUDGET);
  const elapsed = Date.now() - started;

  check('P0 task succeeded', result.status === 'succeeded', result.error ?? result.status);

  const steps = store.listSteps(task.id);
  check('P0 steps were checkpointed', steps.length > 0, `${steps.length} steps`);
  check(
    'P0 every step is closed',
    steps.every((s) => s.finished_at !== null),
    `${steps.filter((s) => s.finished_at === null).length} still open`,
  );
  check('P0 a file was written', steps.some((s) => s.name === 'file_write' && s.status === 'ok'));
  check('P0 a shell command ran', steps.some((s) => s.name === 'shell_exec' && s.status === 'ok'));
  check(
    'P0 the agent wrote a plan file',
    steps.some((s) => s.name === 'file_write' && s.input_ref?.includes('todo.md')),
  );

  const shell = steps.filter((s) => s.name === 'shell_exec');
  check(
    'P0 the program printed hello',
    shell.some((s) => (s.output_ref ?? '').toLowerCase().includes('hello')),
    shell.map((s) => (s.output_ref ?? '').replace(/\n/g, ' ')).join(' | ').slice(0, 120),
  );

  check('P0 cost was attributed', (store.getTask(task.id)?.cost_usd ?? -1) >= 0);
  checkTraces('P0', task.id, steps.length);
  check('P0 time to first artifact under 3 min', elapsed < 180_000, `${(elapsed / 1000).toFixed(1)}s`);

  report('Phase 0', {
    status: result.status,
    steps: result.steps,
    elapsed,
    cost: result.cost_usd,
    cacheHitRate: result.cache_hit_rate,
  });
}

/* ------------------------------------------------------------------ phase 1 */

if (runPhase1) {
  console.log('Phase 1 - a business description becomes a live landing page\n');

  if (!templateIsSeeded()) {
    check('P1 the site template is installed', false, 'run `node scripts/seed-template.ts` first');
  } else {
    const project = store.createProject(user.id, 'Acceptance 1');
    store.updateProfile(project.id, {
      name: 'Kestrel Hedgelaying',
      offer: 'Hedgelaying and hedgerow restoration for farms and estates.',
      audience: 'Farm managers and estate agents in Herefordshire and the Welsh borders.',
      tone: 'Plain, unhurried, a little proud of the craft.',
    });

    const task = store.createTask(
      project.id,
      'site',
      'Build a landing page for Kestrel Hedgelaying, a two-person hedgelaying business in Herefordshire.',
    );

    const started = Date.now();
    const result = await runTask(task.id, deps, { ...DEFAULT_BUDGET, max_steps: 40, max_cost_usd: 6 });
    const elapsed = Date.now() - started;

    check('P1 task succeeded', result.status === 'succeeded', result.error ?? result.status);
    check('P1 a site version was captured', result.site_version !== null, `v${result.site_version}`);

    const versions = await listVersions(project.id);
    check('P1 the version is listed', versions.length === 1, `${versions.length} versions`);

    const latest = await latestVersion(project.id);
    const dist = latest ? distDir(project.id, latest.version) : '';
    check('P1 the built page exists', Boolean(dist) && existsSync(path.join(dist, 'index.html')));
    check(
      'P1 the source was kept for editing',
      Boolean(latest) && existsSync(path.join(dist, '..', 'src', 'src', 'site.ts')),
      'without it the next task cannot edit, only rebuild',
    );
    check(
      'P1 the version records what it is',
      Boolean(latest?.title) && latest?.title !== 'Untitled',
      latest?.title ?? '',
    );

    // The blocking browser checks are the Phase 1 gate. Re-run them here rather
    // than trusting what the builder reported about itself.
    if (dist && existsSync(path.join(dist, 'index.html'))) {
      const server = await serveDirectory(dist);
      const browser = await browserProvider();
      try {
        const desktop = await browser.inspect(
          `${server.url}/`,
          'desktop',
          path.join(tmpdir(), 'runner-acceptance-desktop.png'),
        );
        const mobile = await browser.inspect(
          `${server.url}/`,
          'mobile',
          path.join(tmpdir(), 'runner-acceptance-mobile.png'),
        );
        const all = [...desktop.checks, ...mobile.checks];
        const failed = all.filter((c) => !c.passed && c.blocking);

        check('P1 a browser was available', browser.name !== 'unavailable', browser.name);
        check(
          'P1 the page passes every blocking check',
          failed.length === 0,
          failed.map((c) => `${c.label} (${c.viewport}): ${c.detail}`).join('; ').slice(0, 300),
        );
        check(
          'P1 the page renders at phone width',
          mobile.checks.find((c) => c.id === 'no-horizontal-scroll')?.passed === true,
        );
        check('P1 no console errors on load', desktop.console_errors.length === 0, desktop.console_errors[0] ?? '');
      } finally {
        await browser.close();
        await server.close();
      }
    }

    // Publish it, which is the second half of "live landing page".
    if (latest) {
      const provider = deployProvider();
      const deployed = await provider.deploy(project.id, dist);
      check('P1 the site publishes', deployed.public_url.length > 0, deployed.public_url);
      if (provider.name === 'local') {
        console.log('  (local deploy: a real URL on this machine, not a public one)\n');
      }
    }

    const steps = store.listSteps(task.id);
    check('P1 the builder ran as a sub-agent', steps.some((s) => s.name === 'web builder'));
    check('P1 the page was built', steps.some((s) => s.name === 'site_build' && s.status === 'ok'));
    check('P1 the page was checked in a browser', steps.some((s) => s.name === 'site_check'));
    checkTraces('P1', task.id, steps.length);

    // PRD section 9, Phase 1: median time to first preview under three minutes.
    check('P1 time to first preview under 3 min', elapsed < 180_000, `${(elapsed / 1000).toFixed(1)}s`);

    report('Phase 1', {
      status: result.status,
      steps: result.steps,
      elapsed,
      cost: result.cost_usd,
      cacheHitRate: result.cache_hit_rate,
      extra: [`  site version    v${result.site_version}`],
    });
  }
}

/* ------------------------------------------------------------------ phase 2 */

if (runPhase2) {
  console.log('Phase 2 - memory, research and a deck, without repeating anything\n');

  const project = store.createProject(user.id, 'Acceptance 2');

  // Said once, here, and never again. Everything below is checked against this
  // having been enough.
  store.updateProfile(project.id, {
    name: 'Halstead & Rowe',
    offer: 'Independent damp and timber surveys on older houses.',
    audience: 'Homeowners and buying agents, usually mid purchase.',
    tone: 'Plain and direct. No sales language.',
    brand_json: JSON.stringify({ area: 'Bristol and Bath', since: '2011' }),
    links_json: JSON.stringify({ email: 'hello@halsteadrowe.example' }),
  });

  /* ------------------------------------------------------------- memory */

  const memories = store.memories;
  const proposed = await memories.remember(project.id, 'They never quote for remedial work they would carry out themselves.', null);

  check('P2 a proposed fact is not recalled', (await memories.recall(project.id, '')).length === 0,
    'an unconfirmed fact must never reach a prompt');
  check('P2 it is waiting for the owner', memories.pending(project.id).length === 1);

  await memories.confirm(proposed.id);
  check('P2 a confirmed fact is recalled', (await memories.recall(project.id, '')).length === 1);
  check('P2 recall finds it by subject', (await memories.recall(project.id, 'remedial work quotes')).length === 1);

  let refused = false;
  try {
    await memories.remember(project.id, 'The portal login is admin and the password is hunter2fortress.', null);
  } catch {
    refused = true;
  }
  check('P2 credentials are refused', refused, 'memory is read back into prompts');

  const brief = await businessBrief(store.getProfile(project.id), await memories.recall(project.id, ''));
  check('P2 the brief carries profile and memory', brief.includes('Halstead') && brief.includes('remedial work'));

  /* ----------------------------------------------------------- research */

  const researchTask = store.createTask(project.id, 'research', 'Research what competitors charge.');
  const researchStarted = Date.now();
  const research = await runTask(researchTask.id, deps, {
    ...DEFAULT_BUDGET, max_steps: 40, max_cost_usd: 6, max_ms: 8 * 60_000,
  });
  const researchSeconds = (Date.now() - researchStarted) / 1000;

  check('P2 the research task succeeded', research.status === 'succeeded', research.error ?? '');

  const researchSteps = store.listSteps(researchTask.id);
  check('P2 researchers ran in parallel', researchSteps.filter((s) => s.name.startsWith('researcher:')).length >= 2,
    `${researchSteps.filter((s) => s.name.startsWith('researcher:')).length} researcher turns`);
  check('P2 the web was searched', researchSteps.some((s) => s.name === 'search_web' && s.status === 'ok'));

  const reports = (await listArtifacts(project.id)).filter((a) => a.filename.endsWith('.md'));
  check('P2 a report was filed', reports.length === 1, reports.map((r) => r.filename).join(', '));

  if (reports.length > 0) {
    const report = readFileSync(
      path.join(artifactDir(project.id, reports[0].task_id), reports[0].filename), 'utf8');
    check('P2 the report cites its sources', /\[\d+\]/.test(report) && /##\s*Sources/i.test(report));
    // Every bracket in the text must resolve to a listed source. A citation
    // that points at nothing is worse than none, because it looks checked.
    const cited = [...report.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const listed = new Set([...report.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1])));
    check('P2 every citation resolves', cited.every((n) => listed.has(n)),
      `cited ${[...new Set(cited)].join(',')} against listed ${[...listed].join(',')}`);
    check('P2 the report is written for the owner', report.length > 400 && report.includes('#'));
  }

  /* -------------------------------------------------------------- deck */

  const deckTask = store.createTask(project.id, 'slides', 'Build me a deck.');
  const deckStarted = Date.now();
  const deck = await runTask(deckTask.id, deps, {
    ...DEFAULT_BUDGET, max_steps: 40, max_cost_usd: 6, max_ms: 8 * 60_000,
  });
  const deckSeconds = (Date.now() - deckStarted) / 1000;

  check('P2 the deck task succeeded', deck.status === 'succeeded', deck.error ?? '');

  const files = await listArtifacts(project.id);
  const pdf = files.find((a) => a.filename.endsWith('.pdf'));
  const pptx = files.find((a) => a.filename.endsWith('.pptx'));
  check('P2 a PDF was produced', Boolean(pdf), pdf?.filename ?? '');
  check('P2 an editable PowerPoint was produced', Boolean(pptx), pptx?.filename ?? '');
  check('P2 the PowerPoint is a real file', (pptx?.bytes ?? 0) > 20_000, `${pptx?.bytes ?? 0} bytes`);
  check('P2 the PDF has content', (pdf?.bytes ?? 0) > 20_000, `${pdf?.bytes ?? 0} bytes`);

  // The prompts above were "Research what competitors charge." and "Build me a
  // deck." Neither says who the business is. That is the acceptance criterion.
  check('P2 nothing was repeated to get either',
    researchTask.prompt.length < 60 && deckTask.prompt.length < 30,
    `"${researchTask.prompt}" / "${deckTask.prompt}"`);

  report('Phase 2', {
    status: `${research.status} / ${deck.status}`,
    steps: research.steps + deck.steps,
    elapsed: (researchSeconds + deckSeconds) * 1000,
    cost: research.cost_usd + deck.cost_usd,
    cacheHitRate: research.cache_hit_rate,
    extra: [
      `  report          ${researchSeconds.toFixed(1)}s, $${research.cost_usd.toFixed(4)}`,
      `  deck            ${deckSeconds.toFixed(1)}s, $${deck.cost_usd.toFixed(4)}`,
    ],
  });
}

/* ------------------------------------------------------------------ phase 3 */

if (runPhase3) {
  console.log('Phase 3 - nothing goes out without a logged approval\n');

  const project = store.createProject(user.id, 'Acceptance 3');
  store.updateProfile(project.id, {
    name: 'Kestrel Hedgelaying',
    offer: 'Hedgelaying and hedgerow restoration by hand.',
    audience: 'Farm managers and estate agents.',
    tone: 'Plain and unhurried.',
  });

  const providers = growthProviders();
  const gateDeps = { store, db: store.connection, providers };

  const task = store.createTask(project.id, 'growth', 'Draft some posts for the new season.');
  const started = Date.now();
  const growth = await runTask(task.id, deps, {
    ...DEFAULT_BUDGET, max_steps: 30, max_cost_usd: 4, max_ms: 6 * 60_000,
  });

  check('P3 the drafting task succeeded', growth.status === 'succeeded', growth.error ?? '');

  const queued = store.listApprovals(project.id);
  check('P3 drafts reached the queue', queued.length >= 3, `${queued.length} items`);
  check('P3 nothing was sent by drafting', queued.every((q) => q.executed_at === null));
  check('P3 everything is pending', queued.every((q) => q.status === 'pending'));

  const drafted = queued.find((q) => q.action_type === 'email');
  check('P3 an email was drafted', Boolean(drafted));

  /* ------------------------------------- the property, tested by attack */

  const victim = queued[0];

  const unapproved = await execute(victim.id, gateDeps);
  check('P3 an unapproved action will not execute', !unapproved.ok, unapproved.reason ?? '');

  store.decideApproval(victim.id, 'rejected');
  const rejected = await execute(victim.id, gateDeps);
  check('P3 a rejected action will not execute', !rejected.ok, rejected.reason ?? '');

  const target = queued[1];
  store.decideApproval(target.id, 'approved');
  const first = await execute(target.id, gateDeps);
  check('P3 an approved action executes', first.ok, first.reason ?? '');

  const again = await execute(target.id, gateDeps);
  check('P3 it cannot execute twice', !again.ok, again.reason ?? '');

  const racers = await Promise.all([execute(queued[2].id, gateDeps), execute(queued[2].id, gateDeps)]);
  store.decideApproval(queued[2].id, 'approved');
  const raced = await Promise.all([
    execute(queued[2].id, gateDeps),
    execute(queued[2].id, gateDeps),
    execute(queued[2].id, gateDeps),
  ]);
  check('P3 racing callers cannot double send',
    racers.every((r) => !r.ok) && raced.filter((r) => r.ok).length === 1,
    `${raced.filter((r) => r.ok).length} of 3 won the claim`);

  /* --------------------------------------------------- the audit trail */

  const executed = store.getApproval(target.id)!;
  check('P3 the approval is logged', executed.status === 'approved' && executed.decided_at !== null);
  check('P3 the execution is logged', executed.executed_at !== null);
  check('P3 what was sent is recorded', Boolean(executed.result_json));

  const outbox = await readOutbox();
  check('P3 the outbox holds what would have gone out', outbox.length >= 2, `${outbox.length} entries`);
  check('P3 it is marked as not actually sent',
    outbox.every((e) => typeof e.rendered === 'string' && e.rendered.length > 20));

  /* ---------------------------------------------------- the scheduler */

  const future = store.createApproval(task.id, 'social_post',
    { kind: 'social_post', platform: 'x', text: 'A post scheduled for later this afternoon.' },
    { projectId: project.id, scheduledFor: new Date(Date.now() + 3_600_000).toISOString() });
  store.decideApproval(future.id, 'approved');

  check('P3 a future action is not yet due',
    !store.dueApprovals().some((d) => d.id === future.id));
  const early = await execute(future.id, gateDeps);
  check('P3 it will not execute early', !early.ok, early.reason ?? '');

  const overdue = store.createApproval(task.id, 'social_post',
    { kind: 'social_post', platform: 'x', text: 'A post whose time passed while Runner was off.' },
    { projectId: project.id, scheduledFor: new Date(Date.now() - 3_600_000).toISOString() });
  store.decideApproval(overdue.id, 'approved');

  const fired = await runDue({ store, providers });
  check('P3 the scheduler catches up on what it missed', fired >= 1, `${fired} fired`);
  check('P3 and left the future one alone', store.getApproval(future.id)!.executed_at === null);

  /* ------------------------------------------------- the draft rules */

  const unlawful = validateAction({
    kind: 'email', to: 'someone@example.test', subject: 'A quick question about your hedges',
    body: 'I laid forty chains on the neighbouring farm three winters ago and wondered whether your roadside boundary is worth looking at before the season fills up.',
    from_identity: '', opt_out: '',
  });
  check('P3 an email without sender or opt-out is refused',
    unlawful.some((p) => /from_identity/.test(p)) && unlawful.some((p) => /opt_out/.test(p)),
    'PECR and GDPR, not style');

  const tooLong = validateAction({
    kind: 'social_post', platform: 'x',
    text: 'x'.repeat(300),
  });
  check('P3 a post over the platform limit is refused', tooLong.some((p) => /280/.test(p)));

  report('Phase 3', {
    status: growth.status,
    steps: growth.steps,
    elapsed: Date.now() - started,
    cost: growth.cost_usd,
    cacheHitRate: growth.cache_hit_rate,
    extra: [`  queued          ${queued.length} drafts, ${outbox.length} recorded to the outbox`],
  });
}

/* ------------------------------------------------------------------ phase 4 */

if (runPhase4) {
  console.log('Phase 4 - nobody spends what they do not have\n');

  const payer = store.upsertUser('phase4@localhost');
  const project = store.createProject(payer.id, 'Acceptance 4');
  const plan = planFor(payer.plan);
  const ledger = store.ledger;

  /* ------------------------------------------------------------- credits */

  check('P4 a new account starts at zero', ledger.balance(payer.id) === 0);

  const granted = ledger.grantMonthly(payer.id, plan);
  check('P4 the free grant arrives', granted === plan.monthly_grant_usd, `$${granted}`);
  check(
    'P4 and only once a month',
    ledger.grantMonthly(payer.id, plan) === granted && ledger.grantMonthly(payer.id, plan) === granted,
    'calling it on every request has to be safe',
  );

  /* ------------------------------------------------------------ the hold */

  const first = store.createTask(project.id, 'general', 'spend something');
  const admitted = admit(store, payer.id, first.id);
  check('P4 a task with credit is admitted', admitted.ok, admitted.ok ? '' : admitted.reason);

  if (admitted.ok) {
    check(
      'P4 the budget is capped by the plan',
      admitted.budget_usd === Math.min(plan.max_task_usd, granted),
      `$${admitted.budget_usd}`,
    );
    check(
      'P4 and reserved against the balance',
      ledger.balance(payer.id) === granted - admitted.budget_usd,
      `$${ledger.balance(payer.id)} left`,
    );
  }

  /* ------------------------------------------------- the quotas, attacked */

  store.startTask(first.id);
  const concurrent = admit(store, payer.id, store.createTask(project.id, 'general', 'second').id);
  check('P4 a second task is refused while one runs', !concurrent.ok,
    concurrent.ok ? '' : concurrent.reason);
  store.finishTask(first.id, 'succeeded', null);

  /* ---------------------------------------------------------- settlement */

  const settled = ledger.settle(payer.id, first.id, 0.4);
  check('P4 only what was used is charged', Math.abs(settled - (granted - 0.4)) < 1e-6, `$${settled}`);
  check('P4 settling twice changes nothing', ledger.settle(payer.id, first.id, 0.4) === settled,
    'a retry must not refund the hold again');

  const overcharge = store.createTask(project.id, 'general', 'overcharge');
  const held = admit(store, payer.id, overcharge.id);
  if (held.ok) {
    store.finishTask(overcharge.id, 'failed', null);
    ledger.settle(payer.id, overcharge.id, 9_999);
    check('P4 a balance cannot go negative', ledger.balance(payer.id) >= 0,
      `$${ledger.balance(payer.id)} after a task claiming it spent $9999`);
  }

  /* ------------------------------------------------------ out of credit */

  for (let i = 0; i < 12 && ledger.balance(payer.id) > 0; i += 1) {
    const t = store.createTask(project.id, 'general', `drain ${i}`);
    const h = admit(store, payer.id, t.id);
    if (!h.ok) break;
    store.finishTask(t.id, 'succeeded', null);
    ledger.settle(payer.id, t.id, h.budget_usd);
  }

  check('P4 the credit can be spent to zero', ledger.balance(payer.id) === 0);

  const broke = admit(store, payer.id, store.createTask(project.id, 'general', 'no credit').id);
  check('P4 a task with no credit is refused', !broke.ok, broke.ok ? '' : broke.reason);
  check('P4 the refusal tells the owner what to do',
    !broke.ok && /resets at the start of next month|add credit/i.test(broke.reason),
    broke.ok ? '' : broke.reason);

  /* ------------------------------------------------------- the audit trail */

  const history = ledger.history(payer.id, 100);
  check('P4 every movement is a row', history.length >= 6, `${history.length} entries`);
  check('P4 holds and debits are separate',
    history.some((e) => e.kind === 'hold') && history.some((e) => e.kind === 'debit') &&
      history.some((e) => e.kind === 'release'),
    'so the history reads the way it happened');

  // The running balance on each row must agree with the sum of everything
  // before it. If it does not, one of the two is lying.
  const ordered = [...history].reverse();
  let running = 0;
  const drift = ordered.filter((e) => {
    running = Math.round((running + e.amount_usd) * 1e6) / 1e6;
    return Math.abs(running - e.balance_after) > 1e-6;
  });
  check('P4 the running balance reconciles', drift.length === 0, `${drift.length} rows disagree`);

  /* -------------------------------------------------------- stale holds */

  const abandoned = store.createTask(project.id, 'general', 'abandoned');
  ledger.purchase(payer.id, 5, 'test top up');
  const orphan = admit(store, payer.id, abandoned.id);
  store.startTask(abandoned.id);
  check('P4 an abandoned hold is findable',
    orphan.ok && ledger.staleHolds(-1).some((h) => h.task_id === abandoned.id));

  const before = ledger.balance(payer.id);
  ledger.release(payer.id, abandoned.id);
  check('P4 and recoverable', ledger.balance(payer.id) > before,
    `$${before} back to $${ledger.balance(payer.id)}`);

  report('Phase 4', {
    status: 'metered',
    steps: history.length,
    elapsed: 0,
    cost: 0,
    cacheHitRate: 0,
    extra: [
      `  free tier       $${plan.monthly_grant_usd} a month, $${plan.max_task_usd} a task`,
      `  quotas          ${plan.max_concurrent_tasks} at once, ${plan.max_tasks_per_day} a day`,
      `  billing         ${billingProvider().name}`,
    ],
  });
}

/* -------------------------------------------------------------------- done */

store.close();

console.log('');
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  - ${c.detail}` : ''}`);
}

const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length > 0) {
  console.log(`FAILED: ${failed.length} of ${checks.length} checks`);
  process.exit(1);
}
console.log(`Acceptance: ${checks.length}/${checks.length} checks passed.`);

/* ----------------------------------------------------------------- helpers */

function checkTraces(prefix: string, taskId: string, stepCount: number): void {
  if (trace.name !== 'jsonl') return;
  const file = path.join(
    process.cwd(),
    '.runner',
    'traces',
    `${new Date().toISOString().slice(0, 10)}.jsonl`,
  );
  const lines = existsSync(file)
    ? readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { task_id: string; kind: string })
        .filter((e) => e.task_id === taskId)
    : [];
  check(`${prefix} every step is traced`, lines.length >= stepCount, `${lines.length} events for ${stepCount} steps`);
  check(`${prefix} llm calls are traced`, lines.some((l) => l.kind === 'llm'));
  check(`${prefix} tool calls are traced`, lines.some((l) => l.kind === 'tool'));
}

function report(
  label: string,
  r: {
    status: string;
    steps: number;
    elapsed: number;
    cost: number;
    cacheHitRate: number;
    extra?: string[];
  },
): void {
  const simulated = llm.name === 'scripted';
  console.log('');
  console.log(`  ${label}`);
  console.log(`  status          ${r.status}`);
  console.log(`  steps           ${r.steps}`);
  console.log(`  elapsed         ${(r.elapsed / 1000).toFixed(1)}s`);
  console.log(`  cost            $${r.cost.toFixed(6)}`);
  console.log(
    `  cache hit rate  ${(r.cacheHitRate * 100).toFixed(1)}%${simulated ? '  (SIMULATED, not evidence)' : '   target: >= 70%'}`,
  );
  for (const line of r.extra ?? []) console.log(line);
  console.log('');
}
