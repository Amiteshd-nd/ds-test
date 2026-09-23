//! `tri-vaastu` — an optional directional preference layer.
//!
//! # What this is, and what it is not
//! Vaastu shastra is a traditional Indian system of directional preferences for building
//! layout. A large number of clients in Bengaluru ask for it, and a tool that cannot say
//! anything about it is a tool they will not use. That is the entire reason it is here.
//!
//! It is **not** a code, it is not enforced by anybody, and its schools disagree with each
//! other. So it is treated exactly the way the bylaws are treated: as versioned data with
//! an authority and a disclaimer, never as logic in Rust. Swapping in a consultant's own
//! preferences means editing a JSON file.
//!
//! # It cannot block anything
//! The PRD: "It ranks and biases options; it never blocks generation, and its influence is
//! shown so the architect can see what it cost in efficiency." This crate has no way to
//! express a refusal — it does not depend on `tri-gen` and cannot name a single one of its
//! error types. The strongest thing [`assess`] can return is a low score and a sentence
//! saying why.
//!
//! # Why it takes rectangles rather than a `Layout`
//! Depending on `tri-gen` would create a cycle, and it would also let a future change
//! reach into template internals. A room here is a kind and a centre offset; everything
//! else is somebody else's business.

pub mod compass;
pub mod ruleset;
mod score;

pub use compass::{Compass, Sector};
pub use ruleset::{RuleSet, RuleSetError};
pub use score::{assess, Assessment, Placement, Room, Verdict};
