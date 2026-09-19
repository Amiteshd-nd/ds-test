// Atlas — the demo host. THIS IS THE ONLY HOST-COUPLED PACKAGE (PRD §5.2).
//
// Everything a real product would already have — auth, an ACL, records, a search
// backend, service APIs — is a JSON file here. That is the point: core cannot tell the
// difference, because core only ever sees the eight adapter interfaces.
//
// A second host replaces this directory and `cortex.config.yaml`, and nothing else.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Decision, Document, EntityRef, EntityType, GraphSchema, InvocationContext,
  Principal, SkillManifest, SkillResult, Subgraph,
} from '../src/core/adapters/index.ts';
import type { GraphAdapter } from '../src/core/adapters/graph.ts';
import type { IdentityAdapter } from '../src/core/adapters/identity.ts';
import type { PolicyAdapter } from '../src/core/adapters/policy.ts';
import type { SkillAdapter } from '../src/core/adapters/skill.ts';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) as T;

interface AtlasPrincipal extends Principal {
  displayName: string;
  sessionToken: string;
  teams: string[];
  entitlements: string[];
}

interface AtlasEntity {
  ref: EntityRef;
  type: EntityType;
  title: string;
  body: string;
  /** The whole authorization model, deliberately tiny: org | hiring | northwind. */
  acl: 'org' | 'hiring' | 'northwind';
}

interface AtlasEdge { from: EntityRef; type: string; to: EntityRef }

export const principals: AtlasPrincipal[] = read('principals.json');
export const entities: AtlasEntity[] = read('entities.json');
export const edges: AtlasEdge[] = read('edges.json');

const byRef = new Map(entities.map((e) => [e.ref, e]));

export const documents: Document[] = entities.map((e) => ({
  ref: e.ref,
  type: e.type,
  title: e.title,
  body: e.body,
  meta: { acl: e.acl },
}));

/**
 * Applying an inline edit. THIS IS ATLAS'S OWN ACTION, not CORTEX's.
 *
 * The agent proposed a diff and the person accepted it in Atlas's own UI, so Atlas writes
 * to its own document on its own authority — the pattern PRD Appendix A calls "user
 * publishes; agent never posts". There is no skill, no approval gate, and no CORTEX code
 * anywhere in this path, which is exactly why the inline surface needs no write skill.
 */
export function applyEdit(ref: EntityRef, before: string, after: string, principal: Principal): { ok: boolean; reason?: string } {
  const entity = byRef.get(ref);
  if (!entity) return { ok: false, reason: `No record ${ref}.` };
  if (!bucketsFor(principal).has(entity.acl)) return { ok: false, reason: 'You cannot edit that record.' };
  if (!entity.body.includes(before)) {
    // The document moved under the proposal — someone else edited it while this one was
    // on screen. Refusing beats applying an edit to text that is no longer there.
    return { ok: false, reason: 'That passage is no longer in the document. Reload and try again.' };
  }
  entity.body = entity.body.replace(before, after);
  const doc = documents.find((d) => d.ref === ref);
  if (doc) doc.body = entity.body;
  edits.push({ ref, before, after, byId: principal.id, at: new Date().toISOString() });
  return { ok: true };
}

export interface AtlasEdit { ref: EntityRef; before: string; after: string; byId: string; at: string }
const edits: AtlasEdit[] = [];
export const editsMade = (): AtlasEdit[] => [...edits];
export function resetEdits(): void {
  edits.length = 0;
}

export function documentFor(ref: EntityRef): Document | undefined {
  return documents.find((d) => d.ref === ref);
}

export function principalById(id: string): AtlasPrincipal | null {
  return principals.find((p) => p.id === id) ?? null;
}

/** Which ACL buckets a principal can read. The whole permission model in four lines. */
function bucketsFor(p: Principal): Set<string> {
  const ap = principalById(p.id);
  const out = new Set<string>();
  if (!ap) return out;
  if (ap.orgId === 'atlas') out.add('org');
  if (ap.orgId === 'northwind') out.add('northwind');
  if (ap.teams.includes('team:hiring')) out.add('hiring');
  return out;
}

