import { describe, expect, it } from 'vitest';

import { openRun, getRun, closeRun } from '../agent/bus.ts';

describe('the run bus', () => {
  it('replays buffered events to a late subscriber', () => {
    // The ordinary case for a fast task: the loop finishes before the browser
    // has opened its EventSource.
    const run = openRun('t1');
    run.emit({ type: 'task.started', task_id: 't1' });
    run.emit({ type: 'task.finished', status: 'succeeded', error: null });

    const seen: string[] = [];
    run.subscribe((e) => seen.push(e.type));
    expect(seen).toEqual(['task.started', 'task.finished']);
    closeRun('t1');
  });

  it('replays only what a reconnecting client missed', () => {
    const run = openRun('t2');
    run.emit({ type: 'task.started', task_id: 't2' });
    run.emit({ type: 'assistant.text', text: 'a' });
    run.emit({ type: 'assistant.text', text: 'b' });

    const seen: string[] = [];
    // Last-Event-ID said 0, so events 1 and 2 are what is owed.
    run.subscribe((e) => seen.push(e.type), 0);
    expect(seen).toEqual(['assistant.text', 'assistant.text']);
    closeRun('t2');
  });

  it('lets a listener unsubscribe from inside the replay', () => {
    // This is a real 500 that reached the browser: the SSE route closed itself
    // on the replayed `task.finished` while `subscribe` had not yet returned
    // the unsubscribe function it was trying to call.
    const run = openRun('t3');
    run.emit({ type: 'task.started', task_id: 't3' });
    run.emit({ type: 'task.finished', status: 'succeeded', error: null });

    let unsubscribe: (() => void) | null = null;
    let closed = false;
    const finish = () => {
      closed = true;
      unsubscribe?.();
    };

    expect(() => {
      unsubscribe = run.subscribe((e) => {
        if (e.type === 'task.finished') finish();
      });
      if (closed) unsubscribe();
    }).not.toThrow();

    // And the listener really is gone, not merely inert.
    const after: string[] = [];
    run.subscribe((e) => after.push(e.type), 1);
    run.emit({ type: 'assistant.text', text: 'later' });
    expect(after).toEqual(['assistant.text']);
    closeRun('t3');
  });

  it('keeps a finished run readable so a late reconnect is not a 404', () => {
    const run = openRun('t4');
    run.emit({ type: 'task.finished', status: 'failed', error: 'nope' });
    closeRun('t4');
    expect(getRun('t4')).toBe(run);
  });

  it('survives a listener that throws', () => {
    const run = openRun('t5');
    run.subscribe(() => {
      throw new Error('broken client');
    });
    const seen: string[] = [];
    run.subscribe((e) => seen.push(e.type));
    expect(() => run.emit({ type: 'task.started', task_id: 't5' })).not.toThrow();
    expect(seen).toEqual(['task.started']);
    closeRun('t5');
  });
});
