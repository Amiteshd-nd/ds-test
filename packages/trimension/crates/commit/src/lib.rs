//! `tri-commit` — `Commit`, `Op` batching, `Author`, validation orchestration, history.
//!
//! # Responsibility
//! The single write path (invariant **I1**). Wraps a batch of [`tri_doc::op::Op`] with
//! authorship, parentage and a message, runs validation, and applies. Also owns the
//! optimistic-apply / reject / replay machinery the session server needs.
//!
//! # Must NOT depend on
//! `geom2d`, `solid`, `render`, `api`, `wasm`, `server`. Only `tri-doc`.
//! A commit is a document-level concept; it must not know what a wall is.

pub mod author;
pub mod history;
pub mod plan;

mod commit;

pub use author::{AgentId, Author, UserId};
pub use commit::{Commit, CommitError, CommitId};
pub use history::{History, LocalSession, Repair, Sequencer};
pub use plan::{ApprovedPlan, Plan, PlanId, PlanStep};
