//! The commit itself.

use crate::author::Author;
use serde::{Deserialize, Serialize};
use std::fmt;
use tri_doc::hash::{Canonical, CanonicalHash};
use tri_doc::{Op, Violation};

/// Content-addressed: a function of parent, author, ops and message. Two clients that
/// independently construct the same commit on the same parent produce the same id, which
/// is what lets the server deduplicate a retry instead of applying it twice.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CommitId([u8; 32]);

impl CommitId {
    /// The parent of the first commit in a document.
    pub const ROOT: CommitId = CommitId([0u8; 32]);

    pub fn to_hex(self) -> String {
        self.0.iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn short(self) -> String {
        self.to_hex()[..12].to_string()
    }
}

impl fmt::Debug for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "CommitId({})", self.short())
    }
}

impl fmt::Display for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.short())
    }
}

#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct Commit {
    id: CommitId,
    parent: CommitId,
    author: Author,
    ops: Vec<Op>,
    message: String,
}

impl Commit {
    pub fn new(parent: CommitId, author: Author, ops: Vec<Op>, message: impl Into<String>) -> Self {
        let message = message.into();
        let id = compute_id(&parent, &author, &ops, &message);
        Commit {
            id,
            parent,
            author,
            ops,
            message,
        }
    }

    pub fn id(&self) -> CommitId {
        self.id
    }

    pub fn parent(&self) -> CommitId {
        self.parent
    }

    pub fn author(&self) -> &Author {
        &self.author
    }

    pub fn ops(&self) -> &[Op] {
        &self.ops
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    /// Re-derive the id and compare. Guards against a tampered or corrupted commit
    /// arriving over the wire.
    pub fn verify_id(&self) -> bool {
        compute_id(&self.parent, &self.author, &self.ops, &self.message) == self.id
    }

    /// A commit rebased onto a new parent is a different commit, so it gets a new id.
    pub fn rebased_onto(&self, parent: CommitId) -> Commit {
        Commit::new(
            parent,
            self.author.clone(),
            self.ops.clone(),
            self.message.clone(),
        )
    }
}

fn compute_id(parent: &CommitId, author: &Author, ops: &[Op], message: &str) -> CommitId {
    let mut c = Canonical::new();
    c.tag(0xC0).bytes(&parent.0);
    match author {
        Author::Human(u) => {
            c.tag(0xC1).str(&u.0);
        }
        Author::Agent(a, p) => {
            c.tag(0xC2).str(&a.0).str(&p.0);
        }
        Author::System(s) => {
            c.tag(0xC3).str(s);
        }
    }
    c.str(message);
    ops.to_vec().hash_into(&mut c);
    let mut out = [0u8; 32];
    out.copy_from_slice(c.finish().as_bytes());
    CommitId(out)
}

#[derive(Debug)]
pub enum CommitError {
    /// Validation said no. The emitting client must reverse (see `history`).
    Rejected {
        commit: CommitId,
        violations: Vec<Violation>,
    },
    /// The commit's parent is not the current head.
    WrongParent {
        expected: tri_doc::DocHash,
        commit: CommitId,
    },
    /// The id does not match the content.
    Tampered(CommitId),
}

impl fmt::Display for CommitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CommitError::Rejected { commit, violations } => {
                write!(f, "commit {commit} rejected:")?;
                for v in violations {
                    write!(f, "\n  - {v}")?;
                }
                Ok(())
            }
            CommitError::WrongParent { commit, .. } => {
                write!(f, "commit {commit} does not build on the current head")
            }
            CommitError::Tampered(id) => write!(f, "commit {id} failed its integrity check"),
        }
    }
}

impl std::error::Error for CommitError {}
