// The CORTEX service, as a factory. PRD §15.
//
// This was one file with `import { createAtlasAdapters } from '../../adapters-host'` at
// the top, which is correct for a deployment and wrong for a package: the second host
// built against this code could not start a server without editing it. So the service
// takes its host as an argument, and each host ships a four-line entry that calls this.
//
// Every endpoint authenticates through `IdentityAdapter`, so the host's session is the
// only session. There is no CORTEX login and no CORTEX user table.

import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCortex, openDb, RunStore } from '../core/index.ts';
import type { Cortex } from '../core/index.ts';
import type { CortexConfig } from '../core/config/config.ts';
import type { HostAdapters, Principal, Surface } from '../core/adapters/index.ts';
import { CortexError } from '../core/errors.ts';
import { Router, cors, fail, json, openSse, readJson } from './http.ts';
import type { Ctx } from './http.ts';
import { AgUiTranslator } from './ag-ui.ts';

/**
 * Endpoints that belong to the host rather than to CORTEX — Atlas's document editor, for
 * instance. A host registers its own; CORTEX does not invent them and does not require
 * any.
 */
export interface HostRoutes {
  (router: Router, deps: { cortex: Cortex; adapters: HostAdapters; principalOf: (req: IncomingMessage) => Promise<Principal> }): void;
}

export interface ServiceOptions {
  config: CortexConfig;
  hostName: string;
  /** Built by the host, given the store so memory and transport can share it. */
  createAdapters: (store: RunStore, config: CortexConfig) => HostAdapters;
  hostRoutes?: HostRoutes;
}

export interface Service {
  cortex: Cortex;
  store: RunStore;
  listen: () => Promise<number>;
  close: () => Promise<void>;
}

