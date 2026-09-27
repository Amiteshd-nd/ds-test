import { getRun } from '@/core/agent/bus';
import { getStore } from '@/core/db/store';
import { assertOwnsProject } from '@/core/auth';

export const runtime = 'nodejs';
// SSE and response caching are incompatible in a way that shows up as a stream
// that never delivers anything.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Streamed progress (PRD section 5: REST + SSE).
 *
 * Every frame carries the event's `seq` as its SSE id, so a browser reconnecting
 * sends `Last-Event-ID` and the run replays from there. That replay is why the
 * bus keeps its events rather than only forwarding them: a dropped connection
 * mid-task should cost nothing.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  const task = store.getTask(id);
  if (!task) return new Response('not found', { status: 404 });

  try {
    await assertOwnsProject(task.project_id);
  } catch {
    return new Response('not found', { status: 404 });
  }

  const run = getRun(id);
  const lastEventId = Number(request.headers.get('last-event-id') ?? '-1');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: { seq: number; type: string }) => {
        controller.enqueue(
          encoder.encode(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      };

      if (!run) {
        // The run is over, or this process never had it. Hand back the durable
        // record and close. The client must treat `replay` as terminal and stop
        // the EventSource itself — a closed SSE response is a reconnect signal
        // to the browser, and without that it will retry this forever.
        controller.enqueue(
          encoder.encode(
            `event: replay\ndata: ${JSON.stringify({
              task: store.getTask(id),
              steps: store.listSteps(id),
            })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      // `subscribe` replays buffered events synchronously before it returns, so
      // a finished run delivers `task.finished` while we are still inside the
      // call. The listener therefore cannot reference the binding `subscribe`
      // is about to produce — that is a temporal dead zone, and it is a 500
      // every time a task completes faster than the browser can connect.
      let unsubscribe: (() => void) | null = null;
      let closed = false;

      const finish = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      unsubscribe = run.subscribe((event) => {
        if (closed) return;
        send(event);
        if (event.type === 'task.finished') finish();
      }, Number.isFinite(lastEventId) ? lastEventId : -1);

      // The run had already ended and the replay closed us out. `finish` ran
      // before this assignment existed, so the listener is still in the set.
      if (closed) {
        unsubscribe();
        return;
      }

      // Proxies drop an idle connection; a comment frame is not an event and
      // costs the client nothing to ignore.
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        finish();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx buffers SSE into uselessness without this.
      'x-accel-buffering': 'no',
    },
  });
}
