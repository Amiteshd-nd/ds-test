// Addendum C4 — the AG-UI vocabulary on the wire.
//
// These pin the parts of the mapping that are not one-to-one, which is the reason C4 was
// applied as a translator rather than a rename.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AgUiTranslator } from '../src/server/ag-ui.ts';
import type { RunEvent } from '../src/core/adapters/types.ts';

const run = (events: RunEvent[]): { type: string; [k: string]: unknown }[] => {
  const t = new AgUiTranslator('run_1', 'thread_1');
  return events.flatMap((e) => t.translate(e));
};

test('a text message is a Start / Content / End triad, opened by the first token', () => {
  const out = run([
    { type: 'run_started', runId: 'run_1', agentId: 'a', at: 'now' },
    { type: 'token', runId: 'run_1', text: 'Hello ' },
    { type: 'token', runId: 'run_1', text: 'there.' },
    { type: 'run_completed', runId: 'run_1', status: 'succeeded' },
  ]);
  assert.deepEqual(out.map((e) => e.type), [
    'RUN_STARTED', 'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_FINISHED',
  ]);
  const ids = new Set(out.filter((e) => String(e.type).startsWith('TEXT_MESSAGE')).map((e) => e.messageId));
  assert.equal(ids.size, 1, 'every text event carries the same messageId');
});

test('an empty delta is never emitted — the spec requires content to be non-empty', () => {
  const out = run([{ type: 'token', runId: 'run_1', text: '' }]);
  assert.deepEqual(out.map((e) => e.type), ['TEXT_MESSAGE_START']);
});

test('a skill call becomes the tool-call triad with one id', () => {
  const out = run([
    { type: 'block', runId: 'run_1', block: { type: 'skill_call', skill: 'people.search', args: { query: 'who' }, state: 'ok' } },
  ]);
  assert.deepEqual(out.map((e) => e.type), ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END']);
  const ids = new Set(out.map((e) => e.toolCallId));
  assert.equal(ids.size, 1);
  assert.equal(out[0].toolCallName, 'people.search');
  assert.equal(out[1].delta, '{"query":"who"}');
});

test('an approval gate becomes a terminal RunFinished carrying an interrupt', () => {
  // This is the mapping worth having: AG-UI already models a human-in-the-loop pause as
  // a run that ends and is resumed by a new one, which is exactly what an awaiting
  // approval run is. A CUSTOM event would have thrown that away.
  const out = run([
    { type: 'token', runId: 'run_1', text: 'Draft ready.' },
    {
      type: 'approval_requested', runId: 'run_1', stepId: 'step_9',
      payload: { action: 'messaging.send', args: { to: 'x' }, human: 'Send this?', reasoning: 'because', costUsd: 0.01 },
    },
  ]);
  assert.deepEqual(out.map((e) => e.type), ['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_FINISHED']);
  const finished = out[3] as unknown as { outcome: { type: string; interrupts: { id: string; action: string }[] } };
  assert.equal(finished.outcome.type, 'interrupt');
  assert.equal(finished.outcome.interrupts[0].id, 'step_9');
  assert.equal(finished.outcome.interrupts[0].action, 'messaging.send');
});

test('a failure closes the open message before reporting the error', () => {
  const out = run([
    { type: 'token', runId: 'run_1', text: 'Partial' },
    { type: 'run_failed', runId: 'run_1', error: { kind: 'budget_exceeded', message: 'out of budget' } },
  ]);
  assert.deepEqual(out.map((e) => e.type), ['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_ERROR']);
  assert.equal(out[3].code, 'budget_exceeded', 'the error kind travels as the AG-UI code');
});

test('everything CORTEX adds is namespaced under CUSTOM rather than inventing a type', () => {
  const out = run([
    { type: 'citation', runId: 'run_1', sourceId: 's1', ref: 'doc:a', title: 'A' },
    { type: 'notice', runId: 'run_1', kind: 'permission_filtered', message: '2 removed' },
    { type: 'block', runId: 'run_1', block: { type: 'entity_card', ref: 'person:x', density: 'compact' } },
  ]);
  assert.deepEqual(out.map((e) => e.type), ['CUSTOM', 'CUSTOM', 'CUSTOM']);
  assert.deepEqual(out.map((e) => e.name), ['cortex.citation', 'cortex.notice', 'cortex.block.entity_card']);
});

test('step names survive the round trip from start to finish', () => {
  const out = run([
    { type: 'step_started', runId: 'run_1', stepId: 'st_1', kind: 'retrieval', name: 'retrieve', label: 'Searching Atlas' },
    { type: 'step_completed', runId: 'run_1', stepId: 'st_1', status: 'ok', latencyMs: 12 },
  ]);
  assert.equal(out[0].stepName, 'retrieve');
  assert.equal(out[1].stepName, 'retrieve', 'step_completed carries only an id; the translator remembers the name');
});
