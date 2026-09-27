/**
 * The research sub-agent (PRD section 6.4).
 *
 * Shape, straight from section 6.4's adopt list: plan the questions, run a
 * researcher per question with isolated context, compress each, synthesise one
 * report with citations.
 *
 * Three things here are deliberate and worth keeping.
 *
 * **The fan-out is real.** Researchers run in parallel, each with its own
 * message list, and none of them sees the others' transcripts. That is what
 * keeps a six-question report from costing what one six-times-longer
 * conversation would, and it is why each one has to write a finding that stands
 * on its own.
 *
 * **Compression is the researcher's own last message**, not a separate call.
 * The researcher already knows what it found and what it discarded; asking a
 * second model to compress a transcript it did not gather loses sources, which
 * is the failure open_deep_research's compression prompt spends most of its
 * words guarding against.
 *
 * **Citation numbers are ours.** The registry hands out stable numbers for
 * every URL that was actually searched or read, researchers are told to cite
 * those, and the synthesiser is given the same list. A model left to number its
 * own sources across six parallel contexts produces brackets that look checked
 * and are not.
 */

import type { LLMContentBlock, LLMMessage } from '../providers/interfaces.ts';
import { runAgent, textOf } from '../agent/engine.ts';
import {
  RESEARCHER_PROMPT,
  RESEARCH_PLANNER_PROMPT,
  RESEARCH_SYNTHESIS_PROMPT,
  researcherContext,
} from '../agent/prompt.ts';
import { message, type ToolContext, type ToolDef, type ToolResult } from '../agent/tools.ts';
import { businessBrief } from '../business/profile.ts';
import { readPage } from './fetch.ts';
import { searchProvider } from './search.ts';
import { SourceRegistry } from './sources.ts';

/** PRD section 9 has no number for this; the owner set it. */
export const RESEARCH_BUDGET_USD = Number(process.env.RESEARCH_BUDGET_USD ?? 1.5);
export const MAX_PARALLEL_RESEARCHERS = Number(process.env.RESEARCH_PARALLEL ?? 6);

/**
 * The planner and the synthesiser are one call each and they bracket the whole
 * report, so they get a fixed slice rather than competing with the researchers
 * for what is left.
 */
const OVERHEAD_SHARE = 0.3;

/* -------------------------------------------------- the researcher's tools */

/**
 * Built per run, because each closes over that run's source registry. That is
 * also why they are not in the shared registry in `tools.ts`: two concurrent
 * reports must not share a numbering.
 */
function researcherTools(registry: SourceRegistry): ToolDef[] {
  const search = searchProvider();

  return [
    {
      name: 'search_web',
      label: 'Search',
      category: 'research',
      description:
        'Search the web. Returns a numbered list of results with snippets. The number beside ' +
        'each result is its citation number: use it in square brackets when you state something ' +
        'that came from it.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What you would type into a search box. Keywords, not a sentence.',
          },
        },
        required: ['query'],
      },
      async run(input) {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (!query) return { content: '`query` must be a non-empty string', is_error: true };

        let results;
        try {
          results = await search.search(query, 6);
        } catch (err) {
          return { content: `the search failed: ${message(err)}`, is_error: true };
        }

        if (results.length === 0) {
          return {
            content:
              `No results for "${query}".` +
              (search.name === 'fixtures'
                ? ' This run is using recorded fixtures rather than a live search, so only the ' +
                  'queries that were recorded return anything. Say what you could not find rather ' +
                  'than guessing at it.'
                : ' Try different words, or accept that this may not be published anywhere.'),
          };
        }

        const sources = registry.addMany(results);
        return {
          content: sources
            .map((source, i) => `[${source.n}] ${source.title}\n${source.url}\n${results[i].snippet}`)
            .join('\n\n'),
          meta: { count: sources.length },
        };
      },
    },

    {
      name: 'read_page',
      label: 'Read a page',
      category: 'research',
      description:
        'Open one of the URLs a search returned and read its text. Use it when the snippet is ' +
        'not enough, not as a matter of routine.',
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The full URL, from a search result.' } },
        required: ['url'],
      },
      async run(input) {
        const url = typeof input.url === 'string' ? input.url.trim() : '';
        if (!url) return { content: '`url` must be a non-empty string', is_error: true };

        try {
          const page = await readPage(url);
          const source = registry.markRead(url) ?? registry.add({ title: page.title, url });
          return {
            content: `[${source.n}] ${page.title}\n${page.url}\n\n${page.text}`,
            meta: { url, source: source.n },
          };
        } catch (err) {
          // A page that will not load is ordinary. The researcher should move on
          // rather than treat it as a reason to stop.
          return {
            content: `could not read ${url}: ${message(err)}. Use a different source.`,
            is_error: true,
          };
        }
      },
    },
  ];
}

/* ------------------------------------------------------------------- input */

export interface ResearchInput {
  question: string;
  /** Overrides the default ceiling for one report. */
  budgetUsd?: number;
}

export interface ResearchOutput extends ToolResult {
  /** The report markdown, so the caller can file it as an artifact. */
  report?: string;
}

/* --------------------------------------------------------------- the runs */

