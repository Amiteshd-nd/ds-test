# VERSIONS

Resolved against the live registries — **not from memory** (PRD §4.2, anti-pattern "Do not pin
versions from memory").

- **Date checked:** 2026-09-11
- **Method:** `crates.io/api/v1/crates/<name>` (`max_stable_version` + the `rust_version` / `license`
  of that version) and `registry.npmjs.org/<name>` (`dist-tags.latest`).
- **Re-check trigger:** any milestone that adds a dependency, or 60 days, whichever comes first.

## Rust crates

| Crate | Version | MSRV | License | Notes |
|---|---|---|---|---|
| `wgpu` | `30.0.1` | 1.87.0 | MIT OR Apache-2.0 | Highest MSRV in the tree — it sets the workspace floor. Stable toolchain. |
| `wasm-bindgen` | `0.2.128` | 1.77 | MIT OR Apache-2.0 | Must match the `wasm-bindgen-cli` / `wasm-pack` version exactly or the build fails at link time. |
| `wasm-pack` | `0.15.0` | — | MIT OR Apache-2.0 | Binary tool, not a dependency. Pin in `xtask`, verify it ships `wasm-bindgen 0.2.128`. |
| `schemars` | `1.2.2` | 1.74 | MIT | 1.x — the derive API differs from the widely-remembered 0.8. Read the 1.0 migration notes before writing derives. |
| `serde` | `1.0.229` | — | MIT OR Apache-2.0 | With `derive` feature. |
| `axum` | `0.8.9` | 1.80 | MIT | Session server. 0.8 changed path-param syntax vs 0.7. |
| `rstar` | `0.13.0` | 1.85 | MIT OR Apache-2.0 | R*-tree spatial index for `geom2d`. |
| `slotmap` | `1.1.1` | 1.58.0 | Zlib | `EntityId` storage. Zlib licence — permissive, fine. |
| `dxf` | `0.6.1` | unset | MIT | ✅ Validated at M2 against all four fixtures. Note: it pulls `uuid`, which needs the `js` feature on wasm32 — enabled from `tri-import-dxf`. |
| `manifold-csg` | — | — | — | ❌ **Not used.** Spiked and rejected; see risk 2. |
| `blake3` | `1.8.7` | — | CC0/Apache-2.0 | Document hashing. |
| `png` | `0.18` | — | MIT OR Apache-2.0 | `render_view` output. |
| `pollster` | `0.4` | — | MIT OR Apache-2.0 | Blocking on wgpu's async init in the headless path. |
| `bytemuck` | `1` | — | MIT/Apache-2.0/Zlib | Vertex buffer casts. |
| `async-trait` | `0.1` | — | MIT OR Apache-2.0 | The `Store` trait. |
| `tokio` | `1` | — | MIT | Session server runtime. |
| `wasm-bindgen-test` | `0.3.78` | — | MIT OR Apache-2.0 | Cross-target determinism tests. Pairs with `wasm-bindgen 0.2.128`. |
| `serde-wasm-bindgen` | `0.6` | — | MIT | JS marshalling. Must be configured with `serialize_maps_as_objects(true)` — see ARCHITECTURE.md. |

**Toolchain: Rust 1.98.1 stable** (current stable as of 2026-09-01), pinned in
`rust-toolchain.toml` with the `wasm32-unknown-unknown` target.

> **Corrected during M0.** The first pass here recorded a 1.87.0 floor from `wgpu`'s
> declared MSRV. That is wrong in practice: the floor is set by the *resolved dependency
> graph*, not by direct dependencies. `encoding_rs 0.8.41` and `image 0.25.10` — both
> transitive — require ≥1.88, and the workspace would not build on 1.87 at all. Read a
> declared MSRV as a lower bound on one crate, never as the project's floor.

## npm packages

| Package | Version | Notes |
|---|---|---|
| `ai` | `7.0.97` | Vercel AI SDK 7 — stable on `latest`, matching PRD §4.7. |
| `@ai-sdk/anthropic` | `4.0.52` | Provider package versions are independent of `ai`'s. |
| `@ai-sdk/react` | `4.0.100` | Chat UI bindings. |
| `xstate` | `5.32.6` | Command FSMs (PRD §4.8). A 6.0 alpha exists — stay on 5. |
| `@xstate/react` | `6.1.0` | Note the intentional major-version skew against `xstate` 5. |
| `vite` | `8.3.0` | Matches the rest of this monorepo's tooling generation. |
| `@vitejs/plugin-react` | `6.1.1` | |
| `@types/react` / `@types/react-dom` | `19.3.0` | Note: these track ahead of `react` 19.2.x. |
| `ws` | `8.21.3` | The agent host's websocket client. |
| `zod` | `4.6.2` | |
| `@types/node` | `22.20.2` | |

## Nightly requirement

**None.** Every crate above builds on stable 1.87.0.

## Risks found while resolving

1. **No Rust toolchain on this machine.** ✅ **Resolved.** `rustc`, `cargo` and `rustup`
   were all absent. Installing to `~/.cargo` would have violated the monorepo's scope
   guardrail (no files outside the repo), so the toolchain lives *inside this package* at
   `.toolchain/` — gitignored, and removable with `rm -rf .toolchain`. To use it:

   ```bash
   export RUSTUP_HOME="$PWD/.toolchain/rustup" CARGO_HOME="$PWD/.toolchain/cargo"
   export PATH="$PWD/.toolchain/cargo/bin:$PATH"
   ```

2. **`manifold-csg` — spiked and rejected.** ⚠️ **Resolved: not used.**
   The spike (run at M4; it should have run at M0) found two blockers:
   - **Native:** `manifold-csg-sys` drives a CMake build of a C++ library. Fails outright
     with `failed to run cmake configure: NotFound` on any machine without CMake.
   - **wasm32-unknown-unknown:** refuses to build without the crate's own
     `unstable-wasm-uu` feature, which its own error message documents as requiring
     LLVM 20+, forbidding C++ exceptions, and dropping parts of the API.

   Putting the browser client's geometry on an explicitly unstable feature path is not a
   foundation. There is also a correctness reason that outlives the build problems: a
   general float mesh boolean in C++ is not bit-identical between wasm32 and x86_64, which
   would break the deterministic document hash M1 rests on.

   **What we do instead:** `crates/solid` solves the narrow problem exactly — axis-aligned
   rectangular openings subtracted from a prismatic wall, in integer arithmetic, with the
   wall built from the material that remains so it is closed by construction. See
   `crates/solid/src/extrude.rs` and ARCHITECTURE.md §4.

3. **`wasm-bindgen` / CLI lockstep.** ✅ **Resolved by sidestepping `wasm-pack`.** We install
   `wasm-bindgen-cli 0.2.128` directly, exactly matching the library version, and invoke it
   from the `wasm` script in `apps/web/package.json`. `wasm-pack` adds nothing we need and
   introduces a second version to keep in lockstep.

4. **`schemars` is 1.x.** Most training data and blog posts describe 0.8. Assume every remembered
   `schemars` snippet is wrong and read the 1.x docs. This matters because I3 depends on generated
   schemas.

5. **`dxf 0.6.1` publishes no MSRV** and is a single-maintainer crate. ✅ All four M2
   fixtures round-trip, including arcs, block references and text. Entity types outside
   LINE / LWPOLYLINE / ARC / CIRCLE / INSERT / TEXT / MTEXT are skipped rather than
   coerced, so an unread type shows as a count mismatch rather than a wrong model.

6. **`wgpu 30` is a fast-moving API.** Several descriptor shapes differ from any
   remembered 0.x form — `Instance::new` takes the descriptor by value,
   `PipelineLayoutDescriptor` has `immediate_size` rather than `push_constant_ranges`,
   `VertexState.buffers` is `&[Option<..>]`, `multiview` is `multiview_mask`, presentation
   moved to `Queue::present`, and `get_current_texture` returns an enum rather than a
   `Result`. Read the version's own source before writing against it; none of this is
   inferable from memory.