export function createService(opts: ServiceOptions): Service {
  const { config, hostName } = opts;
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = opts.createAdapters(store, config);
  const cortex = createCortex({ adapters, hostName, config, store });

  async function principalOf(req: IncomingMessage): Promise<Principal> {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const principal = token ? await adapters.identity.resolve(token) : null;
    if (!principal) throw new CortexError('permission_denied', 'No valid host session on this request.');
    return principal;
  }

  const router = new Router();

  function requireOwnRun(runId: string, principal: Principal) {
    const run = store.getRun(runId);
    if (!run) throw new CortexError('not_found', `No run ${runId}.`);
    // Cross-principal run access is the same class of bug as cross-principal retrieval.
    if (run.principalId !== principal.id) throw new CortexError('not_found', `No run ${runId}.`);
    return run;
  }

  async function resolveImpersonated(id: string): Promise<Principal> {
    const withResolve = adapters.identity as { resolvePrincipal?: (id: string) => Promise<Principal | null> };
    const p = withResolve.resolvePrincipal ? await withResolve.resolvePrincipal(id) : null;
    if (!p) throw new CortexError('not_found', `No principal ${id} to impersonate.`);
    return p;
  }

  router.add('GET', '/v1/health', async ({ res }) => json(res, 200, { ok: true }));

  router.add('GET', '/v1/ready', async ({ res }) => {
    // Ready means the registries loaded and the database answers. A service that is
    // listening but cannot read its own runs is not ready, it is misleading.
    store.db.prepare('SELECT 1').get();
    json(res, 200, { ok: true, agents: cortex.agents.agents.size, skills: cortex.skills.skills.size });
  });

  router.add('GET', '/v1/agents', async ({ req, res, url }) => {
    const principal = await principalOf(req);
    const entitlements = await adapters.identity.entitlements(principal);
    const surface = (url.searchParams.get('surface') as Surface | null) ?? undefined;
    const agents = cortex.agents.visibleTo(entitlements, surface);
    json(res, 200, {
      agents: agents.map((a) => ({
        id: a.id, version: a.version, name: a.name, description: a.description,
        surfaces: a.surfaces, formats: a.output.formats,
      })),
    });
  });

  router.add('POST', '/v1/threads', async ({ req, res }) => {
    const principal = await principalOf(req);
    json(res, 201, { threadId: cortex.engine.newThreadId(principal) });
  });

  router.add('POST', '/v1/threads/{id}/messages', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const body = await readJson<{ agentId?: string; text?: string; context?: Record<string, unknown> }>(req);
    if (!body.text?.trim()) throw new CortexError('invalid_arguments', 'A message needs text.');
    // A thread is named `<principalId>:<uuid>`; anything else is someone else's thread.
    if (!params.id.startsWith(`${principal.id}:`)) throw new CortexError('permission_denied', 'That thread does not belong to you.');

    const run = await cortex.engine.start({
      agentId: body.agentId ?? 'atlas-guide',
      principal,
      surface: 'chat',
      threadId: params.id,
      text: body.text,
      context: body.context,
    });
    json(res, 202, { runId: run.id, status: run.status });
  });

  router.add('POST', '/v1/agents/{id}/invoke', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const body = await readJson<{ surface?: Surface; text?: string; context?: Record<string, unknown> }>(req);
    const run = await cortex.engine.start({
      agentId: params.id,
      principal,
      surface: body.surface ?? 'background',
      threadId: null,
      text: body.text ?? '',
      context: body.context,
    });
    json(res, 202, { runId: run.id, status: run.status });
  });

  router.add('GET', '/v1/runs/{id}', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);
    json(res, 200, {
      run,
      steps: store.steps(run.id),
      approval: store.pendingApproval(run.id),
    });
  });

  router.add('GET', '/v1/runs/{id}/events', async ({ req, res, params, url }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);

    const header = req.headers['last-event-id'];
    const after = Number(header ?? url.searchParams.get('after') ?? 0) || 0;
    const send = openSse(res);

    // Addendum C4 — the same stream in the ecosystem's vocabulary, on request. Internal
    // event names are unchanged; this is content negotiation, not a rename. See
    // docs/EVENTS.md for the full mapping.
    const agui = url.searchParams.get('protocol') === 'ag-ui' ? new AgUiTranslator(run.id, run.threadId) : null;

    // A client that dropped resumes from its last id; a fresh client passes 0 and gets
    // the run from the beginning, including a run that already finished.
    const abort = new AbortController();
    req.on('close', () => abort.abort());

    try {
      for await (const { seq, event } of adapters.transport.subscribe(run.id, after)) {
        if (abort.signal.aborted) break;
        if (agui) for (const translated of agui.translate(event)) send(seq, translated);
        else send(seq, event);
      }
    } catch {
      // A closed socket mid-write is normal; the run keeps going and the events are in
      // the table when the client comes back.
    }
    res.end();
  });

  router.add('POST', '/v1/runs/{id}/approve', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);
    const body = await readJson<{ stepId?: string; decision?: 'approve' | 'approve_with_edits' | 'reject_with_reason'; editedArgs?: Record<string, unknown>; reason?: string }>(req);
    if (!body.stepId || !body.decision) throw new CortexError('invalid_arguments', 'stepId and decision are required.');
    await cortex.engine.decide(run.id, body.stepId, body.decision, body.editedArgs, body.reason);
    json(res, 202, { ok: true });
  });

  router.add('POST', '/v1/runs/{id}/cancel', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);
    await cortex.engine.cancel(run.id);
    json(res, 202, { ok: true });
  });

  router.add('GET', '/v1/runs/{id}/trace', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);
    json(res, 200, { run, steps: store.steps(run.id), traces: store.traces(run.id) });
  });

  // §15 — inspectable, deletable memory. Built now rather than "later", because a system
  // that remembers things about a person owes them a way to see and remove them.
  router.add('GET', '/v1/memory/me', async ({ req, res }) => {
    const principal = await principalOf(req);
    json(res, 200, { records: await adapters.memory.inspect(principal.id) });
  });

  router.add('DELETE', '/v1/memory/me/{recordId}', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const removed = await adapters.memory.forget(principal.id, params.recordId);
    if (!removed) throw new CortexError('not_found', 'No such memory record of yours.');
    json(res, 200, { ok: true });
  });

  // §13.5 / §16.3 — the persistent "this was wrong" control. It writes the run id, the
  // trace pointer, and the user's comment into the trace store, which is the triage queue
  // the owning team converts into golden cases each week. Without this, the golden set
  // rots at launch quality.
  router.add('POST', '/v1/runs/{id}/feedback', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    const run = requireOwnRun(params.id, principal);
    const body = await readJson<{ verdict?: 'up' | 'down'; comment?: string }>(req);
    if (body.verdict !== 'up' && body.verdict !== 'down') throw new CortexError('invalid_arguments', 'verdict must be "up" or "down".');
    store.trace(run.id, null, 'feedback', { verdict: body.verdict, comment: body.comment ?? '', agentId: run.agentId, at: new Date().toISOString() });
    json(res, 201, { ok: true });
  });

  // -- host events, rules, notifications (§12) --------------------------------

  /**
   * The host tells CORTEX something happened, and rules decide whether that wakes an agent.
   *
   * Locked to service and admin principals on purpose. A rule runs as the principal *it*
   * names — `decision-superseded` runs as a team lead — so an events endpoint open to any
   * signed-in member would let a member cause a run with someone else's permissions. The
   * output goes to the lead's notifications rather than the caller's, so this is not a read
   * of restricted data; it is still someone else's agent doing someone else's work on
   * demand, which is not theirs to trigger.
   */
  router.add('POST', '/v1/events', async ({ req, res }) => {
    const principal = await principalOf(req);
    if (principal.type !== 'service' && principal.type !== 'admin') {
      throw new CortexError('permission_denied', 'Only the host itself may emit host events.');
    }
    const body = await readJson<{ name?: string; payload?: Record<string, unknown> }>(req);
    if (!body.name) throw new CortexError('invalid_arguments', 'An event needs a name.');
    const fired = await cortex.ruleEngine.fire({ name: body.name, payload: body.payload ?? {}, at: new Date().toISOString() });
    json(res, 202, { fired });
  });

  router.add('GET', '/v1/rules', async ({ req, res }) => {
    await principalOf(req);
    json(res, 200, {
      rules: [...cortex.rules.rules.values()].map((r) => ({
        id: r.id, name: r.name, description: r.description, on: r.on, when: r.when,
        agent: r.agent, surface: r.surface, as: r.as, enabled: r.enabled, everySeconds: r.everySeconds,
      })),
    });
  });

  router.add('GET', '/v1/notifications', async ({ req, res }) => {
    const principal = await principalOf(req);
    json(res, 200, { notifications: store.notifications(principal.id) });
  });

  router.add('POST', '/v1/notifications/{id}/read', async ({ req, res, params }) => {
    const principal = await principalOf(req);
    if (!store.markNotificationRead(params.id, principal.id)) throw new CortexError('not_found', 'No such notification of yours.');
    json(res, 200, { ok: true });
  });

  /**
   * The cross-device path. The subscription is to the *person*, not to the session — so a
   * run started in one client notifies every other client that person has open, which is
   * what §12's "a run started on web must deliver to mobile" amounts to when both are
   * authenticated as the same principal.
   */
  router.add('GET', '/v1/notifications/stream', async ({ req, res, url }) => {
    const principal = await principalOf(req);
    const after = req.headers['last-event-id'] ?? url.searchParams.get('after') ?? undefined;
    const send = openSse(res);
    const abort = new AbortController();
    req.on('close', () => abort.abort());

    let seq = 0;
    try {
      for await (const item of adapters.transport.notifications(principal.id, after as string | undefined)) {
        if (abort.signal.aborted) break;
        send(++seq, item.notification);
      }
    } catch {
      // A closed socket is ordinary; the notifications are durable and still there.
    }
    res.end();
  });

  // -- traces (addendum C1) ---------------------------------------------------
  // Self-hosted, first-party, and never leaving this process's network. The viewer is a
  // tab in the Playground rather than a separate app, per C1 item 6.

  router.add('GET', '/v1/traces', async ({ req, res, url }) => {
    await principalOf(req);
    json(res, 200, {
      traces: cortex.traces.list({
        agentId: url.searchParams.get('agent') ?? undefined,
        status: url.searchParams.get('status') ?? undefined,
        minCostUsd: numberParam(url, 'minCost'),
        minDurationMs: numberParam(url, 'minDuration'),
        limit: numberParam(url, 'limit') ?? 50,
      }),
      stats: cortex.traces.dailyStats(url.searchParams.get('agent') ?? undefined),
      // M6's cost dashboard. Live for days whose detail is still around, rolled up for
      // days the retention sweep has collapsed.
      dashboard: cortex.traces.dashboard(numberParam(url, 'days') ?? 14),
    });
  });

  router.add('GET', '/v1/traces/{id}', async ({ req, res, params }) => {
    await principalOf(req);
    await cortex.exporter.flush();
    const found = cortex.traces.get(params.id);
    if (!found) throw new CortexError('not_found', `No trace ${params.id}.`);
    // Annotations from the run — prompt hashes, quality numbers, guardrail findings — sit
    // alongside the spans. They are what turns a waterfall into an explanation.
    json(res, 200, { ...found, annotations: store.traces(found.trace.runId) });
  });

  router.add('GET', '/v1/traces/{id}/payload/{ref}', async ({ req, res, params }) => {
    await principalOf(req);
    const found = cortex.traces.get(params.id);
    // The payload must belong to a span of this trace; a blob key is content-addressed and
    // otherwise guessable across traces.
    if (!found || !found.spans.some((sp) => sp.payloadRef === params.ref)) {
      throw new CortexError('not_found', 'No such payload on this trace.');
    }
    const payload = await cortex.exporter.blobs.get(params.ref);
    if (payload === null) throw new CortexError('not_found', 'That payload has expired.');
    json(res, 200, { payload });
  });

  router.add('POST', '/v1/traces/sweep', async ({ req, res }) => {
    await principalOf(req);
    const days = config.telemetry.mode === 'production' ? config.telemetry.retention_days_production : config.telemetry.retention_days_development;
    json(res, 200, { ...cortex.traces.sweep(days), retentionDays: days });
  });

  // -- developer playground (§16.4) ------------------------------------------
  // Inspect what an agent would actually be given, without running it. The PRD's own
  // note is that this is a force multiplier rather than a nice-to-have, so it ships in
  // the same slice as the chat surface.

  router.add('GET', '/v1/playground/context', async ({ req, res, url }) => {
    await principalOf(req); // a caller must be signed in to impersonate anyone
    const impersonate = url.searchParams.get('as');
    const question = url.searchParams.get('q') ?? '';
    const agentId = url.searchParams.get('agent') ?? 'atlas-guide';
    const target = impersonate ? await resolveImpersonated(impersonate) : await principalOf(req);
    json(res, 200, await cortex.playground.context(agentId, target, question));
  });

  router.add('GET', '/v1/playground/prompt-diff', async ({ req, res, url }) => {
    await principalOf(req);
    const id = url.searchParams.get('id') ?? '';
    const a = Number(url.searchParams.get('a') ?? 1);
    const b = Number(url.searchParams.get('b') ?? 1);
    json(res, 200, cortex.playground.promptDiff(id, a, b));
  });





  if (opts.hostRoutes) opts.hostRoutes(router, { cortex, adapters, principalOf });

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    cors(res, config.server.cors_origin);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const match = router.match(req.method ?? 'GET', url.pathname);
    if (!match) { json(res, 404, { error: { kind: 'not_found', message: `No route ${req.method} ${url.pathname}` } }); return; }

    const ctx: Ctx = { req, res, url, params: match.params };
    try {
      await match.handler(ctx);
    } catch (err) {
      if (!res.headersSent) fail(res, err);
      else res.end();
    }
  });

  return {
    cortex,
    store,
    async listen(): Promise<number> {
      // §12 — scheduled rules. The timers are unref'd, so this never keeps the process
      // alive on its own; stopping the service stops the schedule.
      const stopSchedule = cortex.ruleEngine.start();
      process.on('SIGTERM', stopSchedule);
      process.on('SIGINT', stopSchedule);

      const recovered = await cortex.engine.recover();
      await new Promise<void>((resolve) => server.listen(config.server.port, resolve));
      process.stdout.write(
        `cortex · ${hostName} · http://localhost:${config.server.port}\n` +
          `  ${cortex.agents.agents.size} agent(s), ${cortex.skills.skills.size} skill(s), ${cortex.rules.rules.size} rule(s)` +
          `${recovered ? `, resumed ${recovered} run(s) left over from the last process` : ''}\n`,
      );
      return config.server.port;
    },
    async close(): Promise<void> {
      cortex.ruleEngine.stop();
      cortex.exporter.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function numberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  return raw === null ? undefined : Number(raw);
}
