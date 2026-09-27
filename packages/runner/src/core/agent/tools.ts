/**
 * The tool registry.
 *
 * Two rules from PRD section 6.1 shape this file.
 *
 * **The set is stable within a run.** Tools are not added or removed mid-task.
 * The tool definitions render before the system prompt and sit inside the
 * cached prefix, so a changed tool list is a cache miss on every remaining
 * request - and a model that saw a tool on turn 3 and not on turn 4 will
 * reference one that no longer exists. Each agent has its own fixed set,
 * composed at the bottom of this file.
 *
 * **Names are namespaced by prefix.** `shell_`, `file_`, `site_`, `ask_`. The
 * prefix is what the UI groups by and what a later phase will gate on, so a new
 * tool joins an existing family by being named into it.
 *
 * The name-to-label mapping is a lean version of a pattern in kortix-ai/suna
 * (studied for structure only - that repo is Elastic Licence 2.0 and none of
 * its code is here; see THIRD_PARTY_NOTICES.md).
 */

import type { LLMTool, Sandbox } from '../providers/interfaces.ts';
import type { Budget, EngineDeps } from './engine.ts';
import type { Run } from './bus.ts';

export type { ToolCategory } from './tool-labels.ts';
export { describeTool } from './tool-labels.ts';

import type { ToolCategory } from './tool-labels.ts';

export interface ToolContext {
  sandbox: Sandbox;
  projectId: string;
  taskId: string;
  /** Sub-agents need the same store, model and trace sink the caller has. */
  deps: EngineDeps;
  budget: Budget;
  signal?: AbortSignal;
  /** The run bus, so a sub-agent's progress reaches the same stream. */
  run: Run;
  /** Called when a tool writes something, so the UI's file list can refresh. */
  onFilesChanged: (paths: string[]) => void;
  /** Called by `ask_user`; resolves when the owner answers. */
  askUser: (question: string) => Promise<string>;
  /** The caller's step counter, shared so sub-agent steps interleave correctly. */
  nextSeq: () => number;
}

export interface ToolResult {
  content: string;
  is_error?: boolean;
  /** Surfaced separately from the model-facing content. */
  meta?: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  /** Human label for the step card. */
  label: string;
  category: ToolCategory;
  description: string;
  input_schema: LLMTool['input_schema'];
  /** True when the model should stop and wait rather than loop on. */
  pauses?: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`\`${field}\` must be a non-empty string`);
  }
  return v;
};

const TAIL_LINES = 60;

function tail(text: string, lines = TAIL_LINES): string {
  const all = text.split('\n');
  if (all.length <= lines) return text;
  return `… [${all.length - lines} earlier lines omitted]\n${all.slice(-lines).join('\n')}`;
}

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ------------------------------------------------------------- file tools */

export const fileRead: ToolDef = {
  name: 'file_read',
  label: 'Read file',
  category: 'files',
  description:
    'Read a UTF-8 text file from the sandbox. Paths are relative to the working directory.',
  input_schema: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Path relative to the working directory.' } },
    required: ['path'],
  },
  async run(input, ctx) {
    const path = str(input.path, 'path');
    try {
      const contents = await ctx.sandbox.readFile(path);
      return { content: contents, meta: { path, bytes: contents.length } };
    } catch (err) {
      return { content: `could not read ${path}: ${message(err)}`, is_error: true };
    }
  },
};

export const fileWrite: ToolDef = {
  name: 'file_write',
  label: 'Write file',
  category: 'edit',
  description:
    'Write a UTF-8 text file in the sandbox, creating parent directories as needed. ' +
    'Overwrites the file if it exists. Use this for `todo.md` and for any file you are creating. ' +
    'To change part of an existing file, prefer file_edit.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the working directory.' },
      contents: { type: 'string', description: 'The full file contents.' },
    },
    required: ['path', 'contents'],
  },
  async run(input, ctx) {
    const path = str(input.path, 'path');
    const contents = typeof input.contents === 'string' ? input.contents : '';
    try {
      await ctx.sandbox.writeFile(path, contents);
      ctx.onFilesChanged(await ctx.sandbox.listFiles());
      return {
        content: `wrote ${path} (${contents.length} bytes)`,
        meta: { path, bytes: contents.length, is_plan: path === 'todo.md' },
      };
    } catch (err) {
      return { content: `could not write ${path}: ${message(err)}`, is_error: true };
    }
  },
};

/**
 * Exact-string replacement.
 *
 * PRD section 6.3 says to edit by diff rather than rewriting whole files, and
 * the reason is not only tokens: a full rewrite of a file to change one
 * sentence is a chance to lose the rest of it. The uniqueness requirement is
 * what makes the edit unambiguous - if `old` appears twice, the model has to
 * say which one by including more context.
 */
