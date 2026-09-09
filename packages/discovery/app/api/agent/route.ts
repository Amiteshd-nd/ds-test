/**
 * The one SSE endpoint. Takes `{script, seed, faults, speed, jitter}` and streams
 * `AgentEvent`s from the runtime.
 *
 * The point of routing scripted runs through a server endpoint — rather than
 * calling `createRun` in the browser — is that the client code path is then
 * identical for scripted and live runs. Swapping one surface to the real API
 * changes this file and nothing in the UI. It's also the only place that knows
 * whether a run is scripted or live, which is what keeps the API key server-side.
 */
import { createRun, scripts, type FaultKind, type RunOptions } from '@/lib/agent-runtime';

export const dynamic = 'force-dynamic';

type Body = {
  script?: string;
  seed?: number;
  speed?: number;
  jitter?: number;
  faults?: FaultKind[];
  live?: boolean;
};

const encoder = new TextEncoder();
const frame = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  // Live runs are deliberately not wired yet: there is no Sarvam key in this repo,
  // and a half-built live path that silently falls back to a script would make every
  // latency number in the UI a lie. docs/build-workflow.md §2 step 4 is the task.
  if (body.live) {
    if (!process.env.SARVAM_API_KEY) {
      return Response.json(
        {
          error: 'No SARVAM_API_KEY. Set it in packages/discovery/.env.local, then wire lib/sarvam.ts.',
          hint: 'Scripted runs need no key: POST { script: "codingRun" }.',
        },
        { status: 501 },
      );
    }
    return Response.json(
      { error: 'Live path not implemented yet — see docs/build-workflow.md §2 step 4.' },
      { status: 501 },
    );
  }

  const name = body.script ?? 'codingRun';
  if (!(name in scripts)) {
    return Response.json(
      { error: `Unknown script "${name}"`, available: Object.keys(scripts) },
      { status: 400 },
    );
  }
  const script = scripts[name as keyof typeof scripts];

  // One controller for the whole run: aborted when the client disconnects or
  // navigates away, which is what stops a leaked stream per surface visit.
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const options: RunOptions = {
    seed: body.seed ?? 1,
    speed: body.speed ?? 1,
    jitter: body.jitter ?? 0,
    faults: body.faults ?? [],
    signal: abort.signal,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A header event, so the client can show what it is watching without guessing.
      controller.enqueue(frame({ t: 'meta', script: name, seed: options.seed, faults: options.faults, speed: options.speed }));
      try {
        for await (const event of createRun(script, options)) {
          controller.enqueue(frame(event));
        }
        controller.enqueue(frame({ t: 'meta.end' }));
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          // Fail loudly in dev: a silent catch here would look like a stalled run.
          controller.enqueue(frame({ t: 'error', kind: 'network', message: String(error), retryable: true }));
        }
      } finally {
        abort.abort();
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Next buffers nothing itself, but proxies will unless told.
      'X-Accel-Buffering': 'no',
    },
  });
}
