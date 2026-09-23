//! `tri-rules` — bylaw compliance as diagnostics, not as validation.
//!
//! # The distinction this crate exists to hold
//!
//! `commit::validate` rejects documents that are *structurally* invalid: a layer cycle,
//! an unclosed profile, an opening that runs off the end of its wall. Those are states
//! the document cannot meaningfully hold.
//!
//! A plan that exceeds FAR is structurally perfect. It is also something an architect
//! will draw **on purpose**, to show a client what the bylaw costs them. If exceeding FAR
//! were a commit violation, the document could not hold that drawing at exactly the
//! moment it is most useful, and the tool would be fighting its user.
//!
//! So bylaw failures are [`Diagnostic`] records, never `Violation` records. Hard rules
//! constrain the *generator* — it retries until it finds a compliant layout. They never
//! constrain the *document*.
//!
//! This is enforced structurally: `tri-commit` is not a dependency of this crate, so
//! nothing here can reach `commit::validate` even by accident.
//!
//! # Rules are data
//!
//! No bylaw number appears in Rust. A [`RuleSet`] is loaded from a versioned file
//! carrying its authority and effective date, exactly as the layer classifier in
//! PRD §4.6 loads its patterns. Adding Chennai means adding a file.
//!
//! # Diagnostics are computed, not stored
//!
//! [`check`] is a pure function of `(document, ruleset)`. Diagnostics are derived state;
//! writing them into the document would mean they can go stale, and would fill history
//! with a commit every time a wall moved. [`attach`] exists for the cases that genuinely
//! want a frozen record — a report, a snapshot sent for review — and is opt-in.

pub mod diagnostic;
pub mod report;
pub mod room;
pub mod ruleset;

mod checks;

pub use checks::{check, derive_parameters, derive_program, is_awkward, RoomTarget, AWKWARD_RATIO};
pub use diagnostic::{attach, Diagnostic, DiagnosticSet, Severity, TYPE_NAME};
pub use report::{report, ComplianceReport, Metric, Standing};
pub use room::{Room, ROOM_TYPE_NAME};
pub use ruleset::{Authority, RuleSet, RuleSetError, SetbackBand};
