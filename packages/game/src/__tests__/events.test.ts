import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/events';

interface TestEvents {
  ping: { n: number };
  pong: { s: string };
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const seen: number[] = [];
    bus.on('ping', ({ n }) => seen.push(n));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1, 2]);
  });

  it('on() returns an unsubscribe function', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('once() fires exactly once', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('ping', handler);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from the others', () => {
    const bus = new EventBus<TestEvents>();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.on('ping', () => { throw new Error('boom'); });
    bus.on('ping', after);
    bus.emit('ping', { n: 1 });
    expect(after).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a handler unsubscribing mid-emit does not skip the next handler', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => off());
    bus.on('ping', second);
    bus.emit('ping', { n: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('events are independent channels', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    bus.on('ping', ping);
    bus.emit('pong', { s: 'x' });
    expect(ping).not.toHaveBeenCalled();
  });

  it('clear() removes everything', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.clear();
    bus.emit('ping', { n: 1 });
    expect(handler).not.toHaveBeenCalled();
  });
});
