//! `tri-solid` — profile extraction, extrusion, booleans, tessellation.
//!
//! # Responsibility
//! Stages 5–7 of PRD §4.5: profile → prism, opening subtraction, tessellation to
//! render buffers.
//!
//! # Must NOT depend on
//! `commit`, `render`, `api`, `wasm`, `server`. Only `tri-doc` and `tri-geom2d`.
//! No OCCT (PRD §4.5 / anti-patterns) — not before M4's limits are actually hit.

pub mod extrude;
pub mod mesh;
pub mod pipeline;
pub mod tessellate;

pub use extrude::{extrude, wall_with_openings, CutReport, OpeningCut};
pub use mesh::Mesh;