// ---------------------------------------------------------------------------
// 1. Identity
// ---------------------------------------------------------------------------

export const identity: IdentityAdapter & { resolvePrincipal(id: string): Promise<Principal | null> } = {
  async resolve(sessionToken) {
    return principals.find((p) => p.sessionToken === sessionToken) ?? null;
  },
  async entitlements(principal) {
    return new Set(principalById(principal.id)?.entitlements ?? []);
  },
  /**
   * Not part of the interface. The engine asks for it when resuming a run whose session
   * is long gone (`Engine.#principalFor`), and a host that cannot answer it cannot have
   * durable background runs. Atlas can, so it does.
   */
  async resolvePrincipal(id) {
    return principalById(id);
  },
};

// ---------------------------------------------------------------------------
// 2. Policy — batched, because retrieval filters hundreds of candidates per turn
// ---------------------------------------------------------------------------

export const policy: PolicyAdapter = {
  async canRead(principal, refs) {
    const buckets = bucketsFor(principal);
    // One pass. No per-ref await, no N+1 — see docs/INTEGRATION.md, Phase 0.
    return refs.map((ref) => {
      const e = byRef.get(ref);
      return e ? buckets.has(e.acl) : false;
    });
  },

  async canInvoke(principal, skillId, args): Promise<Decision> {
    void args;
    const ap = principalById(principal.id);
    if (!ap) return { outcome: 'deny', reason: 'Your session no longer resolves to a person.' };
    if (skillId.startsWith('hiring.') && !ap.teams.includes('team:hiring')) {
      return { outcome: 'deny', reason: 'Hiring records are restricted to the hiring committee.' };
    }
    return { outcome: 'allow', reason: 'ok' };
  },

  async redact(principal, doc) {
    const buckets = bucketsFor(principal);
    const e = byRef.get(doc.ref);
    if (e && !buckets.has(e.acl)) {
      return { ...doc, body: '[removed — you no longer have access to this record]' };
    }
    return doc;
  },
};

// ---------------------------------------------------------------------------
// 4. Graph
// ---------------------------------------------------------------------------

