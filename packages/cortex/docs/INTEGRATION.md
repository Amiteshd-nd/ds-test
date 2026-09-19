# INTEGRATION

Two things live here: the **Phase 0 audit** of the host CORTEX is currently installed
into, and the **checklist** a second host works through to install it.

---

## Part 1 — Phase 0 audit: `atlas` (the demo host)

Nothing was scaffolded before these six questions were answered. A real host answers
them about a real codebase; Atlas is a fixture, and where the answer is "because I made
it up", it says so.

| Question | Atlas's answer |
|---|---|
| **Auth** — how is the current user resolved? | A signed opaque session token maps to a `Principal` in `adapters-host/data/principals.json`. Three roles: `member`, `lead`, `admin`. Entitlements are per-principal capability strings, not roles, so `PolicyAdapter` never has to reason about role hierarchies. |
| **Permissions** — central service, or scattered checks? | Central, and **batched**: `canRead(principal, refs[])` answers 200 ids in one pass over an ACL index. This was the single most important thing to get right — a per-id permission call turns a 24-chunk retrieval into 24 round trips and the retrieval-time filter becomes too slow to keep, which is how permission checks migrate to render time and the system stops being safe. |
| **Data** — entity types and relationships? | `Person`, `Team`, `Project`, `Doc`, `Decision`. Edges: `MEMBER_OF`, `LEADS`, `OWNS`, `WORKED_ON`, `MENTIONS`, `SUPERSEDES`. 27 entities and 31 edges — small enough to read in one sitting, which is what a fixture is for. |
| **Search backend?** | None. CORTEX supplies its own: BM25-ish keyword scoring plus the local hash embedder (D-3). A real host would back `RetrievalAdapter` with what it already has. |
| **APIs** — OpenAPI, GraphQL, or service clients? | Hand-written TypeScript service functions. No spec, so skill manifests are hand-authored rather than generated. The `OpenAPISkillAdapter` path in §5.3 is therefore **not** exercised by this host — flagged as a gap. |
| **Design system?** | The demo app's own tokens, in `demo/src/design/tokens.css`. CORTEX ships zero styles; `DesignSystemAdapter` is implemented at `demo/src/design/adapter.tsx`. |
| **Messaging infra** — FIFO, retries, history? | **No.** This is the §24 question 1 answer, and it is the expensive one: no host messaging means `TransportAdapter` is ours to build (D-4) rather than a two-day binding. |

### Gaps flagged

1. **No OpenAPI spec** → every skill manifest is hand-written and can drift from the
   function it binds to. Mitigated by a schema round-trip test in
   `tests/conformance/skills.test.ts`; not solved.
2. **No messaging infrastructure** → transport, retries, and history are CORTEX's
   problem. See D-4.
3. **Graph is tiny** → `doctor graph` passes, but on 27 entities. It proves the check
   runs, not that the data is good.
4. **No real embedder** → see D-3. Retrieval quality numbers from this host are not
   meaningful.

---

## Part 2 — installing CORTEX into a different host

The promise in PRD §G1 is five days. It holds only if you do these in order.

### Day 1 — audit, don't scaffold

Answer the seven questions above about *your* codebase, in writing, in this file. The
one that decides your schedule is permissions: **can your authorization layer answer
"can this principal read these 200 ids?" in one call?** If it cannot, building that is
the first task, ahead of anything in CORTEX. Everything else in this system is a
convenience; retrieval-time permission filtering is the security model.

### Day 2 — implement the adapters

Create `adapters-host/` in your repo and implement the eight interfaces from
`src/core/adapters/`. Start with three:

- `IdentityAdapter` — resolve your session token to a `Principal`.
- `PolicyAdapter` — `canRead` batched, `canInvoke`, `redact`.
- `RetrievalAdapter` — wrap your search. If you have none, `LocalRetrieval` in
  `src/core/grounding/local-retrieval.ts` is a working default over a document array.

`GraphAdapter` is optional and worth more than the other five combined if your data
supports it. `MemoryAdapter` and `TransportAdapter` have defaults you can keep on day 2.
`SkillAdapter` comes on day 3. `DesignSystemAdapter` is TypeScript in your UI, day 4.

### Day 3 — skills and one agent

Write skill manifests for three **read-only** host APIs. Write one agent manifest that
uses them. Do not write a write skill. Run `node scripts/doctor.ts` and fix what is red.

### Day 4 — render it

Implement `DesignSystemAdapter` with your own components. The hooks in
`src/ui-headless/` supply state; you supply every pixel. Budget most of this day for the
§13.4 states — empty, streaming, tool-running, permission-denied, partial, rate-limited.
The empty state is the one users actually meet.

### Day 5 — evals, then ramp

Write 20 golden cases against real questions your users ask. `node evals/runner/run.ts`.
Below `min_pass_rate`, you are not done. Run the red-team suite; it is not optional and
it is not graded on a curve.

### What you must not do

- Import anything from your app inside `src/core/**`. `pnpm lint` fails the build on it,
  and there is no allowlist because an allowlist is how the boundary dies.
- Filter permissions at render.
- Put a prompt string in a `.ts` file.
- Ship a write skill before your read-only golden set passes.
