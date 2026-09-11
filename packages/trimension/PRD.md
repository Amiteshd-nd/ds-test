# Agent-Native 3D Drafting Canvas — PRD & Build Plan

**Working name:** `axon`
**Status:** Foundation spec, v1
**Audience:** Claude Code (primary), human engineers (secondary)
**Last updated:** 2026-09-11

---

## 0. How to use this document

If you are Claude Code: read §1–§5 before writing any code. §1 is product intent, §3 contains
**hard architectural invariants** that must not be violated even when a simpler local solution
presents itself, and §4 is the milestone plan. §6 contains the prompt sequence — the human will
paste these one at a time. Do not skip ahead to later milestones.

Copy §3 and §7 verbatim into `CLAUDE.md` at the repo root as the first action of M0.

---

## 1. Product

### 1.1 One-line

A browser-native 3D drafting canvas that ingests AutoCAD drawings and is editable by both a human
and an AI agent operating as peers on the same document.

### 1.2 The problem

Architectural and MEP work lives in 2D DWG. Turning a drawing into a 3D model that you can query,
check and document is manual, slow, and thrown away after each project. Existing AI CAD tooling
generates *content* (images, blocks, meshes) but does not *edit the model* — the AI sits in a side
panel and hands artifacts back to a human who then does the real work.

### 1.3 The bet

The agent should be a native client of the document, at the same privilege level as the UI, writing
through the same validated commit path a human mouse click writes through. Everything else — which
LLM, how good the chat UI is — is replaceable. This is the only part that is hard to retrofit.

### 1.4 Non-goals for v1

- Full BIM authoring. We import and enrich; we do not replace Revit.
- Photorealistic rendering.
- MEP systems, structural analysis, code checking.
- Mobile authoring (view-only is fine).
- Real-time multi-human collaboration at scale. The concurrency work is for *agents*, humans second.

### 1.5 Success criteria for the foundation (M0–M4)

1. Import a real 500-entity DXF floor plan and render it at 60 FPS in the browser.
2. Extrude walls to 3D with door/window openings subtracted, driven entirely by commits.
3. An automated test drives the exact same commit sequence headlessly on a server and produces a
   byte-identical document hash and a visually comparable PNG.
4. Every derived dimension in the 3D result carries a provenance tag.

---

## 2. Reference architectures we are borrowing from

Read these as design constraints, not trivia.

**Rayon (rayon.design)** — browser 2D CAD, Rust core compiled to Wasm behind a JS/HTML/CSS UI,
Figma-inspired. Take from them:

- Document state lives in Wasm linear memory; JS is a transport layer only. They are explicit that
  the data is too large to exist in two places, so you must choose one.
- Git-like commits: diffs sent to a central per-session authority, validated against invariants,
  applied, then broadcast. Not CRDT. Invalid commits are rejected and the emitting client reverses.
- The same Rust crates compile for client and server, so validation logic cannot diverge.
- Documents persisted as files in blob storage, one per model. They tried a relational DB and found
  a hundred models already meant millions of rows.
- Lazy migration: a client opening an old-format document emits a commit that migrates it.
- CAD commands modeled as finite state machines (they use XState).

Do **not** copy their renderer strategy wholesale. Their problem was ~500k short 2D line segments
and GPU hatch fills. Ours is a few thousand extruded solids. We need far less renderer
sophistication and should spend that budget on geometry instead.

**Motif (agent-native BIM, launched 2026-09-08)** — take from them:

- UI, API and agents are all clients of the same data model. An MCP server layered on an app API
  cannot give the model deeper access than that API already permits; we are avoiding that trap by
  having no privileged internal API.
- Multi-schema, not canonical. Imported DWG data is retained in its own schema *alongside* native
  objects rather than being lossily translated into one universal object model.
- Composition over deep inheritance, with a runtime type registry, universal identifiers and
  explicit relationships between objects.
- Never put the whole model in the context window — select the data the task needs, including
  spatial subsets.
- One graphics stack that runs in the browser and headlessly in the cloud, so an agent can see what
  it made without a human display.
