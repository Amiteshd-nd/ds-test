// Small helpers over node:http. No framework — the repo's hub is dependency-free for
// the same reason, and this service has eleven routes.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { CortexError } from '../core/errors.ts';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
}

export function cors(res: ServerResponse, origin: string): void {
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-headers', 'content-type, authorization, last-event-id');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

export function fail(res: ServerResponse, err: unknown): void {
  const e = err instanceof CortexError ? err : new CortexError('internal', err instanceof Error ? err.message : String(err));
  // The status is derived from the kind, so a budget or a denial is never a 500 — the
  // client renders a state for it (§13.4), and a 500 has no state worth rendering.
  const status =
    e.kind === 'permission_denied' ? 403 :
    e.kind === 'not_found' ? 404 :
    e.kind === 'rate_limited' ? 429 :
    e.kind === 'budget_exceeded' ? 402 :
    e.kind === 'invalid_arguments' ? 400 :
    e.kind === 'model_unavailable' ? 503 :
    e.kind === 'timeout' ? 504 : 500;
  json(res, status, { error: { kind: e.kind, message: e.message, detail: e.detail } });
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 256_000) throw new CortexError('invalid_arguments', 'Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {} as T;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw new CortexError('invalid_arguments', 'Request body is not valid JSON.');
  }
}

/** SSE with `Last-Event-ID` resumption (§15). The id is the durable event sequence. */
export function openSse(res: ServerResponse): (id: number, event: unknown) => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nginx and friends buffer SSE by default, which turns streaming into one late lump.
    'x-accel-buffering': 'no',
  });
  res.write(': open\n\n');
  return (id: number, event: unknown) => {
    res.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
  };
}

type Handler = (ctx: Ctx) => Promise<void>;

interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler }

export class Router {
  #routes: Route[] = [];

  add(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' + path.replace(/\{(\w+)\}/g, (_, k: string) => { keys.push(k); return '([^/]+)'; }) + '$',
    );
    this.#routes.push({ method, pattern, keys, handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    for (const r of this.#routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return null;
  }
}
