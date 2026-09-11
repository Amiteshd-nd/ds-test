//! `tri-import-dxf` — DXF → source schema → classified native objects.
//!
//! # Responsibility
//! Invariant **I8**: phase A loads raw DXF losslessly into the source schema; phase B
//! classifies into native objects carrying `SourceRef` + `Provenance`. Both phases run
//! as commits — invariant **I1** has no import exemption.
//!
//! # Must NOT depend on
//! `solid`, `render`, `api`, `wasm`, `server`.
//! DWG is deliberately absent (PRD §4.6); it slots in behind [`Importer`] later,
//! server-side only.

pub mod classify;
pub mod dxf_importer;
pub mod importer;
mod pipeline;
pub mod rules;
pub mod units;

pub use dxf_importer::{DxfError, DxfImporter};
pub use importer::Importer;
pub use pipeline::{import, ImportError, ImportOutcome};
pub use rules::RuleSet;