- Designed on the assumption agents will be wrong: plan-then-apply, role-based write permissions,
  unlimited history, clean restore.
- "Don't rent the same thought twice" — once the agent solves something, freeze it into
  deterministic code or a reusable skill instead of paying an LLM to rediscover it.

---

## 3. HARD INVARIANTS

These are not preferences. Violating any of them invalidates the architecture. If a task appears to
require breaking one, stop and ask the human.

**I1 — Single write path.**
Every mutation to the document is a `Commit`. `commit::validate(&doc, &commit) -> Result<(),
Vec<Violation>>` runs before any apply, on both client and server, from the same code. There is no
`doc.entities.insert()` reachable from outside the `commit` crate. No exceptions for imports, for
migrations, or for the agent.

**I2 — Rust owns the document.**
TypeScript holds zero entity data. No mirrored store, no Redux slice of geometry, no
`useState<Entity[]>`. The TS layer holds: view state (camera, selection ids, active tool), UI state,
and chat transcript. Everything else is queried from Wasm on demand.

**I3 — Agent tools and UI commands are the same commands.**
There is exactly one command registry. A human clicking "extrude wall" and an agent calling
`extrude_wall` dispatch through the same enum variant and produce the same commit. Tool JSON Schema
is *generated* from the Rust command types via `schemars` and never hand-written, so the two cannot
drift.

**I4 — Provenance on every derived value.**
Any number not literally read from the source drawing carries `Provenance::{Measured, Inferred,
Assumed}` plus a short reason string. Wall height defaulted to 2700mm is `Assumed`. A wall centreline
computed from two parallel polylines is `Inferred`. A dimension read from a DXF `DIMENSION` entity is
`Measured`. This is surfaced in the UI. Non-negotiable: without it, nobody can sign off on the model.

**I5 — No whole-model context.**
The agent never receives a serialized document. It receives results of `query_entities`,
`describe_region`, `measure`, and `render_view`. If a task seems to need the whole model, the answer
is a better query, not a bigger context window.

**I6 — Render parity.**
`render::view(&doc, camera) -> Rgba8Image` must work with no window, no canvas, no browser, on a
headless Linux server. The browser path is the same function with a different surface. A CI test
asserts this.

**I7 — Plan before apply for agents.**
Agent-initiated multi-commit operations emit a `Plan` (list of intended commits + human-readable
summary) that is surfaced for approval before any commit is applied. Single read-only tool calls do
not need approval. Writes do.

**I8 — Imports are additive, never destructive.**
Original DXF/DWG entities are preserved in a `source` schema on the document. Native objects
reference them by id. Re-import of a revised drawing diffs against the source schema, not against
derived geometry.

---

## 4. Technical architecture

### 4.1 Repo layout

```
axon/
├── CLAUDE.md                  # §3 + §7 of this doc, verbatim
├── Cargo.toml                 # workspace
├── crates/
│   ├── doc/                   # entity store, ids, components, type registry
│   ├── commit/                # Commit, Diff, validate, apply, invariants
│   ├── import-dxf/            # DXF -> source schema -> native objects
│   ├── geom2d/                # curves, polyline healing, R-tree spatial index
│   ├── solid/                 # profile extraction, extrusion, booleans, tessellation
│   ├── render/                # wgpu: browser surface + headless surface
│   ├── api/                   # command registry, schemars tool schemas, query layer
│   ├── wasm/                  # wasm-bindgen boundary (thin; no logic)
│   └── server/                # axum session server, ws, blob persistence
├── apps/
│   ├── web/                   # React + TS + XState shell, chat panel
│   └── agent/                 # AI SDK 7 host, tool bridge, plan/approve loop
├── fixtures/
│   ├── dxf/                   # committed test drawings, small
│   └── golden/                # golden document hashes + reference PNGs
└── xtask/                     # build orchestration (wasm-pack, schema codegen)
```

### 4.2 Compile targets

One codebase, three targets. This is the highest-leverage decision in the whole project.

| Target | Used for |
|---|---|
| `wasm32-unknown-unknown` | Browser client |
| host native | Session server, invariant validation |
| host native, headless | Agent's `render_view`, CI parity tests |