export const fileEdit: ToolDef = {
  name: 'file_edit',
  label: 'Edit file',
  category: 'edit',
  description:
    'Replace an exact string in a file. `old` must appear exactly once - include surrounding ' +
    'lines if it does not. This is the right tool for changing a sentence, a value or a block ' +
    'in a file that is otherwise correct.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to the working directory.' },
      old: { type: 'string', description: 'The exact text to replace, including whitespace.' },
      new: { type: 'string', description: 'What to replace it with.' },
    },
    required: ['path', 'old', 'new'],
  },
  async run(input, ctx) {
    const path = str(input.path, 'path');
    const oldText = str(input.old, 'old');
    const newText = typeof input.new === 'string' ? input.new : '';

    let contents: string;
    try {
      contents = await ctx.sandbox.readFile(path);
    } catch (err) {
      return { content: `could not read ${path}: ${message(err)}`, is_error: true };
    }

    const occurrences = contents.split(oldText).length - 1;
    if (occurrences === 0) {
      return {
        content:
          `\`old\` does not appear in ${path}. Read the file again - it may have changed, ` +
          'or the whitespace may differ from what you sent.',
        is_error: true,
      };
    }
    if (occurrences > 1) {
      return {
        content:
          `\`old\` appears ${occurrences} times in ${path}, so this edit is ambiguous. ` +
          'Include more surrounding text so it matches exactly once.',
        is_error: true,
      };
    }

    await ctx.sandbox.writeFile(path, contents.replace(oldText, newText));
    ctx.onFilesChanged(await ctx.sandbox.listFiles());
    return {
      content: `edited ${path} (${oldText.length} chars replaced with ${newText.length})`,
      meta: { path },
    };
  },
};

export const fileList: ToolDef = {
  name: 'file_list',
  label: 'List files',
  category: 'files',
  description: 'List the files in the sandbox, relative to the working directory.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Subdirectory to list. Defaults to the working directory.' },
    },
  },
  async run(input, ctx) {
    const files = await ctx.sandbox.listFiles(
      typeof input.path === 'string' ? input.path : undefined,
    );
    return {
      content: files.length ? files.join('\n') : '(empty)',
      meta: { count: files.length },
    };
  },
};

/* ------------------------------------------------------------ shell & ask */

export const shellExec: ToolDef = {
  name: 'shell_exec',
  label: 'Run command',
  category: 'shell',
  description:
    'Run a bash command in the sandbox working directory. Returns stdout, stderr and the exit ' +
    'code. The command is killed after the timeout. Redirect long output to a file rather than ' +
    'printing it.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to run.' },
      cwd: {
        type: 'string',
        description: 'Directory to run in, relative to the working directory. Defaults to it.',
      },
      timeout_ms: {
        type: 'number',
        description: 'Kill the command after this many milliseconds. Default 60000.',
      },
    },
    required: ['command'],
  },
  async run(input, ctx) {
    const command = str(input.command, 'command');
    const result = await ctx.sandbox.exec(command, {
      cwd: typeof input.cwd === 'string' ? input.cwd : undefined,
      timeout_ms: typeof input.timeout_ms === 'number' ? input.timeout_ms : undefined,
    });

    ctx.onFilesChanged(await ctx.sandbox.listFiles());

    const parts = [`exit_code: ${result.exit_code}`];
    if (result.timed_out) parts.push('TIMED OUT');
    if (result.stdout.trim()) parts.push(`stdout:\n${tail(result.stdout)}`);
    if (result.stderr.trim()) parts.push(`stderr:\n${tail(result.stderr)}`);
    if (!result.stdout.trim() && !result.stderr.trim()) parts.push('(no output)');

    return {
      content: parts.join('\n'),
      // Non-zero exit is marked as an error so the failure stays visible to the
      // model rather than reading as a successful step (adopt rule 5).
      is_error: result.exit_code !== 0,
      meta: { exit_code: result.exit_code, timed_out: result.timed_out },
    };
  },
};

export const askUser: ToolDef = {
  name: 'ask_user',
  label: 'Ask the owner',
  category: 'ask',
  description:
    'Ask the business owner one question and wait for the answer. Use only when you are genuinely ' +
    'blocked - a detail only they know, or a decision with materially different outcomes. Do not ' +
    'use it to check a choice you could reasonably make yourself.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One clear question, in plain language.' },
    },
    required: ['question'],
  },
  pauses: true,
  async run(input, ctx) {
    const question = str(input.question, 'question');
    const answer = await ctx.askUser(question);
    return { content: answer, meta: { question } };
  },
};

