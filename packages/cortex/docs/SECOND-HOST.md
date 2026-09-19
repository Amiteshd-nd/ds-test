# The second host

PRD §19, M6:

> **DoD (and the real proof of this whole PRD):** a second, unrelated host application is
> integrated by a team that did not build CORTEX, in ≤5 days, touching only
> `adapters-host/` and `cortex.config.yaml`.

This is the report. It is written to be read by someone deciding whether to believe the
portability claim, so it leads with what went wrong.

**One half of the DoD cannot be satisfied here and is not claimed.** Harbor was built by
the same author as CORTEX, in the same session. That removes the most valuable thing the
test measures — whether the *documentation* is enough for someone who was not in the
room. What follows is the other half: whether the code held, measured by what had to
change outside the new host's own directory.

---

## The host

**Harbor**, a customer support desk. Chosen to be unlike Atlas in the ways most likely to
break the boundary rather than in ways that merely look different:

| | Atlas | Harbor |
|---|---|---|
| Permission model | label buckets — "is this record `org`, `hiring`, or `northwind`, and can you see that bucket" | **row-level relationships** — "are you the assignee, do you manage this customer, are you in the owning queue" |
| Identity | session token → principal with a role | API key → agent with scopes |
| Entity shapes | documents, people, projects, decisions | tickets, customers, articles, agents |
| Graph | yes | **none** — the optional adapter, left out on purpose |
| Visibility | uniform per bucket | per-article (`public` / `internal`) within one type |
| Residency | `in` | `eu`, which makes the router's residency policy actually fire |

The permission difference is the one that matters. Atlas's `canRead` is a set membership
test. Harbor's is three joins — assignment, account management, queue membership — which
is the shape most real products have, and the shape a bucket-based adapter would quietly
get wrong.

## Did it work

Yes, and the interesting part is *how it failed first*.

```
Harbor · harbor
adapters  ████████████████████  100%  (19/19)
manifests  1 agent(s), 1 skill(s), 0 error(s), 0 warning(s)
green — this host may ship.

golden · harbor-triage   3/3 (100%), required 90%   OK
red team                 2/2 (100%), required 100%  OK
```

The permission model demonstrably works. The same question, asked by two agents:

```
rosa  · What is happening with the SSO login loop for Brightline?
        sources: article:A-02
theo  · What is happening with the SSO login loop for Brightline?
        sources: customer:brightline, ticket:T-1042, article:A-02
```

Rosa fails all three of Harbor's read tests for T-1042 — not the assignee, not in the
platform queue, not Brightline's account manager — so the ticket never reaches the model,
even though the question names it and she can read the public article about the same
subject. Nothing in `src/core` knows what a queue is.

## What had to change outside the new host's directory

The DoD says "touching only `adapters-host/` and `cortex.config.yaml`". **That was not
true.** Ten things outside `hosts/harbor/` had to change, in four groups.

### 1. Two capabilities the service used but the contract never declared

The worst finding, and the most useful one.

`src/server` called `memory.inspect()` and `transport.notificationStream()`. Neither was
on `MemoryAdapter` or `TransportAdapter` — both were extensions the *default*
implementations happened to have. A host that implemented the published eight interfaces
faithfully would have compiled, passed conformance, and then crashed on
`GET /v1/memory/me` and the notification stream.

Fixed by adding both to the interfaces, where they always belonged: §15 mandates the
memory route and §12 mandates cross-device notification, so these are requirements, not
conveniences. `InProcessTransport`'s test-collection field was renamed `sent` to free the
name.

**This is exactly what a second host is for.** No amount of reading the first host's code
finds it, because the first host satisfies it by accident.

### 2. Core assumed there was only one set of manifests

`SkillRegistry`, `AgentRegistry`, `RuleRegistry`, and `PromptStore` all resolved their
directories from `PACKAGE_ROOT`. Two hosts in one repo cannot share one manifest
directory, and two hosts in one *process* — which the eval runner and doctor now do —
cannot share one config cache either.

Fixed with a `paths` block in the config, resolved relative to the config file, plus a
config cache keyed by file rather than a single slot. A host is now a directory: its
config, its adapters, its manifests, its prompts. `PromptStore` also needed one Jinja
environment per directory, or one host's `{% include "_shared/safety.j2" %}` would
resolve against the other's file.

### 3. The service imported one host by name

`src/server/main.ts` began with `import { createAtlasAdapters } from '../../adapters-host'`.
Correct for a deployment, wrong for a package: Harbor could not start a server without
editing CORTEX.

Split into `src/server/service.ts` — a `createService({ config, hostName, createAdapters,
hostRoutes })` factory — and an 18-line entry per host. Atlas's own endpoints (the inline
document editor) moved out of the service into `adapters-host/routes.ts`, which is where
they always belonged: they are the host's API, not CORTEX's.

### 4. Tooling assumed Atlas

`scripts/doctor.ts` and `evals/runner/run.ts` imported Atlas directly, and `doctor`'s
graph-health section assumed a `GraphAdapter` exists. A new `hosts/registry.ts` maps a
config's `host.id` to its adapters and its conformance fixture. **A real deployment with
one host would not need this file** — its entry imports its own adapters and that is the
end of it. It exists because this repo now contains two.

`doctor` also learned to say "no GraphAdapter, nothing to check" rather than failing, which
is the honest behaviour for an optional adapter and was untested until a host omitted it.

## What did *not* have to change

Everything that matters:

- **Not one line of the orchestrator, the grounding pipeline, the router, the guardrails,
  the egress guard, the memory service, the trace store, or the run state machine.**
- Not one adapter *signature*, beyond the two additions above.
- Not one manifest, prompt, or eval case belonging to Atlas.
- The module-boundary lint stayed clean throughout: `src/core` still imports nothing from
  either host.
- Atlas's suites — 78 tests, golden 9/9, red team 14/14 — passed unchanged after every
  one of these changes.

The four groups above are all *plumbing*: where files live, who constructs what, and two
interface methods that were being used without being declared. None of them is the agent
layer, and none of them recurs for a third host.

## How long

Unmeasurable honestly. It was one continuous session by the person who wrote CORTEX, which
is precisely the population the five-day claim is not about. What can be said:

- Harbor is **8 files**: adapters, an index, a config, one prompt with two shared
  fragments, one skill manifest, one agent manifest, and a data fixture.
- The conformance suite found the shape of every gap before a single agent ran.
- The two undeclared-capability bugs would each have been a confusing runtime failure
  without it.

## What a third host would hit

Nothing in groups 2, 3, or 4 — those are fixed for good. Group 1 is the open risk: there
is no automated check that the service only calls methods the interfaces declare. TypeScript
catches it now because the service is typed against `HostAdapters`, which is how these two
were found — but a host-specific cast would hide it again. Worth a lint rule.

Remaining known gaps for a real second host:

- ~~**No `cortex init`.**~~ **Fixed after this report was written.** Harbor's eight files
  were written by hand from Atlas's; `node scripts/init.ts <id>` now scaffolds the same
  shape, and `doctor` on a fresh scaffold explains what is missing instead of throwing.
- ~~`hosts/registry.ts` is a repo artifact a reader could mistake for required
  plumbing.~~ **Fixed after this report was written**: host discovery is now a convention
  — `hosts/<id>/index.ts` exporting an adapter factory and a conformance fixture — so
  nothing has to be registered anywhere. `cortex init` scaffolding a host that the next
  command could not find is what prompted it.
- **The demo UI is Atlas's.** Harbor has no interface; it was exercised through the API,
  the eval runner, and doctor. §13's design-system contract is therefore unproven on a
  second host — the one adapter of the eight that this exercise did not test.
