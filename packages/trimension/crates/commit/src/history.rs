//! Append-only history, and the optimistic-apply / reject / replay machinery.
//!
//! # Why this is here at M1 and not at M5
//! PRD §4.4 gives rejection one sentence: "rejected commits are reversed by the emitting
//! client." That is the hardest sentence in the document. Reversing is not undo — if a
//! client optimistically applied C1, C2 and C3 and the server rejects C1, then C2 and C3
//! must be re-validated against a state that never contained C1, and either or both may
//! now themselves be invalid. Discovering that at M5 would mean the M1 document model was
//! built on the assumption that apply is one-directional.
//!
//! The approach here is rebuild-and-replay rather than inverse ops: keep the last
//! server-acknowledged document, and on any divergence replay the pending queue onto it,
//! dropping whatever no longer validates. Inverse ops would be faster and would be a
//! second, subtly different implementation of every mutation — the exact kind of code
//! that drifts out of sync with `apply` and then corrupts a document six months later.

use crate::commit::{Commit, CommitError, CommitId};
use tri_doc::{check, Document};

/// Append-only log. Unbounded by design (PRD §4.4).
#[derive(Clone, Debug, Default)]
pub struct History {
    commits: Vec<Commit>,
}

impl History {
    pub fn new() -> Self {
        History::default()
    }

    pub fn head(&self) -> CommitId {
        self.commits
            .last()
            .map(|c| c.id())
            .unwrap_or(CommitId::ROOT)
    }

    pub fn len(&self) -> usize {
        self.commits.len()
    }

    pub fn is_empty(&self) -> bool {
        self.commits.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Commit> {
        self.commits.iter()
    }

    pub fn get(&self, id: CommitId) -> Option<&Commit> {
        self.commits.iter().find(|c| c.id() == id)
    }

    /// Every commit an agent made under a given plan — the audit trail I7 exists for.
    pub fn by_plan(&self, plan: &crate::plan::PlanId) -> Vec<&Commit> {
        self.commits
            .iter()
            .filter(|c| c.author().plan() == Some(plan))
            .collect()
    }

    fn push(&mut self, commit: Commit) {
        self.commits.push(commit);
    }

    /// Abandon everything after `n`.
    ///
    /// The one place the log is not append-only, and it exists for a single reason:
    /// committing after an undo. The abandoned commits are unreachable from the new head
    /// exactly as they are in git after a reset, and keeping them would mean `history()`
    /// listing commits that are not in the document.
    fn truncate_to(&mut self, n: usize) {
        self.commits.truncate(n);
    }
}

/// The authoritative side: validates, applies, sequences. One per document.
///
/// This is the same code the browser runs — that is the point of compiling the workspace
/// for both targets (PRD §4.2). Validation cannot diverge between client and server
/// because there is only one implementation of it.
#[derive(Clone, Debug)]
pub struct Sequencer {
    doc: Document,
    history: History,
    /// The document this sequencer was opened on, before any commit in `history`.
    ///
    /// Undo is rebuild-and-replay, and replaying from an empty document would be wrong
    /// for a sequencer opened on a server snapshot. This is the replay base.
    base: Document,
    /// How many of `history`'s commits are applied to `doc`. Equal to `history.len()`
    /// unless something has been undone.
    applied: usize,
}

impl Default for Sequencer {
    fn default() -> Self {
        Self::new(Document::new())
    }
}

impl Sequencer {
    pub fn new(doc: Document) -> Self {
        Sequencer {
            base: doc.clone(),
            doc,
            history: History::new(),
            applied: 0,
        }
    }

    pub fn document(&self) -> &Document {
        &self.doc
    }

    pub fn history(&self) -> &History {
        &self.history
    }

    /// The commit the document currently reflects.
    ///
    /// Not `history.head()`: after an undo the tip of the log is not what is applied, and
    /// a commit parented to it would claim to follow a state the document is not in.
    pub fn head(&self) -> CommitId {
        match self.applied.checked_sub(1) {
            Some(i) => self.history.commits[i].id(),
            None => CommitId::ROOT,
        }
    }

