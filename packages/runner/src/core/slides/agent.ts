/**
 * The deck sub-agent (PRD section 6.5).
 *
 * Same shape as the web builder: isolated context, a fixed starting point it
 * edits, and a build step that refuses work breaking the rules. Section 6.5's
 * adopt list is "outline, pick layouts from a template library, fill, render
 * HTML, export" - the layout library is the eight layouts in `deck.ts`, and the
 * outline is the deck itself, so there is no separate outlining pass to drift
 * from what gets built.
 *
 * The verification here measures the thing that actually ruins decks: text
 * overflowing a slide. A slide is a fixed box. Neither the model that wrote the
 * JSON nor anyone reading it can see that six bullets of nineteen words each
 * will run off the bottom, and a browser can see it exactly.
 */

import path from 'node:path';

import type { LLMMessage } from '../providers/interfaces.ts';
import { runAgent } from '../agent/engine.ts';
import { SLIDES_PROMPT, slidesContext } from '../agent/prompt.ts';
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
import { businessBrief } from '../business/profile.ts';
import { saveFile } from '../artifacts.ts';
import { parseDeck } from './deck.ts';
import { EXAMPLE_DECK } from './example.ts';
import { exportDeck } from './export.ts';

/** Where the agent works, relative to the sandbox working directory. */
const DECK_DIR = 'deck';
const DECK_FILE = `${DECK_DIR}/deck.json`;

/** Same ceiling as the web builder's visual QA, for the same reason. */
const MAX_QA_ROUNDS = 2;

/* ------------------------------------------------------------ build tool */

const slidesBuild: ToolDef = {
  name: 'slides_build',
  label: 'Build the deck',
  category: 'slides',
  description:
    'Validate deck.json, render it, export the PDF and the PPTX, and measure every slide in a ' +
    'browser. Reports rule failures by slide and field, and any slide whose text runs off the ' +
    'bottom. Run it after every change.',
  input_schema: { type: 'object', properties: {} },
  async run(_input, ctx) {
    let json: string;
    try {
      json = await ctx.sandbox.readFile(DECK_FILE);
    } catch {
      return { content: `there is no ${DECK_FILE} yet. Write it first.`, is_error: true };
    }

    const parsed = parseDeck(json);
    if ('problems' in parsed) {
      return {
        content:
          `The deck breaks ${parsed.problems.length} rule${parsed.problems.length === 1 ? '' : 's'}:\n\n` +
          parsed.problems.map((p) => `  - ${p}`).join('\n'),
        is_error: true,
      };
    }

    let rendered;
    try {
      rendered = await exportDeck(
        parsed.deck,
        path.join(ctx.sandbox.workdir, DECK_DIR, 'out'),
        'deck',
      );
    } catch (err) {
      return { content: `the deck would not render: ${message(err)}`, is_error: true };
    }

    ctx.onFilesChanged(await ctx.sandbox.listFiles());

    if (rendered.overflow.length > 0) {
      return {
        content:
          'The deck built, but text runs off the bottom of these slides. ' +
          'Cut words or move content to another slide:\n\n' +
          rendered.overflow
            .map((o) => `  - slide ${o.slide} overflows by ${o.by}px`)
            .join('\n'),
        is_error: true,
        meta: { overflow: rendered.overflow },
      };
    }

    return {
      content:
        `Built ${parsed.deck.slides.length} slides. Nothing overflows. ` +
        'PDF and PPTX written to deck/out/.',
      meta: {
        slides: parsed.deck.slides.length,
        pdf: rendered.pdf,
        pptx: rendered.pptx,
        screenshots: rendered.screenshots,
        design: parsed.deck.design,
        title: parsed.deck.title,
      },
    };
  },
};

export const SLIDES_TOOLS: ToolDef[] = [fileRead, fileWrite, fileEdit, fileList, slidesBuild];

/* -------------------------------------------------------------- the run */

export interface SlidesInput {
  brief: string;
}

export async function runSlides(input: SlidesInput, ctx: ToolContext): Promise<ToolResult> {
  const example = JSON.stringify(EXAMPLE_DECK, null, 2);
  await ctx.sandbox.writeFile(DECK_FILE, example);
  ctx.onFilesChanged(await ctx.sandbox.listFiles());

  const business = await businessBrief(
    ctx.deps.store.getProfile(ctx.projectId) ?? null,
    await ctx.deps.store.memories.recall(ctx.projectId, input.brief),
  );

  const messages: LLMMessage[] = [
    { role: 'user', content: slidesContext({ brief: input.brief, business, example }) },
  ];

  let summary = '';
  let round = 0;
  let built: ToolResult | null = null;

  for (;;) {
    const run = await runAgent({
      taskId: ctx.taskId,
      spec: {
        name: 'deck builder',
        system: SLIDES_PROMPT,
        tools: SLIDES_TOOLS,
        // The first turn writes every word on every slide. That is the
        // judgement, and it is worth the top tier once.
        tier: (turn) => (turn === 0 ? 'plan' : 'step'),
      },
      deps: ctx.deps,
      ctx,
      messages,
      budget: { ...ctx.budget, max_steps: round === 0 ? 20 : 8 },
      signal: ctx.signal,
      hooks: {
        nextSeq: ctx.nextSeq,
        onStepStarted: (step) => ctx.run.emit({ type: 'step.started', step }),
        onStepFinished: (step) => ctx.run.emit({ type: 'step.finished', step }),
        onUsage: (usage, cost) => ctx.run.emit({ type: 'usage', usage, cost_usd: cost }),
      },
    });

    summary = run.text || summary;

    if (run.outcome === 'cancelled') return { content: 'The deck was cancelled.', is_error: true };
    if (run.outcome === 'error') {
      return { content: `The deck builder stopped: ${run.error}`, is_error: true };
    }

    // Build it ourselves rather than trusting that it did. An agent that runs
    // out of steps mid-edit leaves a deck.json that does not validate and a
    // summary that says it is finished.
    built = await slidesBuild.run({}, ctx);
    round += 1;

    if (!built.is_error || round > MAX_QA_ROUNDS) break;

    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `The deck was built and checked. Fix this, then build again.\n\n${built.content}`,
        },
      ],
    });
  }

  if (built?.is_error) {
    return {
      content: `The deck still does not build after ${round} attempts:\n\n${built.content}`,
      is_error: true,
    };
  }

  /* ------------------------------------------------------------ filing it */

  const meta = built?.meta as
    | { pdf: string; pptx: string; slides: number; title: string; screenshots: string[] }
    | undefined;
  if (!meta) return { content: 'The deck built but produced no output.', is_error: true };

  const saved = [];
  for (const [file, kind] of [
    [meta.pdf, 'deck'],
    [meta.pptx, 'deck'],
  ] as const) {
    saved.push(
      await saveFile(ctx.deps.store, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        from: file,
        filename: `${slug(meta.title)}${path.extname(file)}`,
        kind,
      }),
    );
  }

  for (const [i, file] of saved.entries()) {
    ctx.run.emit({
      type: 'artifact.ready',
      kind: 'deck',
      label: `${meta.title} (${i === 0 ? 'PDF' : 'PowerPoint'})`,
      href: file.href,
    });
  }

  return {
    content: [
      summary || 'The deck is built.',
      '',
      `${meta.slides} slides. Nothing overflows.`,
      'Both a PDF and an editable PowerPoint file are filed for the owner.',
      'The PDF is the faithful one; the PowerPoint is the one they can edit, and it will look',
      'slightly different because PowerPoint lays text out its own way.',
    ].join('\n'),
    meta: { slides: meta.slides, files: saved.map((s) => s.href) },
  };
}

const slug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'deck';
