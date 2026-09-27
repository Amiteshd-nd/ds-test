import { NextResponse } from 'next/server';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { runTask, DEFAULT_BUDGET } from '@/core/agent/loop';
import { admit } from '@/core/billing/admission';
import { llmProvider, sandboxProvider, traceSink } from '@/core/providers/registry';

export const runtime = 'nodejs';

/**
 * Enqueue a task and start it.
 *
 * "Enqueue" is generous in Phase 0: the loop runs in this process, detached from
 * the request, and the client follows it over SSE. PRD section 5 puts Inngest
 * here, and it belongs there — a task that outlives one server process needs a
 * durable runtime, not a floating promise. What this shape does buy is that the
 * response returns immediately and progress arrives on a separate channel,
 * which is the part the client contract depends on and the part that does not
 * change when Inngest lands.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    project_id?: unknown;
    prompt?: unknown;
    type?: unknown;
  };

  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!projectId || !prompt) {
    return NextResponse.json({ error: 'project_id and prompt are required' }, { status: 400 });
  }

  let user;
  try {
    user = await assertOwnsProject(projectId);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const store = getStore();
  const type = typeof body.type === 'string' ? body.type : 'general';
  const task = store.createTask(projectId, type, prompt);

  /*
   * Credit and quotas, before anything is started.
   *
   * The task row is created first so the hold has something to reference and
   * so a refusal is still visible in the history - "you asked for this and it
   * did not run, here is why" is more useful than no record at all.
   */
  const admission = admit(store, user.id, task.id);
  if (!admission.ok) {
    store.finishTask(task.id, 'failed', admission.reason);
    // 402: the request was fine, there is just no credit or no room for it.
    return NextResponse.json(
      { error: admission.reason, balance_usd: admission.balance_usd, task },
      { status: 402 },
    );
  }

  let deps;
  try {
    deps = { store, llm: llmProvider(), sandboxes: sandboxProvider(), trace: traceSink() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    store.finishTask(task.id, 'failed', error);
    return NextResponse.json({ error }, { status: 500 });
  }

  // Deliberately not awaited. The loop reports through the bus; the store holds
  // the record if this process dies before it finishes.
  void runTask(task.id, deps, {
    ...DEFAULT_BUDGET,
    // What the admission reserved, which is the lesser of the plan's per-task
    // ceiling and what is actually left.
    max_cost_usd: admission.budget_usd,
    max_ms: admission.plan.max_task_seconds * 1000,
  }).catch((err) => {
    store.finishTask(task.id, 'failed', err instanceof Error ? err.message : String(err));
    store.ledger.release(user.id, task.id, 'task crashed before settling');
  });

  return NextResponse.json(
    { task, budget_usd: admission.budget_usd, balance_usd: admission.balance_usd },
    { status: 202 },
  );
}
