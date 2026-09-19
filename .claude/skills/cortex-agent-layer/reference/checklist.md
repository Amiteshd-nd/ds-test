# Definition of Done, per phase

Do not start a phase with the previous one red. The order exists because each phase makes
the next one safe to build.

---

## Phase 0 — audit

- [ ] Auth, permissions, data, APIs, design system, and messaging are answered **in
      writing**, about the real codebase, in `docs/INTEGRATION.md`.
- [ ] The permission question has a number attached: can the authorization layer answer
      "can this principal read these 200 ids?" in one call, and how long does it take?
- [ ] Every gap is written down as a gap, not as a to-do that disappears.

**Red flag:** you have scaffolded a directory before answering these. Delete it.

## Phase 1 — adapter contracts

- [ ] Eight interfaces defined; the host implements what it can.
- [ ] Conformance suite runs against the host's implementations and reports honestly.
- [ ] **Module-boundary lint in CI**, with no allowlist. Retrofitting this is a rewrite.
- [ ] Run and Step are durable. A `SIGKILL` mid-run, a restart, and the run resumes at the
      node after the last one that completed — tested with a real child process, not a
      mocked one.

## Phase 2 — grounding

- [ ] Hybrid retrieval → **batched permission filter** → rerank → dedupe → budget trim.
- [ ] Permission filtering happens at retrieval. If it happens anywhere else, stop.
- [ ] Citations are verified against what was actually retrieved; fabricated ids are
      dropped and counted, not rendered.
- [ ] A relevance floor, so an unanswerable question retrieves nothing and the agent says
      so rather than being handed eight weak matches to bridge.
- [ ] Data health published: ownership coverage, orphan rate, duplicate names,
      neighbourhood size. Publish it early, so "fix the data" becomes a funded workstream
      rather than a surprise.

## Phase 3 — skills

- [ ] Every skill is a manifest with schemas, entitlements, side-effect class, rate limit,
      timeout, and retry policy.
- [ ] Description lint passes: twenty words, when to use, when not to.
- [ ] Similarity check at build time; CODEOWNERS review on the manifest directory.
- [ ] **Read-only only.** No write skill exists yet.

## Phase 4 — agents

- [ ] Agent manifests validate at load, and an invalid one fails the build with a message
      that names the file and the rule.
- [ ] A side-effecting skill without a matching gate is a build failure.

## Phase 5 — orchestration and surfaces

- [ ] Fixed workflow first. Dynamic planning behind a flag that is off.
- [ ] Runs are resumable, and an `awaiting_approval` run survives days.
- [ ] One manifest runs on chat, inline, rule, and background without modification.

## Phase 6 — native UI

- [ ] Headless hooks only; a lint rule bans styles in them.
- [ ] Typed blocks map to host components and stream progressively.
- [ ] An unregistered block type degrades to text. Never a crash.
- [ ] Every state is specified and built: empty-with-suggestions, loading, streaming,
      tool-running (by the skill's human name), awaiting approval, partial success,
      permission denied, rate limited, budget exceeded, no answer, human handoff.
- [ ] The empty state carries three to five context-aware suggestions. It is the screen
      everyone meets and the one nobody budgets for.
- [ ] AI-generated content is labelled as such, every time.
- [ ] Errors are announced, not only coloured.

## Phase 7 — guardrails and evals

- [ ] Retrieved content is delimited and declared inert. It may never authorise an action.
- [ ] Guardrails run **inside the stream**, not after it. A post-processor that runs once
      the tokens have been delivered has already lost.
- [ ] Red team at 100%: permission leakage, cross-tenant, injection, unauthorized action,
      exfiltration, budget exhaustion. Not graded on a curve.
- [ ] Golden set of 50–200 cases per agent gating merge; deterministic assertions on the
      pipeline, judge rubrics on the prose — and a skipped rubric is reported as skipped,
      never counted as a pass.
- [ ] A persistent "this was wrong" control writing into a triage queue, and a standing
      weekly slot for converting triaged failures into golden cases. Without it the golden
      set rots at launch quality.
- [ ] The playground exists: impersonate a principal, inspect the assembled context, diff
      two prompt versions on one input. Build it early; it pays for itself in a month.
