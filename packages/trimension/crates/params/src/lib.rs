//! `tri-params` — the brief, as a document component.
//!
//! # Responsibility
//! Holds everything the architect told us and everything we worked out from it, on the
//! document, versioned by commits. This is the input to generation and the thing the
//! compliance panel reads.
//!
//! # Why this is a component and not React state
//! Invariant **I2**: TypeScript holds no document data. If the brief lived in the UI,
//! regenerating a plan would not be a commit, history would not replay, and two clients
//! could disagree about what was asked for. Changing a parameter is a commit like any
//! other edit.
//!
//! # Why every field is `Tracked`
//! Invariant **I4**, and the PRD's three intake tiers map onto it exactly:
//!
//! | Tier | Provenance | Example |
//! | --- | --- | --- |
//! | 1, the architect typed it | `Measured` | plot is 30 × 40 ft |
//! | 2, we derived it | `Inferred` | front setback 1500mm — BBMP table, 150–300 m² band |
//! | 3, we defaulted it | `Assumed` | external wall 230mm — default, not specified |
//!
//! A tier-3 default with no record of being a default is the failure the axon PRD calls
//! the single most dangerous line of code in the project. Here it is unrepresentable:
//! there is no way to store a value without a provenance and a reason.
//!
//! # Must NOT depend on
//! `commit`, `rules`, `gen`, or anything that generates geometry. This crate describes
//! the brief; it does not act on it.

pub mod brief;
pub mod component;
pub mod layers;
pub mod tiers;
pub mod units;

mod set;

pub use brief::{form_fields, form_schema, Brief, Chip};
pub use component::{from_component, to_component, type_definition, TYPE_NAME};
pub use layers::LayerScheme;
pub use set::{DoorSize, Orientation, ParameterSet, ParamsError};
pub use tiers::Tier;
pub use units::Units;
