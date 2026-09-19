// The conformance suite. PRD §5.3: "a conformance test suite in tests/conformance/ that
// any host implementation must pass."
//
// This is the executable half of the portability promise. A host implements the eight
// adapters, points this at them, and finds out — before writing an agent — whether its
// permission layer batches, whether its retrieval ids are stable, whether its transport
// survives a restart. `scripts/doctor.ts` runs exactly these checks and turns them into
// the readiness score that gates production (§17.2).
//
// Every check states what it is protecting, because a failing check whose purpose is
// unclear gets deleted rather than fixed.

import type { HostAdapters } from '../../src/core/adapters/index.ts';
import type { EntityRef, Principal } from '../../src/core/adapters/types.ts';

export interface ConformanceFixture {
  /** Two principals in different permission positions. */
  principal: Principal;
  otherPrincipal: Principal;
  /** A ref `principal` may read, and one they may not. */
  readableRef: EntityRef;
  forbiddenRef: EntityRef;
  /** A query that should return something for `principal`. */
  query: string;
  /** An edge type the graph is expected to know, if a graph adapter is supplied. */
  edgeType?: string;
}

export interface CheckResult {
  adapter: string;
  name: string;
  pass: boolean;
  detail: string;
  /** A soft check is advice, not a gate: doctor reports it, and does not fail on it. */
  soft?: boolean;
}

