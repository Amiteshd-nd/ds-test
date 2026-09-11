//! `tri-doc` — the document: entity store, ids, components, type registry, layers.
//!
//! # Responsibility
//! Owns every byte of document state (invariant **I2**) and is the *only* place a
//! [`Document`] can be mutated (invariant **I1**).
//!
//! # Must NOT depend on
//! Anything else in this workspace. `doc` is the root of the dependency graph.
//! It must also stay free of anything target-specific: no wgpu, no wasm-bindgen,
//! no tokio. It compiles identically for `wasm32-unknown-unknown` and host native.
//!
//! # I1 enforcement (deviation from PRD §4.1 — see module `validate`)
//! The PRD puts `validate` in the `commit` crate. Rust's `pub(crate)` does not cross a
//! crate boundary, so a separate `commit` crate would force `doc` to expose public
//! mutators — reducing I1 to a convention. Instead the *proof obligation* lives here:
//! [`Document::apply`] requires a [`validate::Validated`], whose only constructor is
//! [`validate::check`]. Nobody — including `commit` — can mutate without validating
//! first. `commit` still owns `Commit`, `Author`, history and orchestration.

pub mod component;
pub mod hash;
pub mod id;
pub mod layer;
pub mod op;
pub mod provenance;
pub mod source;
pub mod units;
pub mod validate;

mod document;

pub use component::{Component, ComponentKey, ComponentSet, TypeRegistry};
pub use document::{
    validate_and_apply, ApplyError, Document, StaleValidation, CURRENT_FORMAT_VERSION,
};
pub use hash::DocHash;
pub use id::{EntityId, LayerId, SourceId};
pub use layer::{Layer, LayerTree};
pub use op::{Minted, Op};
pub use provenance::{Provenance, Tracked};
pub use units::{Length, Point2};
pub use validate::{check, Validated, Violation};

/// M0 target-proof. Present so `xtask` can assert all three targets link.
pub fn target_probe() -> &'static str {
    if cfg!(target_arch = "wasm32") {
        "wasm32"
    } else {
        "native"
    }
}
