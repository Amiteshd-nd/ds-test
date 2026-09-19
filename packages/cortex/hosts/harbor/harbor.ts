// Harbor — a support desk, and the second host CORTEX is installed into.
//
// It exists to test the claim in PRD §G1 and the M6 Definition of Done: that a different
// product integrates by implementing adapters and nothing else. So it is deliberately
// unlike Atlas in the ways most likely to break that claim:
//
//   · **Permissions are row-level, not label-level.** Atlas asks "what bucket is this in,
//     and can you see that bucket". Harbor asks "are you the assignee, do you manage this
//     customer, or are you in the queue that owns it" — a question about the relationship
//     between a person and a row, which is the shape most real products have and the
//     shape a bucket-based adapter would quietly get wrong.
//   · **Identity is an API key with scopes**, not a session token mapping to a role.
//   · **There is no graph.** GraphAdapter is the optional one; leaving it out is how you
//     find out whether it is really optional.
//   · **Visibility is per-article** (public vs internal), so the same principal reads some
//     records and not others within one type.
//
// Nothing here imports anything from Atlas, and nothing in src/core knows this file
// exists.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Decision, Document, EntityRef, InvocationContext, Principal, SkillManifest, SkillResult,
} from '../../src/core/adapters/index.ts';
import type { IdentityAdapter } from '../../src/core/adapters/identity.ts';
import type { PolicyAdapter } from '../../src/core/adapters/policy.ts';
import type { SkillAdapter } from '../../src/core/adapters/skill.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface HarborAgent { id: string; name: string; queues: string[]; role: 'agent' | 'supervisor'; apiKey: string; scopes: string[] }
interface HarborCustomer { id: string; name: string; plan: string; managerId: string }
interface HarborTicket { id: string; subject: string; queue: string; assigneeId: string; customerId: string; status: string; priority: string; body: string }
interface HarborArticle { id: string; title: string; visibility: 'public' | 'internal'; body: string }

const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data/harbor.json'), 'utf8')) as {
  agents: HarborAgent[];
  customers: HarborCustomer[];
  tickets: HarborTicket[];
  articles: HarborArticle[];
};

export const hostName = 'Harbor';

const agentById = new Map(data.agents.map((a) => [a.id, a]));
const ticketById = new Map(data.tickets.map((t) => [`ticket:${t.id}`, t]));
const articleById = new Map(data.articles.map((a) => [`article:${a.id}`, a]));
const customerById = new Map(data.customers.map((c) => [`customer:${c.id}`, c]));

/** Everything Harbor can ground on, as CORTEX documents. */
export const documents: Document[] = [
  ...data.tickets.map((t) => ({
    ref: `ticket:${t.id}`,
    type: 'ticket',
    title: `${t.id} — ${t.subject}`,
    body: t.body,
    meta: { queue: t.queue, status: t.status, priority: t.priority, customerId: t.customerId },
  })),
  ...data.articles.map((a) => ({
    ref: `article:${a.id}`,
    type: 'article',
    title: a.title,
    body: a.body,
    meta: { visibility: a.visibility },
  })),
  ...data.customers.map((c) => ({
    ref: `customer:${c.id}`,
    type: 'customer',
    title: c.name,
    body: `${c.name} is on the ${c.plan} plan. Their account manager is ${agentById.get(c.managerId)?.name ?? c.managerId}.`,
    meta: { plan: c.plan },
  })),
];