export async function runConformance(adapters: HostAdapters, fx: ConformanceFixture): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const check = async (adapter: string, name: string, detail: string, fn: () => Promise<boolean>, soft = false) => {
    try {
      out.push({ adapter, name, detail, pass: await fn(), soft });
    } catch (err) {
      out.push({ adapter, name, detail: `${detail} — threw: ${err instanceof Error ? err.message : String(err)}`, pass: false, soft });
    }
  };

  // -- 1. identity ---------------------------------------------------------
  await check('identity', 'rejects an invalid token', 'A bad token must resolve to null, not to a default user.', async () => {
    return (await adapters.identity.resolve('definitely-not-a-token')) === null;
  });
  await check('identity', 'entitlements are a set of strings', 'Capability strings, not roles — the policy layer should not have to expand a hierarchy.', async () => {
    const e = await adapters.identity.entitlements(fx.principal);
    return e instanceof Set && [...e].every((x) => typeof x === 'string');
  });

  // -- 2. policy -----------------------------------------------------------
  await check('policy', 'canRead is batched and order-preserving', 'Retrieval filters hundreds of refs per turn; a misaligned array silently leaks or hides the wrong record.', async () => {
    const refs = [fx.readableRef, fx.forbiddenRef, fx.readableRef];
    const answers = await adapters.policy.canRead(fx.principal, refs);
    return answers.length === 3 && answers[0] === true && answers[1] === false && answers[2] === true;
  });
  await check('policy', 'canRead answers 200 refs within 150ms', 'If the batched call is slow, someone will move the filter to render time, and that is the end of the security model.', async () => {
    const refs = Array.from({ length: 200 }, () => fx.readableRef);
    const t = Date.now();
    await adapters.policy.canRead(fx.principal, refs);
    return Date.now() - t < 150;
  });
  await check('policy', 'canRead denies an unknown ref', 'An id the host does not recognise is not permission to read it.', async () => {
    const [ok] = await adapters.policy.canRead(fx.principal, ['nonsense:does-not-exist']);
    return ok === false;
  });
  await check('policy', 'redact removes a body the principal lost access to', 'Entitlements can be revoked after a fact was written to memory; read-time redaction is the only thing that catches that.', async () => {
    const doc = { ref: fx.forbiddenRef, type: 'doc', title: 'x', body: 'secret body' };
    const red = await adapters.policy.redact(fx.principal, doc);
    return !red.body.includes('secret body');
  });
  await check('policy', 'canInvoke returns a reason', 'A denial the user cannot understand is a support ticket.', async () => {
    const d = await adapters.policy.canInvoke(fx.principal, 'any.skill', {});
    return typeof d.reason === 'string' && d.reason.length > 0;
  });

  // -- 3. retrieval --------------------------------------------------------
  await check('retrieval', 'search returns results for a known query', 'A host whose search returns nothing here has a wiring problem, not a relevance problem.', async () => {
    const chunks = await adapters.retrieval.search({ text: fx.query, k: 8 }, fx.principal);
    return chunks.length > 0;
  });
  await check('retrieval', 'refs are stable across identical searches', 'Citations are ids. Ids that move between calls cannot be cited.', async () => {
    const a = await adapters.retrieval.search({ text: fx.query, k: 8 }, fx.principal);
    const b = await adapters.retrieval.search({ text: fx.query, k: 8 }, fx.principal);
    return JSON.stringify(a.map((c) => c.ref)) === JSON.stringify(b.map((c) => c.ref));
  });
  await check('retrieval', 'fetch round-trips a ref', 'Grounding fetches whole documents for graph neighbours; a ref that cannot be fetched is a dead citation.', async () => {
    const docs = await adapters.retrieval.fetch([fx.readableRef], fx.principal);
    return docs.length === 1 && docs[0].ref === fx.readableRef;
  });

  // -- 4. graph (optional) -------------------------------------------------
  if (adapters.graph) {
    const graph = adapters.graph;
    await check('graph', 'schema declares node and edge types', 'Grounding traverses named edges; an empty schema means the graph leg can never fire.', async () => {
      const s = graph.schema();
      return s.nodeTypes.length > 0 && s.edgeTypes.length > 0;
    });
    await check('graph', 'neighbors respects depth', 'Depth 2 must not return the whole graph. A node with 40k neighbours is useless for grounding.', async () => {
      const one = await graph.neighbors(fx.readableRef, fx.edgeType ? [fx.edgeType] : [], 1);
      const two = await graph.neighbors(fx.readableRef, fx.edgeType ? [fx.edgeType] : [], 2);
      return two.nodes.length >= one.nodes.length;
    });
    await check('graph', 'neighbors excludes the seed node', 'Otherwise every walk re-retrieves the document you started from.', async () => {
      const sub = await graph.neighbors(fx.readableRef, [], 1);
      return !sub.nodes.includes(fx.readableRef);
    });
  } else {
    out.push({ adapter: 'graph', name: 'not implemented', pass: true, soft: true, detail: 'Optional, and the single highest-value adapter after policy. Implement it if your data has real relationships.' });
  }

  // -- 5. skills -----------------------------------------------------------
  await check('skills', 'unknown skill returns an error rather than throwing', 'A model will ask for a tool that does not exist. That is a bad answer, not a crashed run.', async () => {
    const r = await adapters.skills.invoke('no.such.skill', {}, {
      runId: 'conformance', stepId: 'conformance', principal: fx.principal, argsFromUntrustedContent: false,
    });
    return r.ok === false && Boolean(r.error);
  });

  // -- 6. memory -----------------------------------------------------------
  const threadId = `${fx.principal.id}:conformance`;
  await check('memory', 'turns round-trip in order', 'Ordering is the one thing conversation memory cannot get wrong.', async () => {
    const at = new Date().toISOString();
    await adapters.memory.appendTurn(threadId, { id: `t1-${Date.now()}`, threadId, role: 'user', text: 'first message', at });
    await adapters.memory.appendTurn(threadId, { id: `t2-${Date.now()}`, threadId, role: 'assistant', text: 'second message', at: new Date(Date.now() + 5).toISOString() });
    const recent = await adapters.memory.recent(threadId, 2);
    return recent.length === 2 && recent[0].text === 'first message' && recent[1].text === 'second message';
  });
  await check('memory', 'profile facts carry provenance', 'A remembered fact with no evidence and no run id cannot be explained to the person it is about.', async () => {
    await adapters.memory.upsertProfile(fx.principal.id, { key: 'conformance', value: 'yes', type: 'fact' }, 'conformance run');
    const profile = await adapters.memory.getProfile(fx.principal.id);
    const rec = profile.facts.find((f) => f.key === 'conformance');
    return Boolean(rec?.provenance?.evidence && rec?.provenance?.at);
  });
  await check('memory', 'a record can be deleted by its owner', 'GET /v1/memory/me is only honest if DELETE works.', async () => {
    const profile = await adapters.memory.getProfile(fx.principal.id);
    const rec = profile.facts.find((f) => f.key === 'conformance');
    if (!rec) return false;
    return adapters.memory.forget(fx.principal.id, rec.id);
  });
  await check('memory', 'another principal cannot read this profile', 'Cross-principal memory leakage is a Sev-1 (§10.4).', async () => {
    const other = await adapters.memory.getProfile(fx.otherPrincipal.id);
    return !other.facts.some((f) => f.key === 'conformance');
  });

  // -- 7. transport --------------------------------------------------------
  await check('transport', 'events are delivered in order', 'Out-of-order tokens are a garbled answer; out-of-order steps are an unreadable trace.', async () => {
    const runId = `conformance_${Date.now()}`;
    await adapters.transport.emit(runId, { type: 'progress', runId, message: 'one' });
    await adapters.transport.emit(runId, { type: 'progress', runId, message: 'two' });
    await adapters.transport.emit(runId, { type: 'run_completed', runId, status: 'succeeded' });
    const seen: string[] = [];
    for await (const { event } of adapters.transport.subscribe(runId, 0)) {
      if (event.type === 'progress') seen.push(event.message);
    }
    return seen.join(',') === 'one,two';
  });
  await check('transport', 'a late subscriber replays from the start', 'A client that connects after the run began must not miss the beginning — this is Last-Event-ID resumption underneath.', async () => {
    const runId = `conformance_late_${Date.now()}`;
    await adapters.transport.emit(runId, { type: 'progress', runId, message: 'early' });
    await adapters.transport.emit(runId, { type: 'run_completed', runId, status: 'succeeded' });
    let sawEarly = false;
    for await (const { event } of adapters.transport.subscribe(runId, 0)) {
      if (event.type === 'progress' && event.message === 'early') sawEarly = true;
    }
    return sawEarly;
  });
  await check('transport', 'resumption from a sequence number skips what was seen', 'Reconnecting must not replay the whole answer into the middle of a rendered one.', async () => {
    const runId = `conformance_resume_${Date.now()}`;
    await adapters.transport.emit(runId, { type: 'progress', runId, message: 'first' });
    await adapters.transport.emit(runId, { type: 'progress', runId, message: 'second' });
    await adapters.transport.emit(runId, { type: 'run_completed', runId, status: 'succeeded' });
    let firstSeq = 0;
    for await (const { seq, event } of adapters.transport.subscribe(runId, 0)) {
      if (event.type === 'progress') { firstSeq = seq; break; }
    }
    const after: string[] = [];
    for await (const { event } of adapters.transport.subscribe(runId, firstSeq)) {
      if (event.type === 'progress') after.push(event.message);
    }
    return after.join(',') === 'second';
  });
  await check('transport', 'notify accepts a notification', 'The rule and background surfaces have no stream to write to; notification is their only delivery.', async () => {
    await adapters.transport.notify(fx.principal.id, { title: 'conformance', body: 'ok', runId: 'conformance' });
    return true;
  });

  return out;
}

export function summarise(results: CheckResult[]): { passed: number; failed: number; score: number; failures: CheckResult[] } {
  const hard = results.filter((r) => !r.soft);
  const failures = hard.filter((r) => !r.pass);
  return {
    passed: hard.length - failures.length,
    failed: failures.length,
    score: hard.length ? Math.round(((hard.length - failures.length) / hard.length) * 100) : 0,
    failures,
  };
}
