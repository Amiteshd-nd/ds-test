//! `tri-server` — axum session server: sequencing, websockets, blob persistence.
//!
//! # Responsibility
//! Per-document process holds the doc in memory, validates, applies, assigns sequence,
//! broadcasts (PRD §4.4). Documents are files in blob storage — never rows in Postgres.
//!
//! # Must NOT depend on
//! Anything but `tri-api`. Nothing in the workspace may depend on this crate.

pub mod app;
pub mod protocol;
pub mod session;
pub mod store;

pub use protocol::{ClientMsg, ServerMsg};
pub use session::{Registry, Session};

pub fn probe() -> String {
    tri_api::probe()
}