export function agentFor(id: string): HarborAgent | null {
  return agentById.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// 1. Identity — an API key with scopes, not a session with a role
// ---------------------------------------------------------------------------

export const identity: IdentityAdapter & { resolvePrincipal(id: string): Promise<Principal | null> } = {
  async resolve(sessionToken) {
    const agent = data.agents.find((a) => a.apiKey === sessionToken);
    return agent ? toPrincipal(agent) : null;
  },
  async entitlements(principal) {
    // Harbor's scopes are already capability strings, which is the shape the contract
    // asks for. A host whose model is roles would expand them here.
    return new Set(agentById.get(principal.id)?.scopes ?? []);
  },
  async resolvePrincipal(id) {
    const agent = agentById.get(id);
    return agent ? toPrincipal(agent) : null;
  },
};

function toPrincipal(agent: HarborAgent): Principal {
  return {
    id: agent.id,
    // Harbor has agents and supervisors; CORTEX's vocabulary has member/lead/admin. The
    // mapping is the adapter's job, and doing it here rather than teaching core about
    // support desks is the entire point of the boundary.
    type: agent.role === 'supervisor' ? 'lead' : 'member',
    orgId: 'harbor',
    locale: 'en-GB',
    tz: 'Europe/Stockholm',
    org: { data_residency: 'eu' },
  };
}

// ---------------------------------------------------------------------------
// 2. Policy — row-level, and this is where a second host earns its keep
// ---------------------------------------------------------------------------

/**
 * You may read a ticket if you are its assignee, if you manage its customer, or if you
 * are in the queue that owns it. Supervisors see every queue they are in, which in
 * Harbor's data is all of them.
 *
 * Note what is *not* here: any notion of a bucket or a label. Atlas's policy is a set
 * membership test; this one is three joins. Both satisfy the same interface, which is
 * the only claim the adapter makes.
 */
function canReadTicket(agent: HarborAgent, ticket: HarborTicket): boolean {
  if (ticket.assigneeId === agent.id) return true;
  if (agent.queues.includes(ticket.queue)) return true;
  const customer = data.customers.find((c) => c.id === ticket.customerId);
  return customer?.managerId === agent.id;
}

export const policy: PolicyAdapter = {
  async canRead(principal, refs) {
    const agent = agentById.get(principal.id);
    if (!agent) return refs.map(() => false);

    // Batched: one pass, three maps already built. The conformance suite asserts this
    // answers 200 refs inside 150ms, which is the check that stops a host from writing
    // the obvious per-ref version.
    return refs.map((ref) => {
      const ticket = ticketById.get(ref);
      if (ticket) return canReadTicket(agent, ticket);

      const article = articleById.get(ref);
      // Internal articles are for staff, and everyone here is staff — but a public
      // article stays readable even if the rest of the rules tighten later.
      if (article) return article.visibility === 'public' || agent.role === 'supervisor' || agent.scopes.includes('tickets:read');

      const customer = customerById.get(ref);
      if (customer) return customer.managerId === agent.id || agent.role === 'supervisor';

      // An id Harbor does not recognise is not permission to read it.
      return false;
    });
  },

  async canInvoke(principal, skillId): Promise<Decision> {
    const agent = agentById.get(principal.id);
    if (!agent) return { outcome: 'deny', reason: 'That API key no longer belongs to anyone.' };
    if (skillId === 'tickets.audit' && !agent.scopes.includes('tickets:audit')) {
      return { outcome: 'deny', reason: 'Auditing a ticket is a supervisor action.' };
    }
    return { outcome: 'allow', reason: 'ok' };
  },

  async redact(principal, doc) {
    const agent = agentById.get(principal.id);
    if (!agent) return { ...doc, body: '[removed]' };
    const [allowed] = await policy.canRead(principal, [doc.ref]);
    if (!allowed) return { ...doc, body: '[removed — you no longer have access to this record]' };
    // A card number in a ticket body is a compliance problem regardless of who is
    // reading, so the host masks it on the way out of the host.
    return { ...doc, body: doc.body.replace(/\b(?:\d[ -]?){12,15}\d\b/g, '[card number removed]') };
  },
};

// ---------------------------------------------------------------------------
// 5. Skills
// ---------------------------------------------------------------------------

const handlers: Record<string, (args: Record<string, unknown>, ctx: InvocationContext) => Promise<SkillResult>> = {
  async 'tickets.search'(args, ctx) {
    const query = String(args.query ?? '').toLowerCase();
    const terms = query.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const candidates = data.tickets.map((t) => `ticket:${t.id}`);
    // The skill re-checks permission itself. CORTEX filtered at retrieval, but a skill
    // is a door of its own and the host owns it.
    const allowed = await policy.canRead(ctx.principal, candidates);
    const visible = data.tickets.filter((_, i) => allowed[i]);

    const hits = visible
      .map((t) => ({ t, score: terms.filter((term) => `${t.subject} ${t.body} ${t.status} ${t.priority}`.toLowerCase().includes(term)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      ok: true,
      refs: hits.map((h) => `ticket:${h.t.id}`),
      data: {
        tickets: hits.map((h) => ({
          ref: `ticket:${h.t.id}`, subject: h.t.subject, status: h.t.status,
          priority: h.t.priority, queue: h.t.queue,
        })),
      },
    };
  },
};

export const skills: SkillAdapter = {
  async listSkills(): Promise<SkillManifest[]> {
    return [];
  },
  async invoke(skillId, args, ctx) {
    const handler = handlers[skillId];
    if (!handler) return { ok: false, error: { kind: 'not_found', message: `Harbor has no handler for ${skillId}` } };
    return handler(args, ctx);
  },
};

export function ticketRefs(): EntityRef[] {
  return data.tickets.map((t) => `ticket:${t.id}`);
}
