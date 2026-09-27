/**
 * The orchestrator: one task, from prompt to outcome.
 *
 * The loop itself lives in `engine.ts` and is shared with the sub-agents. What
 * is here is everything that is true of a *task* and not of an agent: the task
 * row, the sandbox lifecycle, the run bus the UI watches, the pause while the
 * owner answers a question, and capturing whatever the task produced as a
 * versioned artifact.
 */

import type { SandboxProvider } from '../providers/interfaces.ts';
import type { LLMMessage, LLMProvider, TraceSink } from '../providers/interfaces.ts';
import type { Store } from '../db/store.ts';
import { cacheHitRate, type TaskStatus, type Usage } from '../types.ts';
import { DEFAULT_BUDGET, message, runAgent, type Budget, type EngineDeps } from './engine.ts';
import { ORCHESTRATOR_PROMPT, taskContext } from './prompt.ts';
import { ORCHESTRATOR_TOOLS, type ToolContext } from './tools.ts';
import { closeRun, openRun, type Run } from './bus.ts';
import { captureVersion } from '../site/workspace.ts';
import { businessBrief } from '../business/profile.ts';

export { DEFAULT_BUDGET };
export type { Budget };

export interface RunDeps extends EngineDeps {
  sandboxes: SandboxProvider;
  llm: LLMProvider;
  trace: TraceSink;
  store: Store;
}

export interface RunResult {
  status: TaskStatus;
  usage: Usage;
  cost_usd: number;
  cache_hit_rate: number;
  steps: number;
  error: string | null;
  /** Set when the task produced a site version. */
  site_version: number | null;
}

export async function runTask(
  taskId: string,
  deps: RunDeps,
  budget: Budget = DEFAULT_BUDGET,
  signal?: AbortSignal,
): Promise<RunResult> {
  const { store, sandboxes } = deps;
  const task = store.getTask(taskId);
  if (!task) throw new Error(`no such task: ${taskId}`);

  const run = openRun(taskId);
  let seq = 0;
  let siteVersion: number | null = null;

  store.startTask(taskId);
  run.emit({ type: 'task.started', task_id: taskId });

  const sandbox = await sandboxes.create(taskId);

  const ctx: ToolContext = {
    sandbox,
    projectId: task.project_id,
    taskId,
    deps,
    budget,
    signal,
    run,
    onFilesChanged: (paths) => run.emit({ type: 'files.changed', paths }),
    askUser: (question) => waitForAnswer(run, question, signal),
    nextSeq: () => seq++,
  };

  // The profile plus every fact the owner has confirmed. Unconfirmed memories
  // are not returned by `recall`, so they cannot reach a prompt.
  const business = await businessBrief(
    store.getProfile(task.project_id) ?? null,
    await store.memories.recall(task.project_id, ''),
  );

  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: taskContext({ goal: task.prompt, business, workdir: sandbox.workdir }),
    },
  ];

  let status: TaskStatus = 'running';
  let result;

  try {
    result = await runAgent({
      taskId,
      spec: {
        name: 'assistant turn',
        system: ORCHESTRATOR_PROMPT,
        tools: ORCHESTRATOR_TOOLS,
        // Planning goes to the top tier, everything after it to the mid tier.
        // Routing by step type is the cost lever PRD section 10 asks for.
        tier: (turn) => (turn === 0 ? 'plan' : 'step'),
      },
      deps,
      ctx,
      messages,
      budget,
      signal,
      hooks: {
        nextSeq: () => seq++,
        onStepStarted: (step) => run.emit({ type: 'step.started', step }),
        onStepFinished: (step) => run.emit({ type: 'step.finished', step }),
        onText: (delta) => run.emit({ type: 'assistant.text', text: delta }),
        onUsage: (usage, costUsd) => run.emit({ type: 'usage', usage, cost_usd: costUsd }),
        onToolResult: async (name, _input, toolResult) => {
          // The plan panel renders todo.md. Reading it back rather than
          // trusting the write keeps the panel honest about what is on disk.
          if (name === 'file_write' && toolResult.meta?.is_plan) {
            try {
              run.emit({ type: 'plan.updated', todo: await sandbox.readFile('todo.md') });
            } catch {
              /* the model may have written it elsewhere; not worth failing */
            }
          }
        },
      },
    });

    status =
      result.outcome === 'finished'
        ? 'succeeded'
        : result.outcome === 'cancelled'
          ? 'cancelled'
          : 'failed';

    // Whatever the task built, keep it. The sandbox is about to be destroyed,
    // and a site the owner cannot open again was not delivered.
    if (status === 'succeeded') {
      const captured = await captureVersion(task.project_id, taskId, sandbox, store);
      if (captured) {
        siteVersion = captured.version;
        run.emit({
          type: 'site.version',
          version: captured.version,
          preview_url: captured.preview_url,
        });
      }
    }
  } catch (err) {
    status = 'failed';
    result = {
      outcome: 'error' as const,
      text: '',
      messages,
      usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      cost_usd: 0,
      steps: seq,
      error: message(err),
    };
  } finally {
    await sandbox.dispose();
    await deps.trace.flush();
  }

  store.finishTask(taskId, status, result.error);

  // Charge what it used and give the rest of the hold back. Idempotent per
  // task, so a retry or a double finish cannot refund twice.
  const owner = store.userForTask(taskId);
  if (owner) {
    const balance = store.ledger.settle(owner, taskId, result.cost_usd);
    run.emit({ type: 'balance', balance_usd: balance, spent_usd: result.cost_usd });
  }

  run.emit({ type: 'task.finished', status, error: result.error });
  closeRun(taskId);

  return {
    status,
    usage: result.usage,
    cost_usd: result.cost_usd,
    cache_hit_rate: cacheHitRate(result.usage),
    steps: seq,
    error: result.error,
    site_version: siteVersion,
  };
}

/**
 * Park the loop until the owner answers.
 *
 * In Phase 0 this was a promise held in memory and it still is: an unanswered
 * question dies with the process. Phase 3's approval gates need this to survive
 * a restart, which is the durable wait Inngest exists for. The tool-side shape
 * does not change when it moves.
 */
function waitForAnswer(run: Run, question: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    run.pendingQuestion = {
      question,
      resolve: (answer) => {
        run.pendingQuestion = null;
        resolve(answer);
      },
    };
    run.emit({ type: 'question', question, step_id: '' });
    signal?.addEventListener('abort', () => {
      run.pendingQuestion = null;
      reject(new Error('cancelled while waiting for the owner'));
    });
  });
}