`wgpu` is chosen over three.js specifically because it covers browser WebGPU, native
Vulkan/Metal/DX12, and a headless surface from one source. With three.js we would maintain a second
server-side render path, which breaks I6 in practice even if it passes in theory.

**Version pinning:** do not trust versions from memory. At M0, resolve the current stable versions of
`wgpu`, `wasm-bindgen`, `schemars`, `axum`, `rstar`, and the AI SDK by checking crates.io / npm, and
record them in a `VERSIONS.md`. Flag any that require a nightly toolchain.

### 4.3 Document model

Composition, not inheritance. An entity is an id plus a set of components.

```rust
pub struct EntityId(u64);            // stable for the life of the document

pub struct Document {
    entities: SlotMap<EntityId, ComponentSet>,
    types: TypeRegistry,             // runtime-registrable
    layers: LayerTree,               // nested; cycles are an invariant violation
    source: SourceSchema,            // I8: raw imported DXF entities
    index: RTree<EntityId>,          // geom2d spatial index
    format_version: u32,
}
```

Components to start with: `Transform`, `Polyline2d`, `WallProfile`, `Opening`, `Solid3d`,
`LayerRef`, `SourceRef`, `Provenance`, `Label`. Add via the registry, not via new enum variants in
`doc`.

Layer cycle prevention is the canonical invariant test — it is exactly the case Rayon cites as
impossible to guarantee client-side.

### 4.4 Commit model

```rust
pub struct Commit {
    id: CommitId,
    parent: CommitId,
    author: Author,          // Human(UserId) | Agent(AgentId, PlanId)
    ops: Vec<Op>,
    message: String,
}
```

Server is the sequencer. Per-document process holds the doc in memory, validates, applies, assigns
sequence, broadcasts. Conflicting commits apply in arrival order; rejected commits are reversed by
the emitting client. History is append-only and unbounded; `Author` makes agent edits auditable and
`PlanId` links them back to the approved plan.

### 4.5 The 2D→3D pipeline

This is the product's core value and where most of the real engineering is. Stage it:

1. **Heal** — snap endpoints, close near-loops, remove duplicate segments (`geom2d`).
2. **Classify** — which polylines are walls, which are openings, which are annotation. Use DXF layer
   names, block references and linetype first; these are far cleaner signals than geometry or pixels.
   Emit `Provenance::Inferred` with the rule that fired.
3. **Centreline + thickness** — pair parallel polylines into wall runs.
4. **Profile** — build closed 2D profiles per wall run.
5. **Extrude** — profile → prism. Height from an `Assumed` default unless a dimension or text height
   annotation is found.
6. **Subtract openings** — boolean per door/window block reference.
7. **Tessellate** → render buffers.

For v1 use our own extrusion plus `Manifold` for mesh booleans. Do **not** pull in OCCT yet. Add it
server-side only when real fillets, NURBS or STEP export are required — the LGPL C++ boundary from
Rust-in-Wasm is genuinely painful and must not be paid for before it is needed.

### 4.6 Import: DXF first, DWG later

Start with DXF only. Rust DXF crates are workable; native Rust DWG is not. The DWG path, when we
need it, is libredwg over C FFI on the **server only** (its DWG 2018+ coverage is known to be
inconsistent), or a commercial SDK. Design `import-dxf` behind an `Importer` trait so DWG slots in
without touching `doc`.

### 4.7 Agent layer

Tool families — note the fourth is the one everyone skips and it is the one that makes this work:

| Tool | Kind | Notes |
|---|---|---|
| `query_entities(bbox, layer, type, limit)` | read | Spatial subset only. Hard cap on returned count. |
| `describe_region(bbox)` | read | Summary statistics + layer breakdown, not entity dumps. |
| `measure(ids)` | read | Lengths, areas, distances. Returns provenance. |
| `render_view(camera, mode)` | read | Headless PNG. Closes the perception loop. |
| `apply_commit(ops)` | write | Requires an approved `PlanId`. |