export async function runResearch(input: ResearchInput, ctx: ToolContext): Promise<ResearchOutput> {
  const budget = Math.max(0.2, input.budgetUsd ?? RESEARCH_BUDGET_USD);
  const registry = new SourceRegistry();
  const tools = researcherTools(registry);

  const business = await businessBrief(
    ctx.deps.store.getProfile(ctx.projectId) ?? null,
    await ctx.deps.store.memories.recall(ctx.projectId, input.question),
  );

  /* ------------------------------------------------------------- planning */

  let questions: string[];
  try {
    questions = await planQuestions(input.question, business, ctx);
  } catch (err) {
    return { content: `could not plan the research: ${message(err)}`, is_error: true };
  }

  ctx.run.emit({
    type: 'research.planned',
    questions,
  });

  /* ----------------------------------------------------------- researching */

  const perResearcher = (budget * (1 - OVERHEAD_SHARE)) / questions.length;

  // Parallel, and each with its own message list. `nextSeq` and the store are
  // both synchronous, so the interleaved step rows stay correctly ordered.
  const findings = await Promise.all(
    questions.map(async (question, index) => {
      const messages: LLMMessage[] = [
        {
          role: 'user',
          content: researcherContext({
            question,
            business,
            // What the others have already found, so six researchers do not
            // each pay to discover the same three pages.
            sources: index === 0 ? '' : registry.format(),
          }),
        },
      ];

      const run = await runAgent({
        taskId: ctx.taskId,
        spec: {
          name: `researcher: ${question.slice(0, 40)}`,
          system: RESEARCHER_PROMPT,
          tools,
          // Reading and summarising, not deciding. The mid tier is the right
          // place for it and this is where most of the spend goes.
          tier: () => 'step',
        },
        deps: ctx.deps,
        ctx,
        messages,
        budget: { max_steps: 10, max_cost_usd: perResearcher, max_ms: 4 * 60_000 },
        signal: ctx.signal,
        hooks: {
          nextSeq: ctx.nextSeq,
          onStepStarted: (step) => ctx.run.emit({ type: 'step.started', step }),
          onStepFinished: (step) => ctx.run.emit({ type: 'step.finished', step }),
          onUsage: (usage, cost) => ctx.run.emit({ type: 'usage', usage, cost_usd: cost }),
        },
      });

      return { question, finding: run.text.trim(), outcome: run.outcome };
    }),
  );

  const usable = findings.filter((f) => f.finding.length > 40);
  if (usable.length === 0) {
    return {
      content:
        'None of the researchers found anything usable. ' +
        (searchProvider().name === 'fixtures'
          ? 'This run used recorded search fixtures, which only cover the queries they were ' +
            'recorded for. A real report needs TAVILY_API_KEY.'
          : 'The searches returned nothing relevant.'),
      is_error: true,
    };
  }

  /* ---------------------------------------------------------- synthesising */

  const report = await synthesise(input.question, usable, registry, business, ctx);

  // Only the sources the report actually cites. A list of twenty when the text
  // cites six is padding, and it invites the reader to assume the other
  // fourteen were used.
  const cited = SourceRegistry.cited(report);
  const uncited = registry.all().filter((s) => !cited.has(s.n));

  ctx.run.emit({
    type: 'research.finished',
    sources: registry.all().filter((s) => cited.has(s.n)),
  });

  const notes = [
    `${usable.length} of ${questions.length} questions answered.`,
    `${cited.size} sources cited out of ${registry.all().length} found.`,
  ];
  if (uncited.length > 0) notes.push(`${uncited.length} found but not used.`);
  if (findings.some((f) => f.outcome === 'budget')) {
    notes.push('At least one researcher hit its budget and stopped early.');
  }

  return {
    content: `${report}\n\n---\n${notes.join(' ')}`,
    report,
    meta: { questions, sources: registry.all().length, cited: cited.size },
  };
}

/* ---------------------------------------------------------------- helpers */

async function planQuestions(
  question: string,
  business: string,
  ctx: ToolContext,
): Promise<string[]> {
  const response = await ctx.deps.llm.complete({
    system: RESEARCH_PLANNER_PROMPT,
    tools: [],
    // Planning is the judgement-heavy end of this. One call at the top tier is
    // cheap next to six researchers working the wrong questions.
    tier: 'plan',
    messages: [
      {
        role: 'user',
        content: business
          ? `## The request\n${question}\n\n## Who is asking\n${business}`
          : `## The request\n${question}`,
      },
    ],
    signal: ctx.signal,
  });

  ctx.deps.store.addTaskCost(ctx.taskId, response.cost_usd);

  const parsed = textOf(response.content)
    .split('\n')
    .map((line) => line.replace(/^\s*[-*\d.)\s]+/, '').trim())
    .filter((line) => line.length > 10 && line.length < 200)
    .slice(0, MAX_PARALLEL_RESEARCHERS);

  // A planner that returns prose instead of a list should not sink the report.
  // One researcher on the original question is a worse plan and a real answer.
  return parsed.length > 0 ? parsed : [question];
}

async function synthesise(
  question: string,
  findings: Array<{ question: string; finding: string }>,
  registry: SourceRegistry,
  business: string,
  ctx: ToolContext,
): Promise<string> {
  const body = findings
    .map((f) => `### ${f.question}\n\n${f.finding}`)
    .join('\n\n');

  const content: LLMContentBlock[] = [
    {
      type: 'text',
      text: [
        `## The request\n${question}`,
        business ? `\n## Who this is for\n${business}` : '',
        `\n## Sources, with their citation numbers\n${registry.format()}`,
        `\n## What the researchers found\n\n${body}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const response = await ctx.deps.llm.complete({
    system: RESEARCH_SYNTHESIS_PROMPT,
    tools: [],
    tier: 'plan',
    max_tokens: 16_000,
    messages: [{ role: 'user', content }],
    signal: ctx.signal,
  });

  ctx.deps.store.addTaskCost(ctx.taskId, response.cost_usd);
  return textOf(response.content).trim();
}
