//! Sibling futures of one document.
//!
//! # Why this is not a DAG in `History`
//! The PRD says options are "branches from a shared parent — already structurally
//! supported", and half of that is true: every `Commit` carries a `parent`, so two
//! commits can name the same one. The other half is not. [`History`](crate::History) is a
//! `Vec`, and [`Sequencer::submit`](crate::Sequencer::submit) *rebases* any commit whose
//! parent is stale onto the current head rather than forking — deliberately, because
//! concurrent edits from two people must converge, and refusing them would make every
//! collision a user-visible error.
//!
//! Those two behaviours are both right and they are in tension. Turning `History` into a
//! general DAG with merge resolution would change what a commit means for every caller,
//! including the session server and the rebase-and-replay machinery in `LocalSession`,
//! to serve a feature where the branches are never merged.
//!
//! So a branch here is a **forked `Sequencer`**: its own document, its own linear
//! history, growing from a commit id the others share. `Sequencer` is already `Clone` and
//! validation is pure, so the fork is exact rather than approximate. Options are
//! genuinely siblings in the DAG — they simply live in separate logs, the way a worktree
//! does, instead of being interleaved in one.
//!
//! The cost is memory: N documents rather than one. A generated plan is around twenty
//! entities, and the alternative is a merge algorithm nobody will ever run.

use crate::commit::CommitId;
use crate::history::Sequencer;

/// One candidate future.
#[derive(Clone, Debug)]
pub struct Branch {
    /// Stable identifier, from the option that produced it.
    pub key: String,
    pub label: String,
    /// A sentence saying why this option ranked where it did.
    pub note: String,
    /// The commit this branch and all its siblings grow from.
    pub base: CommitId,
    seq: Sequencer,
}

impl Branch {
    pub fn new(key: String, label: String, note: String, seq: Sequencer, base: CommitId) -> Branch {
        Branch {
            key,
            label,
            note,
            base,
            seq,
        }
    }

    pub fn document(&self) -> &tri_doc::Document {
        self.seq.document()
    }

    pub fn sequencer(&self) -> &Sequencer {
        &self.seq
    }

    /// Commits made on this branch since the shared base.
    pub fn depth(&self) -> usize {
        self.seq.history().len()
    }
}

/// A set of sibling branches and which one is in front.
#[derive(Clone, Debug, Default)]
pub struct Branches {
    entries: Vec<Branch>,
    current: Option<usize>,
    root: Option<Sequencer>,
}

impl Branches {
    pub fn new() -> Branches {
        Branches::default()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &Branch> {
        self.entries.iter()
    }

    pub fn get(&self, key: &str) -> Option<&Branch> {
        self.entries.iter().find(|b| b.key == key)
    }

    /// The branch currently in front, if one has been chosen.
    pub fn current(&self) -> Option<&Branch> {
        self.current.and_then(|i| self.entries.get(i))
    }

    pub fn current_key(&self) -> Option<&str> {
        self.current().map(|b| b.key.as_str())
    }

    /// Replace the whole set. Generating again discards the previous options rather than
    /// accumulating them — four thumbnails is a choice, twelve is a filing problem.
    pub fn replace(&mut self, entries: Vec<Branch>) {
        self.entries = entries;
        self.current = None;
    }

    /// The document every branch here grows from, remembered from the first call.
    ///
    /// **A second generation must fork from the same place the first one did**, not from
    /// whichever option is currently in front. A new brief replaces the plan; it does not
    /// add a second house to the plot. Forking from the working branch left both
    /// buildings in the document — 40 entities, duplicated layers, and a compliance panel
    /// reporting FAR 5.17 against a permitted 1.75.
    ///
    /// Anything that was in the document before the first generation — an imported
    /// drawing, say — survives every regeneration, because it is part of this root.
    pub fn root(&mut self, current: &Sequencer) -> Sequencer {
        self.root.get_or_insert_with(|| current.clone()).clone()
    }

    /// Forget the root, so the next generation re-reads the document.
    ///
    /// For a caller that has replaced the document wholesale — loading a snapshot, or
    /// importing over the top — where the remembered root is no longer part of its
    /// history.
    pub fn forget_root(&mut self) {
        self.root = None;
    }

    pub fn push(&mut self, branch: Branch) {
        self.entries.push(branch);
    }

    /// Bring a branch to the front, writing `working` back to the one it replaces.
    ///
    /// **The write-back is what makes switching lossless.** Without it, editing option A,
    /// looking at option B and coming back would silently discard the edit — and quietly
    /// losing work an architect did is worse than not offering options at all. The PRD
    /// puts it plainly: "losing a version they liked is the fastest way to lose the user."
    ///
    /// Returns the sequencer to work in, or `None` if no branch has that key.
    pub fn switch(&mut self, key: &str, working: Sequencer) -> Option<Sequencer> {
        let next = self.entries.iter().position(|b| b.key == key)?;
        if let Some(i) = self.current {
            self.entries[i].seq = working;
        }
        self.current = Some(next);
        Some(self.entries[next].seq.clone())
    }

    /// Write `working` back into the current slot without switching, so a caller can
    /// checkpoint before reading a branch it is not on.
    pub fn save(&mut self, working: Sequencer) {
        if let Some(i) = self.current {
            self.entries[i].seq = working;
        }
    }
}
