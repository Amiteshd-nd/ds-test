//! `tri-intake` — a sentence in, a [`Brief`](tri_params::Brief) out.
//!
//! # The load-bearing rule
//! **The model never emits geometry.** It reads intent and fills a parameter set; a
//! deterministic solver turns that into walls. The PRD calls this "the load-bearing
//! decision of the whole product", and it is what makes bring-your-own-key viable: a
//! mid-tier model fills a typed form about as well as a frontier one, because the form is
//! small and the schema is exact.
//!
//! # What this crate does and does not do
//! It builds the request, validates the response, and repairs the handful of mistakes
//! every model makes. It does **not** make HTTP calls — see the note in `Cargo.toml`. The
//! proxy in `tri-server` does that, so the key crosses one process and is never stored.
//!
//! # Stated, not guessed
//! [`Intake::stated`] records which fields the brief actually contained. This is not a
//! nicety. `ParameterSet::from_brief` marks every tier-1 value `Measured` — "the architect
//! typed this" — and a model that guessed `floors: 2` from a sentence that never mentioned
//! floors would turn a guess into a measurement at the very first step, which is invariant
//! I4 broken before any geometry exists.
//!
//! The resolution is the PRD's own flow: the filled form is shown for confirmation before
//! anything is generated, with the guessed fields marked. **Confirmation is the provenance
//! event**, not parsing. Until an architect has looked at it, an intake is a proposal.

pub mod allowlist;
pub mod local;
pub mod parse;
pub mod prompt;

pub use allowlist::{Model, Provider, ALLOWED};
pub use parse::{Field, Intake, IntakeError, Stated};