Host in TypeScript with AI SDK 7: its tool-approval support maps directly onto I7, `WorkflowAgent`
durability covers long extrusion jobs, and MCP Apps is how the 3D canvas renders inline in the chat
rather than beside it.

The `render_view` tool is not optional polish. Published benchmark work on agentic CAD shows a model
driven through a tool loop that can render and query geometry substantially outperforms the same
model writing scripts blind, including on output validity. Build it in M3, not later.

### 4.8 Commands as state machines

A CAD command handling mouse, keyboard and modifier events across multiple states *is* a finite
state machine. Model them explicitly (XState in the shell, a matching enum in `api`). The useful
consequence: an FSM's input alphabet is already a tool schema, so the agent enters the same machine a
human's mouse enters. This is how I3 stays true without discipline.

---

## 5. Milestones

Foundation is **M0–M4**. Stop there, review, then continue.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold | Workspace builds for all three targets; `VERSIONS.md` written; CLAUDE.md in place; CI green |
| M1 | Document + commit core | Layer-cycle invariant test passes; commit round-trips; document hash is deterministic |
| M2 | DXF import | Fixture DXF imports into source schema + classified native objects with provenance |
| M3 | Renderer | 2D plan view in browser at 60 FPS with 5k entities; headless PNG parity test green |
| M4 | 2D→3D | Walls extrude with openings subtracted; every dimension has provenance |
| M5 | Session server | Two clients + one headless agent client converge on the same document |
| M6 | Tool surface | Tool schemas generated from Rust; agent applies a commit via approved plan |
| M7 | Chat-native canvas | Canvas renders inline in the chat; plan approval UI works |

---

## 6. Prompt sequence for Claude Code

Paste one at a time. Do not batch. After each, review the diff before proceeding.

### Prompt 0 — Orientation

```
Read PRD-AGENT-NATIVE-CAD.md in full before doing anything.

Then do only this:
1. Create CLAUDE.md at the repo root containing sections 3 (HARD INVARIANTS) and 7
   (ANTI-PATTERNS) of the PRD, verbatim, plus a one-paragraph project summary.
2. Resolve the current stable versions of: wgpu, wasm-bindgen, wasm-pack, schemars,
   serde, axum, rstar, slotmap, and the dxf crate. Check crates.io — do not use
   versions from memory. Do the same for the Vercel AI SDK on npm. Write them to
   VERSIONS.md with the date checked, and flag anything requiring a nightly toolchain.
3. Tell me in your reply which of my architectural choices you think are wrong, and
   why. Be specific and be blunt. I would rather argue now than refactor at M4.

Write no other code yet.
```

### Prompt 1 — M0 scaffold

```
M0: scaffold only, no domain logic.

Create the Cargo workspace and crate skeletons exactly as laid out in PRD §4.1. Each
crate gets a lib.rs with its module structure stubbed and doc comments stating its
responsibility and what it must NOT depend on.

Dependency rules, enforced by what's in each Cargo.toml:
- doc depends on nothing in this workspace
- commit depends on doc only
- geom2d depends on doc
- solid depends on doc, geom2d
- import-dxf depends on doc, commit, geom2d
- render depends on doc, solid
- api depends on all of the above
- wasm and server depend on api only
- nothing depends on wasm or server

Set up xtask with commands: `build-wasm`, `build-server`, `test-all`, `gen-schemas`.
Set up CI that builds all three targets from PRD §4.2 and runs tests.

Prove the three targets work with a trivial function, nothing more.

Done when: `cargo xtask test-all` is green and all three targets build.
```

### Prompt 2 — M1 document and commit core

```
M1: the document and commit core. This is the most important code in the project —
take your time and write the tests first.

Implement per PRD §4.3 and §4.4:
- Document, EntityId, ComponentSet, TypeRegistry, LayerTree, SourceSchema
- The starting component set from §4.3
- Provenance as specified in invariant I4 — it is a first-class type, not a comment
- Commit, Op, Author, validate(), apply()

Invariant I1 is structural, not aspirational: make it a compile error to mutate a
Document from outside the commit crate. Use module privacy and a sealed trait or
similar. If you can't make it a compile error, tell me rather than settling for a
convention.

Required tests:
- Nested layer reparenting that would create a cycle is rejected by validate()
- A rejected commit leaves the document bit-identical to before
- Document hashing is deterministic across process runs and across targets
- A commit sequence replayed from empty produces the same hash as the original
- Provenance survives every op

Done when: all the above pass on native and wasm32.
```

