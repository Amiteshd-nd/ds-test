import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runTask, DEFAULT_BUDGET } from '../agent/loop.ts';
import { Store } from '../db/store.ts';
import { LocalSandboxProvider } from '../providers/sandbox-local.ts';
import { ScriptedProvider, helloWorldScript, type Script } from '../providers/llm-scripted.ts';
import { NullTraceSink } from '../providers/trace-jsonl.ts';

function fixture(script: Script = helloWorldScript) {
  const db = path.join(mkdtempSync(path.join(tmpdir(), 'runner-loop-')), 'runner.db');
  const store = new Store(db);
  const user = store.upsertUser(`t${Math.random()}@localhost`);
  const project = store.createProject(user.id, 'Test');
  return {
    store,
    project,
    deps: {
      store,
      llm: new ScriptedProvider(script),
      sandboxes: new LocalSandboxProvider(mkdtempSync(path.join(tmpdir(), 'runner-sbx-'))),
      trace: new NullTraceSink(),
    },
  };
}

describe('the loop', () => {
  it('runs a task to completion and checkpoints every step', async () => {
    const { store, project, deps } = fixture();
    const task = store.createTask(project.id, 'test', 'hello world');

    const result = await runTask(task.id, deps);

    expect(result.status).toBe('succeeded');
    const steps = store.listSteps(task.id);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.finished_at !== null)).toBe(true);
    // Sequence numbers are dense and ordered: a gap would mean a lost step.
    expect(steps.map((s) => s.seq)).toEqual(steps.map((_, i) => i));
    store.close();
  });

  it('attributes cost and tokens to the task row', async () => {
    const { store, project, deps } = fixture();
    const task = store.createTask(project.id, 'test', 'hello world');
    await runTask(task.id, deps);

    expect(store.getTask(task.id)!.cost_usd).toBeGreaterThan(0);
    const llmSteps = store.listSteps(task.id).filter((s) => s.kind === 'llm');
    expect(llmSteps.every((s) => s.tokens_out > 0)).toBe(true);
    store.close();
  });

  it('stops at the step budget rather than looping forever', async () => {
    // A script that never stops asking for tools.
    const forever: Script = Array.from({ length: 50 }, (_, i) => ({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use' as const,
          id: `c${i}`,
          name: 'file_list',
          input: {},
        },
      ],
    }));

    const { store, project, deps } = fixture(forever);
    const task = store.createTask(project.id, 'test', 'loop forever');
    const result = await runTask(task.id, deps, { ...DEFAULT_BUDGET, max_steps: 4 });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/step budget/);
    store.close();
  });

  it('feeds an unknown tool back as an error instead of failing the task', async () => {
    const script: Script = [
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'c1', name: 'teleport', input: {} }],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'never mind' }] },
    ];

    const { store, project, deps } = fixture(script);
    const task = store.createTask(project.id, 'test', 'invent a tool');
    const result = await runTask(task.id, deps);

    expect(result.status).toBe('succeeded');
    const bad = store.listSteps(task.id).find((s) => s.name === 'teleport');
    expect(bad?.status).toBe('error');
    expect(bad?.error).toMatch(/unknown tool/);
    store.close();
  });

  it('records a failed shell command as a failed step, not a silent success', async () => {
    const script: Script = [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'c1', name: 'shell_exec', input: { command: 'exit 7' } },
        ],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'that failed' }] },
    ];

    const { store, project, deps } = fixture(script);
    const task = store.createTask(project.id, 'test', 'fail a command');
    await runTask(task.id, deps);

    const shell = store.listSteps(task.id).find((s) => s.name === 'shell_exec');
    expect(shell?.status).toBe('error');
    store.close();
  });
});
