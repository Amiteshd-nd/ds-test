# trimension — agent-native 3D drafting canvas

> Project rules. These override default behaviour and general instincts.
> Source of truth for intent, in two documents:
>
> - [`PRD.md`](./PRD.md) — the CAD platform (the PRD's working name was `axon`; the
>   project is named **trimension** here). Milestones M0–M7.
> - [`PRD-AI-FLOOR-PLAN-MVP.md`](./PRD-AI-FLOOR-PLAN-MVP.md) — the AI floor plan tool
>   built on top of it. Phases P0–P5 and F1–F8.
>
> Both are kept in the repo rather than linked from elsewhere: a spec that lives in
> somebody's Downloads folder is not a source of truth, it is a rumour.

## Project summary

trimension is a browser-native 3D drafting canvas that ingests AutoCAD drawings (DXF first, DWG
later) and is editable by a human and an AI agent as peers on the same document. The document lives
in Rust compiled to Wasm; TypeScript is a view and transport layer holding zero entity data. Every
mutation — human click, import, migration, agent write — goes through one validated `Commit` path
whose validation code compiles identically for the browser client and the session server, so the two
cannot diverge. Agent tools are generated from the same Rust command registry the UI dispatches
through, the renderer (`wgpu`) runs in the browser and headlessly on a server from one source so an
agent can see what it made, and every value not literally read from the source drawing carries a
provenance tag. The bet is that being a native client of the document — not a side panel that hands
artifacts back — is the part that cannot be retrofitted later.

## Monorepo context

This package lives inside `cloud-march/`. The repo-level guardrails in the root
[`CLAUDE.md`](../../CLAUDE.md) apply here too and are not negotiable:

- **Scope** — never create, edit or delete files outside `cloud-march/`.
- **Ports** — never use a port beginning with `4` or `5`. trimension's allocation:

  | Service                  | Port |
  | ------------------------ | ---- |
  | web shell (`apps/web`)   | 6178 |
  | session server (`crates/server`) | 8788 |

  Set the port explicitly so it holds when the package is run directly, not just via the hub.

"Repo root" in the PRD means **this package's root** (`packages/trimension/`), not the monorepo root.
The Cargo workspace, `CLAUDE.md`, `VERSIONS.md`, `crates/`, `apps/`, `fixtures/` and `xtask/` all
live under `packages/trimension/`.

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

## 7. ANTI-PATTERNS

These are the specific wrong turns this project is prone to.

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

## Milestone discipline

Foundation is **M0–M4** (PRD §5); M5–M7 follow. Current state: **M0–M7 implemented**.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for what actually exists, an invariant-by-invariant
audit, and the open findings.

## Deviations from the PRD, and where they are argued

These are deliberate and each is justified in the code. Do not "fix" one back toward the
PRD without reading the reasoning first.

| Deviation | Where the reasoning lives |
| --- | --- |
| `i64` micrometres, not floats | `crates/doc/src/units.rs` |
| `BTreeMap` + monotonic ids, not `SlotMap` | `crates/doc/src/id.rs` |
| `Tracked<T>` value wrapper, not only a provenance component | `crates/doc/src/provenance.rs` |
| `validate` proof lives in `doc`, bound to the op rather than the caller | `crates/doc/src/validate.rs` |
| Scene-buffer parity, not pixel parity | `crates/render/src/scene.rs` |
| No Manifold; exact integer opening subtraction | `crates/solid/src/extrude.rs` |
| `apply_commands`, not `apply_commit(ops)` | `crates/api/src/command.rs` |
| `PlanStep` carries commands, not ops | `crates/commit/src/plan.rs` |

## Working on this package

```bash
export RUSTUP_HOME="$PWD/.toolchain/rustup" CARGO_HOME="$PWD/.toolchain/cargo"
export PATH="$PWD/.toolchain/cargo/bin:$PATH"

cargo xtask test-all      # three targets, native + wasm32 tests
cargo xtask parity        # the I6 guard
cargo xtask gen-schemas   # regenerate tool schemas; CI fails if these are stale
```

The toolchain is installed inside this package rather than in `~/.cargo`, to satisfy the
repo scope guardrail above. It is gitignored and `rm -rf .toolchain` removes it.