### Prompt 3 — M2 DXF import

```
M2: DXF import per PRD §4.6 and the classify stage of §4.5.

Build the Importer trait, then the DXF implementation. Two phases:

Phase A — load raw DXF entities into SourceSchema with no interpretation at all.
Invariant I8: this is lossless and additive. Nothing derived, nothing dropped.

Phase B — classification into native objects. Priority order for signals:
1. Layer name patterns (configurable rule set, not hardcoded strings in the classifier)
2. Block reference names
3. Linetype and lineweight
4. Geometry heuristics — last resort only

Every native object emits SourceRef back to its phase-A entities and Provenance
recording which rule fired.

Units are the classic failure mode here: DXF files carry unit settings
inconsistently. Read $INSUNITS, and when it's absent or implausible, mark the scale
Provenance::Assumed and surface it rather than silently guessing.

Add 3 fixture DXFs to fixtures/dxf/: a clean simple plan, one with arcs and curved
walls, one deliberately messy (gaps, duplicate lines, wrong layers). Keep each under
200KB.

Done when: all three import, classification results are snapshot-tested, and the
messy fixture's failures are visible in provenance rather than silently wrong.
```

### Prompt 4 — M3 renderer

```
M3: the wgpu renderer per PRD §4.2 and invariant I6.

Build render:: with two surface backends behind one API:
- Browser: canvas via WebGPU, WebGL2 fallback
- Headless: offscreen texture -> Rgba8Image, no window, no display server

render::view(&doc, camera, mode) is the single entry point and must be callable from
both. mode covers at least PlanView2d and Perspective3d.

Start with 2D plan view: polylines, layer colours, layer visibility. Instance block
references. Do not build a sophisticated vector renderer — see PRD §2, our entity
counts are an order of magnitude below Rayon's and this budget belongs in geometry.

Text: use whatever is simplest that renders correctly, and leave a note in the module
doc that MSDF's pre-rendered glyph atlas breaks for non-Latin scripts so we don't
walk into it later.

Then wire the headless path into a CI parity test: import a fixture, render both
paths, assert the images are within tolerance. This test guards I6 for the rest of
the project's life — make it hard to delete accidentally.

Done when: browser renders the clean fixture at 60 FPS with 5k entities, and the
parity test is green in CI.
```

### Prompt 5 — M4 2D to 3D

```
M4: the 2D->3D pipeline, stages 1 and 3-7 of PRD §4.5. (Stage 2 was M2.)

Implement in geom2d and solid:
- heal: endpoint snapping, near-loop closing, duplicate segment removal, with the
  tolerance as an explicit parameter, not a magic constant
- pair_walls: parallel polyline pairing into centreline + thickness
- profile: closed 2D profiles per wall run
- extrude: profile -> prism
- subtract_openings: boolean per door/window block reference, using Manifold
- tessellate: -> render buffers

Do NOT add OCCT. PRD §4.5 explains why. If you hit a case that genuinely needs
NURBS or real fillets, stop and tell me.

Every height, thickness and elevation gets Provenance. Default wall height is
Assumed with the reason string recording the default used. A height read from a
DIMENSION or text annotation is Measured. A thickness derived from paired polylines
is Inferred.

The whole pipeline runs as commits, not as a side-channel mutation — I1 applies here
too, and this is the place it's most tempting to break.

Required test: the messy fixture from M2 produces a 3D result where every
questionable value is traceable to a provenance record. Assert the count of Assumed
values is non-zero and that none are silently Measured.

Done when: clean fixture extrudes correctly with openings; messy fixture extrudes
with honest provenance; both render in Perspective3d mode.
```

### Prompt 6 — Foundation review

