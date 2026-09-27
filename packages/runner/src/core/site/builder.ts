/**
 * The web builder sub-agent (PRD section 6.3).
 *
 * It runs on the same engine as the orchestrator with three differences that
 * matter:
 *
 * - **Isolated context** (section 6.1, adopt 7). It never sees the
 *   orchestrator's conversation. Everything it needs is in the brief, which is
 *   also why the brief is the one thing the orchestrator's prompt is emphatic
 *   about. It returns a compressed summary, not its transcript.
 * - **A fixed template** (section 6.3, adopt). It fills a project that already
 *   builds, rather than writing one. Most tasks are one file.
 * - **A verification loop.** When it says it is done, the page is built and
 *   measured in a real browser at phone and desktop widths, and a vision model
 *   looks at the screenshots. Failures go back to it as a new turn, at most
 *   twice. This is the section 6.3 "do better" item.
 *
 * Two iterations is the PRD's number and it is the right one: the first pass
 * fixes real mistakes, the second fixes what the first missed, and a third
 * spends money rewriting a page that was already fine.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { LLMContentBlock, LLMMessage } from '../providers/interfaces.ts';
import { browserProvider, VIEWPORTS, type PageReport } from '../providers/browser-playwright.ts';
import type { PageCheck } from '../types.ts';
import { runAgent } from '../agent/engine.ts';
import { BUILDER_PROMPT, builderContext } from '../agent/prompt.ts';
import {
  fileEdit,
  fileList,
  fileRead,
  fileWrite,
  message,
  type ToolContext,
  type ToolDef,
  type ToolResult,
} from '../agent/tools.ts';
import { describeAssets } from './assets.ts';
import { seedSite } from './seed.ts';
import { serveDirectory } from './server.ts';
import { SITE_DIR } from './workspace.ts';

/** Max rounds of "the checks failed, fix it". PRD section 6.3 says two. */
const MAX_QA_ROUNDS = 2;

/* ---------------------------------------------------------- builder tools */

const siteBuild: ToolDef = {
  name: 'site_build',
  label: 'Build the page',
  category: 'site',
  description:
    'Type-check the site, run the template content rules, and build it. Returns the build output. ' +
    'If a content rule fails it names the field in src/site.ts and says what to change.',
  input_schema: { type: 'object', properties: {} },
  async run(_input, ctx) {
    const result = await ctx.sandbox.exec('npm run build', {
      cwd: SITE_DIR,
      timeout_ms: 180_000,
    });

    if (result.exit_code === 0) {
      return { content: 'Build succeeded.', meta: { built: true } };
    }

    // The guard's message is in stderr and it is the useful part; Astro's
    // stack trace under it is not, and it is long.
    const output = `${result.stdout}\n${result.stderr}`;
    const guard = /The content in src\/site\.ts breaks[\s\S]*?(?=\n\s*Stack trace:|$)/.exec(output);

    return {
      content: guard ? guard[0].trim() : lastLines(output, 40),
      is_error: true,
      meta: { built: false },
    };
  },
};

const siteCheck: ToolDef = {
  name: 'site_check',
  label: 'Check the page',
  category: 'site',
  description:
    'Load the built page in a real browser at phone and desktop widths and measure it: heading ' +
    'line counts, whether the hero fits the screen, text contrast, image dimensions, and the ' +
    'copy rules. Build first. Blocking failures must be fixed.',
  input_schema: { type: 'object', properties: {} },
  async run(_input, ctx) {
    const reports = await inspectSite(ctx);
    if ('error' in reports) return { content: reports.error, is_error: true };
    return {
      content: formatChecks(reports.reports),
      is_error: blockingFailures(reports.reports).length > 0,
      meta: { checks: reports.reports.flatMap((r) => r.checks) },
    };
  },
};

export const BUILDER_TOOLS: ToolDef[] = [fileRead, fileWrite, fileEdit, fileList, siteBuild, siteCheck];

/* ------------------------------------------------------------- inspection */