    /// How many commits are applied. Differs from `history().len()` after an undo.
    pub fn applied(&self) -> usize {
        self.applied
    }

    pub fn can_undo(&self) -> bool {
        self.applied > 0
    }

    pub fn can_redo(&self) -> bool {
        self.applied < self.history.len()
    }

    /// Step back one commit.
    ///
    /// **Rebuild-and-replay, not inverse ops.** This crate's module docs already argue the
    /// point for rejection: inverse ops "would be a second, subtly different
    /// implementation of every mutation — the exact kind of code that drifts out of sync
    /// with `apply` and then corrupts a document six months later". Undo has the same
    /// shape and the same answer, and the cost is replaying a few dozen commits against
    /// pure validation.
    ///
    /// The consequence worth knowing: this is O(n) in history length. For a drafting
    /// session that is nothing. If it ever matters, the fix is a periodic snapshot to
    /// replay from, not an inverse of every op.
    pub fn undo(&mut self) -> bool {
        if !self.can_undo() {
            return false;
        }
        self.applied -= 1;
        self.rebuild();
        true
    }

    /// Step forward one commit, if a later one is still reachable.
    pub fn redo(&mut self) -> bool {
        if !self.can_redo() {
            return false;
        }
        self.applied += 1;
        self.rebuild();
        true
    }

    /// Replay the applied prefix onto the base document.
    ///
    /// Every commit goes back through `check`, so a replay cannot produce a document that
    /// validation would have refused. A commit that no longer validates is dropped rather
    /// than panicking: that is the same rule `LocalSession` follows when the server
    /// rejects something underneath a queue of pending work.
    fn rebuild(&mut self) {
        let mut doc = self.base.clone();
        for commit in self.history.commits.iter().take(self.applied) {
            if let Ok(proof) = check(&doc, commit.ops()) {
                let _ = doc.apply(proof);
            }
        }
        self.doc = doc;
    }

    /// Validate and apply. Conflicting commits apply in arrival order (PRD §4.4), so a
    /// commit whose parent is stale is *rebased* onto the current head and re-validated
    /// rather than refused outright — refusing would make every concurrent edit a
    /// user-visible error.
    pub fn submit(&mut self, commit: Commit) -> Result<Commit, CommitError> {
        if !commit.verify_id() {
            return Err(CommitError::Tampered(commit.id()));
        }

        // Committing after an undo abandons whatever was undone, which is what every
        // editor does and what git does on a reset. Keeping those commits in the log
        // would mean `history()` listing work that is not in the document.
        if self.applied < self.history.len() {
            self.history.truncate_to(self.applied);
        }

        let sequenced = if commit.parent() == self.head() {
            commit
        } else {
            commit.rebased_onto(self.head())
        };

        let proof =
            check(&self.doc, sequenced.ops()).map_err(|violations| CommitError::Rejected {
                commit: sequenced.id(),
                violations,
            })?;

        // Cannot fail: the proof was just taken against this exact revision.
        self.doc
            .apply(proof)
            .expect("proof is fresh; a failure here is a bug in Sequencer");

        self.history.push(sequenced.clone());
        self.applied = self.history.len();
        Ok(sequenced)
    }
}

/// The client side: applies locally before the server has spoken, and repairs itself
/// when the server disagrees.
#[derive(Clone, Debug)]
pub struct LocalSession {
    /// Last state the server confirmed. The replay base.
    acknowledged: Document,
    /// Working state, including unconfirmed commits.
    working: Document,
    /// Commits applied locally but not yet acknowledged, in order.
    pending: Vec<Commit>,
    ack_head: CommitId,
}

/// What a repair did, so the UI can tell the user their edit was dropped rather than
/// silently losing it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Repair {
    pub replayed: Vec<CommitId>,
    /// Commits that no longer validate against the corrected state.
    pub dropped: Vec<(CommitId, String)>,
}