```
Foundation review before M5. Do not write features.

1. Audit the codebase against every invariant I1-I8 in CLAUDE.md. For each, state
   whether it is enforced structurally, enforced by test, or merely conventional.
   Anything merely conventional is a finding.
2. List every place where the 2D->3D pipeline makes a decision that a professional
   drafter would dispute, and whether that decision is visible in provenance.
3. Tell me what you would do differently if starting M0 again.
4. Write ARCHITECTURE.md describing what actually exists, not what the PRD planned.

Then stop.
```

### Prompt 7 — M6 tool surface (after M5)

```
M6: the agent tool surface per PRD §4.7, honouring I3 and I5.

The command registry in api/ is the single source of truth. Generate tool JSON Schema
from the command types with schemars via `cargo xtask gen-schemas`. Hand-written tool
schemas are an I3 violation — if generation can't express something, change the Rust
type, don't hand-write the schema.

Implement the five tools in the §4.7 table. Constraints:
- query_entities has a hard result cap and returns a truncation flag. It never
  returns the whole document (I5).
- describe_region returns aggregates and layer breakdowns, not entity lists.
- apply_commit refuses to execute without an approved PlanId (I7).
- render_view calls the headless path from M3.

Add a CI test that fails if a command exists in the registry without a generated
schema, or vice versa.

Done when: schemas generate from `cargo xtask gen-schemas`, all five tools work
against a live session, and the drift test is green.
```

---

## 7. ANTI-PATTERNS

Copy into `CLAUDE.md`. These are the specific wrong turns this project is prone to.

**Do not mirror document state into TypeScript.** Not "just the ids for now", not a cache, not for
convenience in a React component. Query Wasm. (I2)

**Do not add three.js, Babylon, or any JS 3D library.** The renderer is wgpu for the reason in §4.2.
A JS renderer silently kills headless parity.

**Do not reach for a CRDT.** Yjs, Automerge, Loro — all wrong here. We need a central authority
because our invariants (layer cycles, opening containment, profile closure) are global properties a
CRDT cannot express. Rayon's commit model is the reference.

**Do not put entities in Postgres.** Postgres holds users, orgs, projects, comments, threads.
Documents are files in blob storage, one per model.

**Do not add OCCT before M4 is complete and its limits are actually hit.**

**Do not hand-write agent tool schemas.** Generate from Rust. (I3)

**Do not serialize the document for the LLM.** Ever. Not "just a summary of all entities". (I5)

**Do not let a default become a fact.** A wall height of 2700mm with no provenance record is the
single most dangerous line of code in this project. Everything inferred is labelled. (I4)

**Do not bypass `commit::validate` for imports, migrations, or agent writes.** The import path is
where this temptation is strongest and where breaking it is most expensive. (I1)

**Do not accept a hardcoded layer-name string in the classifier.** Every office names layers
differently. Rules are data. (§4.6)

**Do not pin versions from memory.** Check crates.io and npm. (§4.2)

---

## 8. Open questions for the human

1. **DWG timing.** DXF-only ships faster but most real drawings arrive as DWG. Is a "save as DXF"
   step acceptable for design partners, or is DWG needed in the foundation?
2. **Wall height source.** Is there a reliable convention in your target drawings (a text note, a
   section reference, a title-block field), or is `Assumed` the honest answer indefinitely?
3. **Who signs off.** The provenance system is only worth building if a real reviewer will use it.
   Who is that person, and what would they need to see to approve a generated model?
4. **Agent write scope.** Should the agent be allowed to modify source-schema data, or only derived
   native objects? Recommendation: derived only, source is read-only forever.
5. **Token budget.** At what per-drawing cost does this stop being viable? That number determines
   how aggressively we need to freeze agent reasoning into deterministic rules.

---

## 9. Staffing note

The scarce hire is a geometry engineer who has shipped B-rep or mesh work — everything else is
downstream of them. The second scarce hire is someone who has professionally drafted in AutoCAD.
Rust seniority is purchasable; neither of those is. For reference, Rayon built a comparable 2D
product with a small team on roughly €6m over four years.
