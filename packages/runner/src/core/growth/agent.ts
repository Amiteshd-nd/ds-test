/**
 * The growth sub-agent (PRD section 6.7).
 *
 * It drafts and it queues. It cannot send, and that is not a matter of it being
 * told not to: the only route to a provider is `gate.execute`, which needs a
 * token only the gate can mint, and the gate mints one only for an approval row
 * the owner has approved. The agent's tools do not include anything that
 * touches a provider.
 *
 * So the worst case here is a queue full of drafts nobody wants, which someone
 * rejects in a few clicks.
 */

import type { LLMMessage } from '../providers/interfaces.ts';
import { runAgent } from '../agent/engine.ts';
import { GROWTH_PROMPT, growthContext } from '../agent/prompt.ts';
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
import { latestVersion } from '../site/workspace.ts';
import { describeAction, parseAction, summariseAction, type OutwardAction } from './actions.ts';

/** One call should be able to queue a month of posts, and not much more. */
const MAX_ITEMS = 30;

/* ------------------------------------------------------------- queue tool */

const growthQueue: ToolDef = {
  name: 'growth_queue',
  label: 'Queue for approval',
  category: 'growth',
  description:
    'Put drafts in the owner\'s approval queue. Send all of them in one call. ' +
    'Each is checked against the platform limits and the copy rules, and anything that fails ' +
    'comes back with the reason so you can fix it and call again. ' +
    'Nothing is sent by this: the owner approves each item, and only then does it go out.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description:
          'The drafts. A social_post needs platform and text; an email needs to, subject, body, ' +
          'from_identity and opt_out. Either may carry scheduled_for as an ISO timestamp.',
        items: { type: 'object' },
      },
    },
    required: ['items'],
  },
  async run(input, ctx) {
    const raw = input.items;
    if (!Array.isArray(raw) || raw.length === 0) {
      return { content: '`items` must be a non-empty array of drafts.', is_error: true };
    }
    if (raw.length > MAX_ITEMS) {
      return {
        content: `${raw.length} items in one call. Queue at most ${MAX_ITEMS}.`,
        is_error: true,
      };
    }

    const queued: string[] = [];
    const rejected: string[] = [];

    for (const [index, item] of raw.entries()) {
      const parsed = parseAction(item);
      if ('problems' in parsed) {
        rejected.push(`item ${index + 1}: ${parsed.problems.join(' ')}`);
        continue;
      }

      const scheduledFor = readSchedule((item as { scheduled_for?: unknown }).scheduled_for);
      if (scheduledFor instanceof Error) {
        rejected.push(`item ${index + 1}: ${scheduledFor.message}`);
        continue;
      }

      const approval = ctx.deps.store.createApproval(
        ctx.taskId,
        parsed.action.kind,
        parsed.action,
        { projectId: ctx.projectId, scheduledFor },
      );

      ctx.run.emit({
        type: 'approval.queued',
        approval_id: approval.id,
        label: describeAction(parsed.action),
        summary: summariseAction(parsed.action),
        scheduled_for: scheduledFor,
      });

      queued.push(
        `${describeAction(parsed.action)}${scheduledFor ? ` for ${scheduledFor}` : ''}: ` +
          summariseAction(parsed.action),
      );
    }

    const lines: string[] = [];
    if (queued.length > 0) {
      lines.push(`Queued ${queued.length} for the owner to approve:`, ...queued.map((q) => `  - ${q}`));
    }
    if (rejected.length > 0) {
      lines.push(
        '',
        `${rejected.length} rejected. Fix these and queue them again:`,
        ...rejected.map((r) => `  - ${r}`),
      );
    }

    return {
      content: lines.join('\n'),
      is_error: rejected.length > 0,
      meta: { queued: queued.length, rejected: rejected.length },
    };
  },
};

/** ISO, and not in the past. A schedule already behind us fires immediately. */
function readSchedule(value: unknown): string | null | Error {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return new Error('scheduled_for must be an ISO timestamp string.');

  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return new Error(`"${value}" is not a date. Use an ISO timestamp, like 2026-10-02T09:00:00Z.`);
  }
  if (at < Date.now() - 60_000) {
    return new Error(`${value} is in the past. Schedule it ahead, or leave scheduled_for out.`);
  }
  return new Date(at).toISOString();
}

export const GROWTH_TOOLS: ToolDef[] = [fileRead, fileWrite, fileEdit, fileList, growthQueue];

/* --------------------------------------------------------------- the run */

export interface GrowthInput {
  brief: string;
}

export async function runGrowth(input: GrowthInput, ctx: ToolContext): Promise<ToolResult> {
  const business = await businessBrief(
    ctx.deps.store.getProfile(ctx.projectId) ?? null,
    await ctx.deps.store.memories.recall(ctx.projectId, input.brief),
  );

  // A post is worth more with somewhere to send people. If the business has a
  // published site, the drafter gets its URL.
  const site = await latestVersion(ctx.projectId);

  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: growthContext({
        brief: input.brief,
        business,
        today: new Date().toISOString().slice(0, 10),
        siteUrl: site?.deployed_url ?? null,
      }),
    },
  ];

  const run = await runAgent({
    taskId: ctx.taskId,
    spec: {
      name: 'content drafter',
      system: GROWTH_PROMPT,
      tools: GROWTH_TOOLS,
      // The first turn writes every word. After that it is fixing what the
      // queue rejected, which is mechanical.
      tier: (turn) => (turn === 0 ? 'plan' : 'step'),
    },
    deps: ctx.deps,
    ctx,
    messages,
    budget: { ...ctx.budget, max_steps: 12 },
    signal: ctx.signal,
    hooks: {
      nextSeq: ctx.nextSeq,
      onStepStarted: (step) => ctx.run.emit({ type: 'step.started', step }),
      onStepFinished: (step) => ctx.run.emit({ type: 'step.finished', step }),
      onUsage: (usage, cost) => ctx.run.emit({ type: 'usage', usage, cost_usd: cost }),
    },
  });

  if (run.outcome === 'cancelled') return { content: 'The drafting was cancelled.', is_error: true };
  if (run.outcome === 'error') {
    return { content: `The drafter stopped: ${run.error}`, is_error: true };
  }

  // Count what is actually in the queue rather than trusting the summary: a
  // drafter that ran out of steps mid-fix reports success it did not have.
  const pending = ctx.deps.store
    .listApprovals(ctx.projectId)
    .filter((a) => a.task_id === ctx.taskId && a.status === 'pending');

  if (pending.length === 0) {
    return {
      content:
        'Nothing reached the queue. ' +
        (run.text ? `The drafter said: ${run.text}` : 'It produced no drafts that passed the checks.'),
      is_error: true,
    };
  }

  const scheduled = pending.filter((a) => a.scheduled_for).length;

  return {
    content: [
      run.text || 'Drafts are queued.',
      '',
      `${pending.length} item${pending.length === 1 ? '' : 's'} waiting for the owner to approve` +
        (scheduled > 0 ? `, ${scheduled} of them with a time set.` : '.'),
      'Nothing goes out until they do. Tell them to look at the queue rather than saying it is done.',
    ].join('\n'),
    meta: { queued: pending.length, scheduled },
  };
}

export type { OutwardAction };
export { message };