export const graph: GraphAdapter = {
  async neighbors(ref, edgeTypes, depth = 1) {
    const nodes = new Set<EntityRef>([ref]);
    const found: AtlasEdge[] = [];
    let frontier = [ref];
    for (let d = 0; d < depth; d++) {
      const next: EntityRef[] = [];
      for (const node of frontier) {
        for (const e of edges) {
          const matches = edgeTypes.length === 0 || edgeTypes.includes(e.type);
          if (!matches) continue;
          if (e.from === node && !nodes.has(e.to)) { nodes.add(e.to); next.push(e.to); found.push(e); }
          else if (e.to === node && !nodes.has(e.from)) { nodes.add(e.from); next.push(e.from); found.push(e); }
        }
      }
      frontier = next;
    }
    nodes.delete(ref);
    return { nodes: [...nodes], edges: found } satisfies Subgraph;
  },

  async resolveMention(text, hint) {
    const lower = text.toLowerCase();
    return entities
      .filter((e) => (!hint || e.type === hint))
      .filter((e) => {
        const name = e.title.split('—')[0].trim().toLowerCase();
        return name.length > 3 && lower.includes(name.split(' ')[0]);
      })
      .map((e) => e.ref)
      .slice(0, 5);
  },

  schema(): GraphSchema {
    return {
      nodeTypes: [...new Set(entities.map((e) => e.type))],
      edgeTypes: [...new Set(edges.map((e) => e.type))],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. Skills — the host's APIs, behind manifests in manifests/skills/
// ---------------------------------------------------------------------------

/**
 * Atlas's comment log — the one place this fixture actually *changes*.
 *
 * In memory, so it resets with the process. That is fine for a fixture and worth being
 * plain about: the idempotency record that stops a comment being posted twice lives in
 * CORTEX's own `invocations` table and does survive a restart, so the guarantee being
 * demonstrated is real even though the data behind it is not.
 */
export interface AtlasComment {
  id: string;
  ref: EntityRef;
  body: string;
  authorId: string;
  at: string;
}

const comments: AtlasComment[] = [];

export function commentsOn(ref?: EntityRef): AtlasComment[] {
  return ref ? comments.filter((c) => c.ref === ref) : [...comments];
}

/** Test seam: the fixture is a module, and tests should not inherit each other's writes. */
export function resetComments(): void {
  comments.length = 0;
}

const handlers: Record<string, (args: Record<string, unknown>, ctx: InvocationContext) => Promise<SkillResult>> = {
  async 'people.search'(args) {
    const q = String(args.query ?? '').toLowerCase();
    const terms = q.split(/[^a-z]+/).filter((w) => w.length > 2);
    const hits = entities
      .filter((e) => e.type === 'person')
      .map((e) => ({ e, score: terms.filter((t) => (e.title + ' ' + e.body).toLowerCase().includes(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return {
      ok: true,
      refs: hits.map((h) => h.e.ref),
      data: { people: hits.map((h) => ({ ref: h.e.ref, name: h.e.title.split('—')[0].trim(), summary: h.e.body.split('\n')[0] })) },
    };
  },

  async 'projects.status'(args) {
    const q = String(args.query ?? '').toLowerCase();
    const hits = entities
      .filter((e) => e.type === 'project')
      .filter((e) => q.split(/[^a-z0-9]+/).some((t) => t.length > 3 && (e.title + e.body).toLowerCase().includes(t)))
      .slice(0, 5);
    return {
      ok: true,
      refs: hits.map((h) => h.ref),
      data: {
        projects: hits.map((e) => ({
          ref: e.ref,
          name: e.title,
          status: (/Status: ([^.\n]+)/.exec(e.body)?.[1] ?? 'unknown').trim(),
          owner: (/Owner: ([^.\n]+)/.exec(e.body)?.[1] ?? 'unknown').trim(),
        })),
      },
    };
  },

  async 'decisions.history'(args) {
    const ref = String(args.ref ?? '');
    const chain: { ref: string; title: string }[] = [];
    let current: string | undefined = ref;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const e = byRef.get(current);
      if (!e) break;
      chain.push({ ref: e.ref, title: e.title });
      current = edges.find((x) => x.from === current && x.type === 'SUPERSEDES')?.to;
    }
    return { ok: true, refs: chain.map((c) => c.ref), data: { chain } };
  },
};

Object.assign(handlers, {
  /**
   * The first skill in this system that changes anything. Everything about it is
   * deliberately small — a comment on a record, reversible by deleting it — because the
   * point of the first write skill is to exercise the approval path, not to be
   * impressive.
   */
  async 'docs.comment'(args: Record<string, unknown>, ctx: InvocationContext): Promise<SkillResult> {
    const ref = String(args.ref ?? '');
    const body = String(args.body ?? '');
    const target = byRef.get(ref);
    if (!target) {
      return { ok: false, error: { kind: 'not_found', message: `Atlas has no record ${ref}.` } };
    }
    // The host checks permission again at the point of writing. CORTEX checked before
    // asking, and a human approved in between — but the host owns its own data and does
    // not take either of those as authority.
    const [allowed] = await policy.canRead(ctx.principal, [ref]);
    if (!allowed) {
      return { ok: false, error: { kind: 'permission_denied', message: `You cannot comment on ${ref}.` } };
    }
    const comment: AtlasComment = {
      id: `comment:${comments.length + 1}`,
      ref,
      body,
      authorId: ctx.principal.id,
      at: new Date().toISOString(),
    };
    comments.push(comment);
    return { ok: true, refs: [ref], data: { comment_id: comment.id, posted_at: comment.at } };
  },
});

export const skills: SkillAdapter = {
  async listSkills(): Promise<SkillManifest[]> {
    // Atlas has no OpenAPI spec (docs/INTEGRATION.md flags this), so the manifests in
    // manifests/skills/ are the source of truth and the registry loads them. This
    // returns nothing rather than a second, drifting copy.
    return [];
  },

  async invoke(skillId, args, ctx) {
    const handler = handlers[skillId];
    if (!handler) return { ok: false, error: { kind: 'not_found', message: `Atlas has no handler for ${skillId}` } };
    return handler(args, ctx);
  },
};

export const hostName = 'Atlas';
