//! `tri-api` — command registry, generated tool schemas, query layer.
//!
//! # Responsibility
//! Invariant **I3**: exactly one command registry. The UI and the agent dispatch through
//! the same enum. Tool JSON Schema is *generated* from these types with `schemars`
//! (`cargo xtask gen-schemas`), never hand-written.
//! Invariant **I5**: the query layer returns spatial/filtered subsets with hard caps.
//! It has no "serialize the document" entry point and must never grow one.
//!
//! # Must NOT depend on
//! `wasm`, `server`. Those depend on this.

pub mod command;
pub mod query;
pub mod registry;
pub mod schema;

pub use command::{Command, CommandError};
pub use registry::{ToolError, ToolKind, TOOLS};

/// M0 target-proof: exercises the whole dependency graph from one call.
pub fn probe() -> String {
    format!("tri-api on {}", tri_doc::target_probe())
}

// The workspace dependency rule (PRD Prompt 1) is that `wasm` and `server` depend on
// `api` only. They still need the document and commit types, so `api` re-exports them
// rather than those crates being added as direct dependencies — the rule stays
// mechanically true in every Cargo.toml, and `api` remains the single seam.
pub use tri_commit;
pub use tri_corrections;
pub use tri_doc;
pub use tri_export_dxf;
pub use tri_export_obj;
pub use tri_export_pdf;
pub use tri_geom2d;
pub use tri_import_dxf;
pub use tri_intake;
pub use tri_params;
pub use tri_render;
pub use tri_rules;
pub use tri_solid;
