# trimension

Agent-native 3D drafting canvas. Browser-native, ingests AutoCAD drawings, editable by a human and
an AI agent as peers on the same document.

- **Intent & build plan:** [`PRD.md`](./PRD.md)
- **Rules (invariants + anti-patterns):** [`CLAUDE.md`](./CLAUDE.md)
- **Pinned dependency versions:** [`VERSIONS.md`](./VERSIONS.md)
- **What was built and what is still open:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## Status

**M0–M7 implemented.** 136 Rust tests, `clippy -D warnings` clean, all three compile
targets (browser wasm32, native server, native headless) building.

| Milestone | State |
| --- | --- |
| M0 scaffold | ✅ workspace, xtask, CI, three targets |
| M1 document + commit core | ✅ I1 is a compile error; hashing proven identical on wasm32 and native |
| M2 DXF import | ✅ four fixtures, data-driven rules, provenance on every classification |
| M3 renderer | ✅ 5k entities at 1920×1080 in 3.16 ms/frame including readback |
| M4 2D→3D | ✅ walls extrude with openings subtracted, exact volumes, closed meshes |
| M5 session server | ✅ two clients + a headless agent converge |
| M6 tool surface | ✅ five tools, schemas generated from Rust, drift guarded both ways |
| M7 chat-native canvas | ✅ four wgpu viewports in the browser, plan approval verified end to end |

## Views

Plan, left elevation, right elevation and a true two-point perspective, all rendered by
the same `wgpu` code that produces an agent's headless PNG. Click a wall in the plan to see
where each of its numbers came from; drag the perspective to orbit; use ⤢ to maximise a
viewport.

Known findings — including two decisions a drafter would dispute that are not yet fully
traceable — are listed in ARCHITECTURE.md §1 and §2.

## Quick start

```bash
export RUSTUP_HOME="$PWD/.toolchain/rustup" CARGO_HOME="$PWD/.toolchain/cargo"
export PATH="$PWD/.toolchain/cargo/bin:$PATH"
cargo xtask test-all
```

```bash
corepack pnpm --filter @trimension/web dev
```

## Ports

| Service | Port |
| ------- | ---- |
| web shell | 6178 |
| session server | 8788 |