async function inspectSite(
  ctx: ToolContext,
): Promise<{ reports: PageReport[] } | { error: string }> {
  const dist = path.join(ctx.sandbox.workdir, SITE_DIR, 'dist');
  const index = await ctx.sandbox.readFile(`${SITE_DIR}/dist/index.html`).catch(() => null);
  if (!index) return { error: 'There is no build to check. Run site_build first.' };

  const server = await serveDirectory(dist);
  const browser = await browserProvider();
  try {
    const reports: PageReport[] = [];
    for (const viewport of Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>) {
      reports.push(
        await browser.inspect(
          `${server.url}/`,
          viewport,
          path.join(ctx.sandbox.workdir, '.checks', `${viewport}.png`),
        ),
      );
    }
    return { reports };
  } finally {
    await browser.close();
    await server.close();
  }
}

export function blockingFailures(reports: PageReport[]): PageCheck[] {
  return reports.flatMap((r) => r.checks).filter((c) => !c.passed && c.blocking);
}

function formatChecks(reports: PageReport[]): string {
  const lines: string[] = [];
  for (const report of reports) {
    const failed = report.checks.filter((c) => !c.passed);
    const width = VIEWPORTS[report.viewport].width;
    lines.push(
      `## ${report.viewport} (${width}px): ${report.checks.length - failed.length}/${report.checks.length} passed`,
    );
    if (failed.length === 0) lines.push('  everything passed');
    for (const check of failed) {
      lines.push(`  ${check.blocking ? 'FAIL' : 'note'}  ${check.label}${check.detail ? ` - ${check.detail}` : ''}`);
    }
    if (report.console_errors.length > 0) {
      lines.push(`  console errors: ${report.console_errors.slice(0, 3).join(' | ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/* ----------------------------------------------------------- vision pass */

/**
 * What the measurements cannot tell you.
 *
 * A browser knows the heading is two lines. It does not know the page looks
 * like every other page, or that the copy could be about any plumber in
 * England. That is what this asks, and the answer is advisory: it goes back to
 * the builder as notes, never as a build failure, because a model's opinion
 * about a page it has seen once is not something to block on.
 */
async function visionCritique(
  reports: PageReport[],
  brief: string,
  ctx: ToolContext,
): Promise<string | null> {
  const shots: LLMContentBlock[] = [];
  for (const report of reports) {
    const data = await readFile(report.screenshot, 'base64').catch(() => null);
    if (!data) continue;
    shots.push({ type: 'text', text: `${report.viewport}:` });
    shots.push({ type: 'image', media_type: 'image/png', data });
  }
  if (shots.length === 0) return null;

  try {
    const response = await ctx.deps.llm.complete({
      system:
        'You review landing pages for small businesses. You are shown a page at desktop and phone ' +
        'width and told what the business is. Answer in at most six short bullets, and only about ' +
        'things that are wrong. If the page is fine, say so in one line.\n\n' +
        'Look for: copy that could be about any business in this trade rather than this one; ' +
        'a hero that does not say what the business actually does; sections that look like filler; ' +
        'cramped or unbalanced spacing; anything that reads as a template nobody adapted. ' +
        'Do not comment on things a browser can measure (line counts, contrast, image sizes) - ' +
        'those are checked separately. Do not suggest adding testimonials, statistics, logos or ' +
        'anything else the brief does not support.',
      tools: [],
      tier: 'step',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `The business:\n${brief.slice(0, 2_000)}` },
            ...shots,
          ],
        },
      ],
      signal: ctx.signal,
    });

    ctx.deps.store.addTaskCost(ctx.taskId, response.cost_usd);
    const text = response.content
      .filter((b): b is Extract<LLMContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || null;
  } catch (err) {
    // A failed critique is not a failed build. Say what happened and move on.
    return `(the visual review could not run: ${message(err)})`;
  }
}

/* --------------------------------------------------------------- the run */

export interface BuilderInput {
  brief: string;
  fromVersion: number | null;
}

export async function runWebBuilder(input: BuilderInput, ctx: ToolContext): Promise<ToolResult> {
  let seeded;
  try {
    seeded = await seedSite(ctx.sandbox, {
      projectId: ctx.projectId,
      fromVersion: input.fromVersion,
    });
  } catch (err) {
    return { content: message(err), is_error: true };
  }

  const rules = await ctx.sandbox
    .readFile(`${SITE_DIR}/AI_RULES.md`)
    .catch(() => '(the template has no AI_RULES.md)');

  // Its own list, starting empty. This is the isolation.
  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: builderContext({
        brief: input.brief,
        rules,
        seededFrom: seeded,
        assets: describeAssets(seeded.assets),
      }),
    },
  ];

  const spec = {
    name: 'web builder',
    system: BUILDER_PROMPT,
    tools: BUILDER_TOOLS,
    // The first turn chooses the design axes and writes every word on the page.
    // That is the judgement-heavy part and it is worth the top tier once.
    tier: (turn: number) => (turn === 0 ? ('plan' as const) : ('step' as const)),
  };

  let summary = '';
  let round = 0;
  let reports: PageReport[] = [];
  let failures: PageCheck[] = [];

  for (;;) {
    const run = await runAgent({
      taskId: ctx.taskId,
      spec,
      deps: ctx.deps,
      ctx,
      messages,
      budget: { ...ctx.budget, max_steps: round === 0 ? 24 : 10 },
      signal: ctx.signal,
      hooks: {
        nextSeq: ctx.nextSeq,
        onStepStarted: (step) => ctx.run.emit({ type: 'step.started', step }),
        onStepFinished: (step) => ctx.run.emit({ type: 'step.finished', step }),
        onUsage: (usage, costUsd) => ctx.run.emit({ type: 'usage', usage, cost_usd: costUsd }),
      },
    });

    summary = run.text || summary;

    if (run.outcome === 'cancelled') {
      return { content: 'The build was cancelled.', is_error: true };
    }
    if (run.outcome === 'error') {
      return { content: `The builder stopped: ${run.error}`, is_error: true };
    }

    const inspected = await inspectSite(ctx);
    if ('error' in inspected) {
      return {
        content: `The builder finished but produced no working build: ${inspected.error}`,
        is_error: true,
      };
    }
    reports = inspected.reports;
    failures = blockingFailures(reports);

    const critique = round < MAX_QA_ROUNDS ? await visionCritique(reports, input.brief, ctx) : null;
    const critiqueIsSubstantive =
      critique !== null && critique.length > 40 && !/^\s*(the page is fine|looks fine|no issues)/i.test(critique);

    ctx.run.emit({
      type: 'checks.updated',
      checks: reports.flatMap((r) => r.checks),
      screenshots: {
        desktop: reports.find((r) => r.viewport === 'desktop')?.screenshot ?? null,
        mobile: reports.find((r) => r.viewport === 'mobile')?.screenshot ?? null,
      },
    });

    round += 1;
    if (round > MAX_QA_ROUNDS) break;
    if (failures.length === 0 && !critiqueIsSubstantive) break;

    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'The page was built and checked in a browser. Fix what is listed, then build and check again.',
            '',
            formatChecks(reports),
            critiqueIsSubstantive
              ? `\n## A reviewer looked at the screenshots\n\nThese are opinions, not measurements. Act on the ones you agree with.\n\n${critique}`
              : '',
          ]
            .join('\n')
            .trim(),
        },
      ],
    });
  }

  /* ---------------------------------------------------- compressed result */

  const all = reports.flatMap((r) => r.checks);
  const advisory = all.filter((c) => !c.passed && !c.blocking);

  const lines = [
    summary || 'The builder finished without a summary.',
    '',
    `Browser checks: ${all.filter((c) => c.passed).length}/${all.length} passed after ${round} ${
      round === 1 ? 'round' : 'rounds'
    }.`,
  ];

  if (failures.length > 0) {
    lines.push('', 'Still failing:');
    for (const check of failures) {
      lines.push(`  - ${check.label} (${check.viewport}): ${check.detail}`);
    }
    lines.push('', 'Tell the owner about these rather than describing the site as finished.');
  }
  if (advisory.length > 0) {
    lines.push('', `Advisory: ${advisory.map((c) => c.label).join(', ')}.`);
  }

  return {
    content: lines.join('\n'),
    is_error: failures.length > 0,
    meta: { checks: all, blocking_failures: failures.length, rounds: round },
  };
}

const lastLines = (text: string, n: number) => text.split('\n').slice(-n).join('\n');