/* ------------------------------------------------------------- site tools */

export const siteCreate: ToolDef = {
  name: 'site_create',
  label: 'Build the site',
  category: 'site',
  description:
    'Hand a brief to the web builder, which fills the landing-page template, builds it, and ' +
    'checks the result in a real browser at phone and desktop widths. Returns a summary, a ' +
    'version number and the check results. The builder cannot see this conversation, so put ' +
    'everything it needs in the brief: what the business does, who for, where, how long they ' +
    'have traded, what makes them different, and what the page should get a visitor to do.',
  input_schema: {
    type: 'object',
    properties: {
      brief: {
        type: 'string',
        description:
          'Everything the builder needs, in plain sentences. Several paragraphs is right.',
      },
      from_version: {
        type: 'number',
        description:
          'Start from this existing version instead of the blank template. Use this for edits, ' +
          'and describe only what should change in the brief.',
      },
    },
    required: ['brief'],
  },
  async run(input, ctx) {
    // Deferred so this module and the builder do not form an import cycle.
    const { runWebBuilder } = await import('../site/builder.ts');
    return runWebBuilder(
      {
        brief: str(input.brief, 'brief'),
        fromVersion: typeof input.from_version === 'number' ? input.from_version : null,
      },
      ctx,
    );
  },
};

/**
 * Propose a fact about the business (PRD section 6.6).
 *
 * The write is gated: this records the fact as unconfirmed, and `recall`
 * returns confirmed facts only. So calling this cannot change what a later task
 * believes until the owner has agreed to it, which is the property section 6.6
 * is asking for and the reason it is not simply a write.
 */
export const memoryRemember: ToolDef = {
  name: 'memory_remember',
  label: 'Remember a fact',
  category: 'memory',
  description:
    'Propose a durable fact about this business for the owner to confirm. Use it for things that ' +
    'will still be true next month and that you would otherwise have to ask about again: how they ' +
    'price, what they will not take on, who their competitors are, words they dislike. ' +
    'One fact per call, one or two sentences. ' +
    'Do not use it for anything about a single task, and never for passwords, keys, card numbers ' +
    'or personal identifiers.',
  input_schema: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'The fact, written so it makes sense on its own in six months.',
      },
    },
    required: ['fact'],
  },
  async run(input, ctx) {
    const fact = str(input.fact, 'fact');
    try {
      const memory = await ctx.deps.store.memories.remember(ctx.projectId, fact, ctx.taskId);
      ctx.run.emit({ type: 'memory.proposed', memory_id: memory.id, text: memory.text });
      return {
        content:
          `Noted, and waiting for the owner to confirm it: "${memory.text}"\n` +
          'It will not be used until they do, so do not rely on it in this task.',
        meta: { memory_id: memory.id },
      };
    } catch (err) {
      return { content: message(err), is_error: true };
    }
  },
};

/**
 * Market and competitor research (PRD section 6.4).
 *
 * Like `site_create`, this hands the work to a specialist that cannot see this
 * conversation, so the question has to carry its own context. It fans out into
 * parallel researchers with their own contexts, so the cost is roughly the
 * number of questions rather than the length of one very long conversation.
 */
export const researchRun: ToolDef = {
  name: 'research_run',
  label: 'Research',
  category: 'research',
  description:
    'Research a market, a competitor or a question about the industry, and get back a written ' +
    'report with citations. It searches, reads sources, and cites what it used. ' +
    'Ask one question at a time and make it specific: "what do damp surveyors charge in Bristol" ' +
    'rather than "research the market". It already knows about the business, so do not repeat ' +
    'that. It cannot answer questions about the owner\'s own numbers, only about what is published.',
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question, in a sentence. Specific enough that a person could look it up.',
      },
      budget_usd: {
        type: 'number',
        description: 'Ceiling for this report. Defaults to the configured budget.',
      },
    },
    required: ['question'],
  },
  async run(input, ctx) {
    const { runResearch } = await import('../research/agent.ts');
    const { saveText } = await import('../artifacts.ts');

    const question = str(input.question, 'question');
    const result = await runResearch(
      {
        question,
        budgetUsd: typeof input.budget_usd === 'number' ? input.budget_usd : undefined,
      },
      ctx,
    );

    if (!result.report) return result;

    // Kept where the owner can open it, and in the sandbox where the rest of
    // the task can read it without it going back through the conversation.
    const filename = `${slug(question)}.md`;
    await ctx.sandbox.writeFile(`research/${filename}`, result.report);
    ctx.onFilesChanged(await ctx.sandbox.listFiles());

    const saved = await saveText(ctx.deps.store, {
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      filename,
      contents: result.report,
      kind: 'report',
    });

    ctx.run.emit({
      type: 'artifact.ready',
      kind: 'report',
      label: question.slice(0, 80),
      href: saved.href,
    });

    return {
      ...result,
      content:
        `${result.content}\n\nSaved to \`research/${filename}\` in the sandbox, and filed for the owner.`,
    };
  },
};