impl Repair {
    pub fn is_clean(&self) -> bool {
        self.dropped.is_empty()
    }
}

impl Default for LocalSession {
    fn default() -> Self {
        Self::new(Document::new(), CommitId::ROOT)
    }
}

impl LocalSession {
    pub fn new(doc: Document, ack_head: CommitId) -> Self {
        LocalSession {
            acknowledged: doc.clone(),
            working: doc,
            pending: Vec::new(),
            ack_head,
        }
    }

    /// What the UI renders: acknowledged state plus optimistic local edits.
    pub fn document(&self) -> &Document {
        &self.working
    }

    pub fn pending(&self) -> &[Commit] {
        &self.pending
    }

    pub fn head(&self) -> CommitId {
        self.pending.last().map(|c| c.id()).unwrap_or(self.ack_head)
    }

    /// Apply locally and queue for the server. Rejected here means the client caught it
    /// without a round trip — same validation code, so the answer is the same.
    pub fn propose(
        &mut self,
        author: crate::author::Author,
        ops: Vec<tri_doc::Op>,
        message: impl Into<String>,
    ) -> Result<Commit, CommitError> {
        let commit = Commit::new(self.head(), author, ops, message);
        let proof =
            check(&self.working, commit.ops()).map_err(|violations| CommitError::Rejected {
                commit: commit.id(),
                violations,
            })?;
        self.working
            .apply(proof)
            .expect("proof taken against working revision");
        self.pending.push(commit.clone());
        Ok(commit)
    }

    /// The server accepted our commit. Advance the acknowledged base.
    pub fn on_accepted(&mut self, id: CommitId) -> Repair {
        let Some(pos) = self.pending.iter().position(|c| c.id() == id) else {
            return Repair::default();
        };
        // Everything up to and including `pos` is now confirmed.
        let confirmed: Vec<_> = self.pending.drain(..=pos).collect();
        for c in &confirmed {
            let proof = check(&self.acknowledged, c.ops())
                .expect("server accepted it, so it validates against the acknowledged base");
            self.acknowledged
                .apply(proof)
                .expect("proof taken against acknowledged revision");
            self.ack_head = c.id();
        }
        self.rebuild_working()
    }

    /// The server rejected our commit. Drop it and replay whatever followed.
    pub fn on_rejected(&mut self, id: CommitId) -> Repair {
        self.pending.retain(|c| c.id() != id);
        self.rebuild_working()
    }

    /// Another client's commit arrived. Rebase our pending queue on top of it.
    pub fn on_remote(&mut self, commit: &Commit) -> Repair {
        let proof = check(&self.acknowledged, commit.ops())
            .expect("the server validated this before broadcasting it");
        self.acknowledged
            .apply(proof)
            .expect("proof taken against acknowledged revision");
        self.ack_head = commit.id();
        self.rebuild_working()
    }

    /// Rebuild working state from the acknowledged base, replaying pending commits and
    /// dropping any that no longer validate.
    fn rebuild_working(&mut self) -> Repair {
        let mut working = self.acknowledged.clone();
        let mut repair = Repair::default();
        let mut kept: Vec<Commit> = Vec::new();
        let mut parent = self.ack_head;

        for commit in std::mem::take(&mut self.pending) {
            match check(&working, commit.ops()) {
                Ok(proof) => {
                    working
                        .apply(proof)
                        .expect("proof taken against working revision");
                    let rebased = commit.rebased_onto(parent);
                    parent = rebased.id();
                    repair.replayed.push(rebased.id());
                    kept.push(rebased);
                }
                Err(violations) => {
                    let why = violations
                        .iter()
                        .map(|v| v.to_string())
                        .collect::<Vec<_>>()
                        .join("; ");
                    repair.dropped.push((commit.id(), why));
                }
            }
        }

        self.working = working;
        self.pending = kept;
        repair
    }
}
