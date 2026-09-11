//! `tri-geom2d` — 2D curves, polyline healing, spatial indexing.
//!
//! # Responsibility
//! Stage 1 ("heal") and stage 3 ("centreline + thickness") of the PRD §4.5 pipeline,
//! plus the R-tree index. Pure geometry over fixed-point coordinates.
//!
//! # Must NOT depend on
//! `commit`, `solid`, `render`, `api`, `wasm`, `server`. Only `tri-doc`.
//! It must never mutate a `Document` — it computes values that a commit then writes.

pub mod heal;
pub mod index;
pub mod pair;
pub mod profile;

/// Exact integer square root, floor. Shared by every module here so that no two of them
/// can disagree about a length. Re-exported from `tri_doc` rather than reimplemented.
pub fn isqrt(n: i128) -> i128 {
    tri_doc::validate::isqrt_i128(n)
}
