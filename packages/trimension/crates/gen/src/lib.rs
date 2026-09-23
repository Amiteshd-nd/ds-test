//! `tri-gen` — floor plans from parameters.
//!
//! # What this crate is
//! The other half of the same pipeline the importer runs. Import is
//! `DXF → heal → classify → pair → profile → extrude → subtract → tessellate`.
//! Generation is `parameters → template → profile → extrude → subtract → tessellate`.
//! Stages 1–3 exist only to clean up drawings made by hand; generated geometry is clean
//! by construction, so they are skipped via
//! [`Preparation::Clean`](tri_solid::pipeline::Preparation::Clean) rather than by forking
//! the pipeline. Stages 4–7 are used verbatim — this crate contains no extrusion code.
//!
//! # Invariants
//! - **I1.** Generation emits `Op`s and nothing else. There is no `&mut Document` in this
//!   crate. After import, this is the second place where bypassing the commit path would
//!   be easiest, so there is deliberately no way to do it.
//! - **I4.** Every dimension the template produces is `Tracked`. A value the architect
//!   gave is `Measured`; one a rule produced is `Inferred` and names the rule; one the
//!   template chose is `Assumed` and names the proportion it used.
//! - **I7.** [`plan`] is pure and returns what generation *would* do. Nothing reaches the
//!   document until [`apply`] is called with that plan.
//!
//! # Scope
//! Four templates, one per bedroom count the brief accepts, all laid out by the single
//! solver in [`template`]. A template is data — bands, cells, an optional corridor — so
//! adding one cannot introduce a layout bug, only a layout opinion. Nothing here selects
//! between two templates for the same brief yet; [`library::select`] returns every
//! candidate and F5 turns them into branches.

pub mod library;
pub mod options;
pub mod template;
pub mod variant;

mod plan;

pub use library::{library, select, solve, Rejection, SelectError};
pub use options::{candidates, Candidate, OPTIONS_PER_GENERATION};
pub use plan::{apply, plan, plan_for, GenError, GenerationPlan, RoomKind, ROOM_TYPE_NAME};
pub use template::{Layout, Template, TemplateError};
pub use variant::{Emphasis, Variant};