/**
 * A slide deck (PRD section 6.5).
 *
 * Another specialist with its own context, so the brief carries everything:
 * what the deck is for, who is in the room, and what should happen after it.
 * "Who is in the room" is the part most often left out and the part that
 * changes the deck most.
 */
export const slidesCreate: ToolDef = {
  name: 'slides_create',
  label: 'Build a deck',
  category: 'slides',
  description:
    'Build a slide deck and get back a PDF and an editable PowerPoint file. Say what the deck is ' +
    'for, who will be in the room, how long they have, and what you want to happen afterwards. ' +
    'It already knows about the business, so do not repeat that. ' +
    'It will not invent figures: any number you want on a slide has to be in the brief.',
  input_schema: {
    type: 'object',
    properties: {
      brief: {
        type: 'string',
        description:
          'What the deck is for, who the audience is, and what it should get them to do. ' +
          'Include any figures that should appear on it.',
      },
    },
    required: ['brief'],
  },
  async run(input, ctx) {
    const { runSlides } = await import('../slides/agent.ts');
    return runSlides({ brief: str(input.brief, 'brief') }, ctx);
  },
};

/**
 * Social posts and cold emails (PRD section 6.7).
 *
 * Drafts only. The specialist behind this has no way to send anything: the sole
 * route to a provider is the approval gate, and the gate needs a row the owner
 * has approved. So the worst this can produce is a queue of drafts nobody
 * wants.
 */
export const growthDraft: ToolDef = {
  name: 'growth_draft',
  label: 'Draft content',
  category: 'growth',
  description:
    'Draft social posts or cold emails and put them in the owner\'s approval queue. ' +
    'Say what the content is for, which platforms, roughly how many, and anything specific that ' +
    'should be in it - a job just finished, a season starting, a price change. ' +
    'It already knows about the business. ' +
    'Nothing is sent: every item waits for the owner to approve it, and you should say so rather ' +
    'than describing the work as done.',
  input_schema: {
    type: 'object',
    properties: {
      brief: {
        type: 'string',
        description:
          'What to write, for which platform or recipient, and anything specific to include.',
      },
    },
    required: ['brief'],
  },
  async run(input, ctx) {
    const { runGrowth } = await import('../growth/agent.ts');
    return runGrowth({ brief: str(input.brief, 'brief') }, ctx);
  },
};

export const siteDeploy: ToolDef = {
  name: 'site_deploy',
  label: 'Publish the site',
  category: 'deploy',
  description:
    'Publish a built version of the site and return its URL. Defaults to the latest version. ' +
    'Publishing to a public host needs the owner to approve it first; publishing locally does not.',
  input_schema: {
    type: 'object',
    properties: {
      version: { type: 'number', description: 'Which version to publish. Defaults to the latest.' },
    },
  },
  async run(input, ctx) {
    const { deploySite } = await import('../site/deploy.ts');
    return deploySite(typeof input.version === 'number' ? input.version : null, ctx);
  },
};

/* ------------------------------------------------------------- the sets */

/** What the orchestrator can do. Fixed for the life of a task. */
export const ORCHESTRATOR_TOOLS: ToolDef[] = [
  shellExec,
  fileRead,
  fileWrite,
  fileList,
  askUser,
  memoryRemember,
  researchRun,
  siteCreate,
  slidesCreate,
  growthDraft,
  siteDeploy,
];

const ALL = new Map<string, ToolDef>();
for (const tool of [
  shellExec,
  fileRead,
  fileWrite,
  fileEdit,
  fileList,
  askUser,
  memoryRemember,
  researchRun,
  siteCreate,
  slidesCreate,
  growthDraft,
  siteDeploy,
]) {
  ALL.set(tool.name, tool);
}

export function getTool(name: string): ToolDef | undefined {
  return ALL.get(name);
}

/**
 * The definitions handed to the model, sorted by name.
 *
 * Sorted because the cache key is the serialised prefix: the same set of tools
 * in a different order is a different prefix and therefore a full-price request.
 */
export function toolDefinitions(tools: ToolDef[] = ORCHESTRATOR_TOOLS): LLMTool[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

/** A filename from a sentence. Short, because it ends up in a URL. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .split('-')
      .slice(0, 8)
      .join('-') || 'report'
  );
}
