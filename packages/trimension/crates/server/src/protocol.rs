//! The wire protocol between clients and the session server.
//!
//! Only commits cross this wire — never a document. A late-joining client gets a
//! snapshot, and after that it receives the same validated commit stream every other
//! client sees. An agent connects on exactly this protocol, at exactly this privilege
//! level (PRD §2, Motif: "UI, API and agents are all clients of the same data model").

use serde::{Deserialize, Serialize};
use tri_api::tri_commit::{Commit, CommitId};
use tri_api::tri_doc::Document;

/// Adjacently tagged, not internally tagged. An internally tagged enum makes serde buffer
/// the payload into its intermediate `Content` type before dispatching, and that buffering
/// cannot faithfully round-trip a map whose keys are newtype-wrapped integers — which is
/// exactly what `Document` is (`BTreeMap<EntityId, _>`). The failure only appears once a
/// document is non-empty, so it is the kind of bug that passes every smoke test.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum ClientMsg {
    /// Propose a commit. The server validates, sequences and broadcasts, or rejects.
    Submit {
        commit: Box<Commit>,
    },
    /// Ask for the current state. Sent on connect; also used to resync after a gap.
    Resync,
    Ping,
}

/// Adjacently tagged, for the reason given on [`ClientMsg`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum ServerMsg {
    /// Full state. The only message that carries a document, and it goes to a *client*,
    /// never to an agent's context window — I5 governs the tool layer, not the wire.
    Snapshot {
        document: Box<Document>,
        head: CommitId,
        sequence: u64,
    },
    /// A commit was accepted. Broadcast to everyone, including the author, because the
    /// server may have rebased it onto a different parent and given it a new id.
    Accepted {
        commit: Box<Commit>,
        sequence: u64,
        /// The id the author submitted, so it can match this to its pending queue.
        submitted_as: CommitId,
    },
    /// The commit did not validate. Only the author is told; nobody else needs to know
    /// about an edit that never happened.
    Rejected {
        submitted_as: CommitId,
        violations: Vec<String>,
    },
    Pong,
    Error {
        message: String,
    },
}

impl ServerMsg {
    pub fn error(m: impl Into<String>) -> ServerMsg {
        ServerMsg::Error { message: m.into() }
    }
}
