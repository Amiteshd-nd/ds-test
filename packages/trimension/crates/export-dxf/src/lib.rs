//! `tri-export-dxf` — the file an architect judges us on.
//!
//! # Responsibility
//! Turn a document into a layered DXF that opens cleanly in AutoCAD. The PRD is blunt
//! about the stakes: an architect opens the file and decides in five seconds whether we
//! are serious.
//!
//! Same crate as the importer — `dxf` (ixmilia/dxf-rs) reads and writes — so the two
//! directions cannot disagree about the format.
//!
//! # What "cleanly" means here
//! - Walls are **closed polylines**, so they hatch and offset like walls rather than like
//!   a bundle of loose lines.
//! - Every class of geometry is on its own layer, named from the parameter set's tier 3
//!   scheme rather than from constants in this file.
//! - `$INSUNITS` is written explicitly. A DXF that does not state its units is the
//!   single most common way a drawing arrives at the wrong scale, and the importer's own
//!   unit heuristic exists because so many files get this wrong.
//! - Text is sized in drawing units, so a label is legible at the scale the plan prints
//!   at rather than at whatever the viewer defaults to.
//!
//! # Must NOT depend on
//! `commit`, `solid`, `render`, `api`. Export reads a document and writes bytes.

pub mod scheme;

mod write;

pub use write::{export, ExportError, ExportStats};
