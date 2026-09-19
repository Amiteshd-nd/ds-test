# The eight adapters

Full signatures are in `packages/cortex/src/core/adapters/`. This is the reasoning behind
each one, and what goes wrong when it is implemented carelessly.

---

## 1 · IdentityAdapter — who is asking

```ts
interface IdentityAdapter {
  resolve(sessionToken: string): Promise<Principal | null>;
  entitlements(principal: Principal): Promise<Set<string>>;
}
```

`entitlements` returns capability strings (`"docs.read"`, `"message.send"`), **not roles**.
The skill registry and the policy layer both read them, and neither should have to know
that a lead can do everything a member can plus four more things.

A host with durable background runs also needs a way to resolve a principal id with no
session attached — the engine asks for `resolvePrincipal(id)` and degrades if it is
absent. Discover that at `doctor` time, not when a three-day approval expires.

## 2 · PolicyAdapter — what may they see and do

```ts
interface PolicyAdapter {
  canRead(principal: Principal, refs: EntityRef[]): Promise<boolean[]>;
  canInvoke(principal: Principal, skillId: string, args: object): Promise<Decision>;
  redact(principal: Principal, doc: Document): Promise<Document>;
}
```

**This is the adapter that decides whether the project is safe.** Three properties, all
load-bearing:

- **Batched.** An array in, an aligned array out. A per-id call makes the retrieval-time
  filter slow, and someone will eventually propose moving it to render time. That move is
  the end of the security model, so the signature forecloses it.
- **Order-preserving.** A misaligned result array silently leaks one record and hides
  another, and nothing about the symptom points at the cause.
- **Fast.** The conformance suite asserts 200 refs in under 150ms. If your authorization
  layer cannot do this, building that is the first task — ahead of anything in the agent
  layer.

`Decision` is `allow | deny | require_approval`, each with a reason string that is shown
to the user verbatim. A denial nobody can understand is a support ticket.

## 3 · RetrievalAdapter — grounding in host truth

```ts
interface RetrievalAdapter {
  search(q: Query, principal: Principal): Promise<Chunk[]>;
  fetch(refs: EntityRef[], principal: Principal): Promise<Document[]>;
}
```

The principal is passed so a host whose search engine already understands ACLs can push
the filter into the index. Hosts that cannot are still safe — the pipeline filters again
through `canRead` before anything reaches a model. Filtering twice is cheap; filtering
late is not.

Chunk ids must be **stable across identical searches**. Citations are ids, and an id that
moves between calls cannot be cited.

## 4 · GraphAdapter — the semantic layer

```ts
interface GraphAdapter {
  neighbors(ref, edgeTypes, depth): Promise<Subgraph>;
  resolveMention(text, hint?): Promise<EntityRef[]>;
  schema(): GraphSchema;
}
```

Optional, and the highest-value adapter after policy when the host's data supports it.
Traversing relationships beats reading isolated documents.

The failure mode is documented rather than designed around: if ownership is fuzzy and
naming is inconsistent, the agent inherits the mess. Measure it before promising quality —
ownership coverage, orphan rate, duplicate names, median neighbourhood size. A node with
forty thousand neighbours is useless for grounding.

## 5 · SkillAdapter — the host's APIs as callable tools

```ts
interface SkillAdapter {
  listSkills(): Promise<SkillManifest[]>;
  invoke(skillId, args, ctx): Promise<SkillResult>;
}
```

`invoke` returns an error rather than throwing when the skill does not exist. A model will
ask for a tool that is not there; that is a bad answer, not a crashed run.

Generate first-draft manifests from OpenAPI where one exists. Prefer MCP for external
tools — do not build a proprietary registry protocol.

## 6 · MemoryAdapter — where memory lives

One adapter, two record types, one retrieval call on top (`MemoryService.assemble`).
Splitting conversational and experiential memory into two systems costs more than it buys;
take the retrospective rather than repeating the history.

Hard rules that are not the adapter's choice:

- Scoped to `(principal_id, tenant_id)`. Cross-principal leakage is a Sev-1.
- Redacted on read, because entitlements can be revoked after a fact was written.
- Never a grounding source for factual claims. Memory shapes behaviour; retrieval supplies
  facts.
- Every derived fact carries provenance, and the person it is about can see and delete it.

If the host has messaging infrastructure with FIFO ordering, retries, and history, back
turn storage with it and delete a quarter of the infrastructure work.

## 7 · TransportAdapter — delivery and durability

```ts
interface TransportAdapter {
  emit(runId, event): Promise<void>;
  subscribe(runId, afterSeq?): AsyncIterable<{ seq: number; event: RunEvent }>;
  notify(principalId, notification): Promise<void>;
}
```

`afterSeq` is the whole requirement behind SSE `Last-Event-ID`. Events must be **persisted
before they are fanned out**, or a client that drops for a minute loses the middle of an
answer with no way to notice.

## 8 · DesignSystemAdapter — every pixel

TypeScript, in the host's UI. The agent layer ships hooks and typed blocks; the host ships
`Bubble`, `EntityCard`, `SkillCallCard`, `ApprovalPrompt`, `CitationChip`,
`StreamingCursor`, `ErrorState`, `EmptyState`.

Enforce it with a lint rule that bans `className`, `style`, and CSS imports inside the
headless package. A reference theme that is importable from production is a reference
theme that ends up in production.

---

## The conformance suite

`packages/cortex/tests/conformance/suite.ts` — 22 checks, runnable against any host's
adapters, and the same checks `doctor` turns into a readiness score. Point it at your
implementation on day two, not day twenty.

Every check states what it protects. A check whose purpose is unclear gets deleted rather
than fixed.
