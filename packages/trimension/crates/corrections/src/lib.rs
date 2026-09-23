//! `tri-corrections` — what the solver drew, and where the architect moved it.
//!
//! # Why this exists
//! The PRD is unusually direct about it: "Log the parameter set, the chosen option, every
//! manual edit, and whether the session ended in export. That correction data — where the
//! solver put a wall and where the architect moved it — is the compounding asset. It tells
//! you which templates to fix and, eventually, gives you the dataset for a fine-tuned
//! intent parser. Build this logging on day one, not later."
//!
//! # Derived, not recorded
//! The obvious implementation is an event stream the UI appends to. That would be a second
//! account of what happened, kept beside the first, and the two would disagree the moment
//! anybody forgot a call site — the log would say a wall moved 300mm while the document
//! said 400mm, and there would be no way to tell which was right.
//!
//! P4 already made every edit a commit, so the edits are already recorded, in the one place
//! that cannot be wrong about them. This crate **replays the history** and reads the
//! corrections out of it. What it cannot derive is small and explicit: which option is in
//! front, and whether anything was exported. Those are the only two things a caller has to
//! remember to say.
//!
//! It is the same argument as diagnostics being computed rather than stored, and undo being
//! replay rather than inverse ops. A second source of truth is a bug with a delay on it.
//!
//! # Where it goes
//! Nowhere, on its own. [`SessionLog::to_json`] hands the caller bytes; nothing here writes
//! a file, opens a socket or phones home. The log is the architect's project data — what
//! they are designing and where they disagreed with the solver — and shipping that
//! somewhere by default would be a decision for them to make, not for this crate.

use serde::{Deserialize, Serialize};
use tri_commit::{Commit, Sequencer};
use tri_doc::component::{Component, ComponentKey};
use tri_doc::{Document, EntityId, Op};

/// One thing that happened to the plan after it was generated.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Correction {
    /// Position in the history, so two corrections can be ordered without a clock.
    pub step: usize,
    pub commit: String,
    /// `human`, `agent` or `system` — who moved it matters as much as what moved.
    pub author: String,
    pub message: String,
    #[serde(flatten)]
    pub kind: Kind,
}

/// What changed. The wall move is the one the PRD actually asks for; the rest are recorded
/// so the log does not quietly omit an edit it has no case for.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Kind {
    /// A wall the solver placed, and where it ended up.
    WallMoved {
        entity: u64,
        from_mm: [f64; 2],
        to_mm: [f64; 2],
        dx_mm: f64,
        dy_mm: f64,
    },
    /// A room's recorded area changed, usually because a wall beside it moved.
    RoomResized {
        entity: u64,
        name: String,
        from_m2: f64,
        to_m2: f64,
    },
    Deleted {
        entity: u64,
    },
    Created {
        entities: usize,
    },
    /// Something the classifier has no case for. Counted rather than dropped.
    Other,
}

/// An export that happened, and when.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Export {
    /// `dxf`, `pdf` or `obj`.
    pub format: String,
    /// How many commits deep the document was. A session that exports at step 3 and one
    /// that exports at step 30 are different stories.
    pub at_step: usize,
}

/// The two things that cannot be read out of the history.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Session {
    /// The option in front, e.g. `3bhk.side-corridor.v1+larger-living`.
    pub chosen_option: Option<String>,
    /// Every option the generation offered, so a rejection is as visible as a choice.
    pub options_offered: Vec<String>,
    pub exports: Vec<Export>,
}

/// Everything worth knowing about a session.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionLog {
    /// The brief, as the document carries it. `None` for an imported drawing.
    pub brief: Option<serde_json::Value>,
    pub chosen_option: Option<String>,
    pub options_offered: Vec<String>,
    /// The commit at which generation finished. Edits after it are corrections; the three
    /// commits of the generation itself are not.
    pub generated_at_step: Option<usize>,
    pub corrections: Vec<Correction>,
    pub exports: Vec<Export>,
    /// The PRD's headline metric: "40% of sessions reach a DXF or PDF export — the only
    /// real signal the output was usable."
    pub exported: bool,
    /// "Median under 8 wall edits. Measures how close first generation lands."
    pub wall_edits_before_export: usize,
}

impl SessionLog {
    pub fn to_json(&self) -> Vec<u8> {
        serde_json::to_vec_pretty(self).unwrap_or_default()
    }

    /// A sentence for the UI.
    pub fn summary(&self) -> String {
        let walls = self
            .corrections
            .iter()
            .filter(|c| matches!(c.kind, Kind::WallMoved { .. }))
            .count();
        format!(
            "{} correction(s), {walls} wall move(s), {} export(s)",
            self.corrections.len(),
            self.exports.len()
        )
    }
}

/// Read the log out of a sequencer.
///
/// Replays the history one commit at a time, because a correction is a *difference* and
/// the only honest way to know what a wall moved from is to hold the document as it was
/// before the commit that moved it.
pub fn log(seq: &Sequencer, session: &Session) -> SessionLog {
    let mut before = Document::new();
    let mut corrections = Vec::new();
    let mut generated_at: Option<usize> = None;

    for (step, commit) in seq.history().iter().enumerate().take(seq.applied()) {
        let after = apply_to(&before, commit);

        // Generation is three commits ending in the extrude. Everything after it is a
        // correction; the generation itself is the thing being corrected, not a correction.
        if commit.message().starts_with("generate ") {
            generated_at = Some(step + 1);
        } else if generated_at.is_some() {
            corrections.extend(classify(step, commit, &before, &after));
        }
        before = after;
    }

    let brief = tri_params::component::find(seq.document())
        .and_then(|(_, p)| serde_json::to_value(&p).ok());
    let first_export = session.exports.iter().map(|e| e.at_step).min();
    let wall_edits_before_export = corrections
        .iter()
        .filter(|c| matches!(c.kind, Kind::WallMoved { .. }))
        .filter(|c| first_export.is_none_or(|at| c.step < at))
        .count();

    SessionLog {
        brief,
        chosen_option: session.chosen_option.clone(),
        options_offered: session.options_offered.clone(),
        generated_at_step: generated_at,
        corrections,
        exports: session.exports.clone(),
        exported: !session.exports.is_empty(),
        wall_edits_before_export,
    }
}

/// Apply a commit's ops to a copy of the document.
///
/// Uses `tri_doc::check` like everything else, so a replay here cannot produce a state the
/// validator would have refused.
fn apply_to(doc: &Document, commit: &Commit) -> Document {
    let mut next = doc.clone();
    if let Ok(proof) = tri_doc::check(&next, commit.ops()) {
        let _ = next.apply(proof);
    }
    next
}

fn classify(step: usize, commit: &Commit, before: &Document, after: &Document) -> Vec<Correction> {
    let author = match commit.author() {
        tri_commit::Author::Human(_) => "human",
        tri_commit::Author::Agent(_, _) => "agent",
        tri_commit::Author::System(_) => "system",
    };
    let mut out = Vec::new();
    let mut created = 0usize;
    let mut seen_other = false;

    for op in commit.ops() {
        match op {
            Op::SetComponent { id, component } => match component {
                Component::WallProfile(_) => {
                    if let (Some(a), Some(b)) = (centreline(before, *id), centreline(after, *id)) {
                        if a != b {
                            out.push(Correction {
                                step,
                                commit: commit.id().to_hex(),
                                author: author.into(),
                                message: commit.message().to_string(),
                                kind: Kind::WallMoved {
                                    entity: id.raw(),
                                    from_mm: a,
                                    to_mm: b,
                                    dx_mm: b[0] - a[0],
                                    dy_mm: b[1] - a[1],
                                },
                            });
                        }
                    }
                }
                Component::Custom { type_name, .. } if type_name == tri_rules::ROOM_TYPE_NAME => {
                    if let (Some(a), Some(b)) = (room(before, *id), room(after, *id)) {
                        if (a.1 - b.1).abs() > 0.005 {
                            out.push(Correction {
                                step,
                                commit: commit.id().to_hex(),
                                author: author.into(),
                                message: commit.message().to_string(),
                                kind: Kind::RoomResized {
                                    entity: id.raw(),
                                    name: b.0,
                                    from_m2: a.1,
                                    to_m2: b.1,
                                },
                            });
                        }
                    }
                }
                _ => seen_other = true,
            },
            Op::DeleteEntity { id } => out.push(Correction {
                step,
                commit: commit.id().to_hex(),
                author: author.into(),
                message: commit.message().to_string(),
                kind: Kind::Deleted { entity: id.raw() },
            }),
            Op::CreateEntity { .. } => created += 1,
            _ => seen_other = true,
        }
    }
    if created > 0 {
        out.push(Correction {
            step,
            commit: commit.id().to_hex(),
            author: author.into(),
            message: commit.message().to_string(),
            kind: Kind::Created { entities: created },
        });
    }
    // A commit that changed something the classifier has no case for is still an edit. It
    // is counted rather than dropped, so "no corrections" always means no corrections.
    if out.is_empty() && seen_other {
        out.push(Correction {
            step,
            commit: commit.id().to_hex(),
            author: author.into(),
            message: commit.message().to_string(),
            kind: Kind::Other,
        });
    }
    out
}

/// A wall's first centreline point, in millimetres.
fn centreline(doc: &Document, id: EntityId) -> Option<[f64; 2]> {
    match doc.component(id, &ComponentKey::WallProfile) {
        Some(Component::WallProfile(w)) => w
            .centreline
            .first()
            .map(|p| [p.x.as_um() as f64 / 1000.0, p.y.as_um() as f64 / 1000.0]),
        _ => None,
    }
}

fn room(doc: &Document, id: EntityId) -> Option<(String, f64)> {
    let key = ComponentKey::Custom(tri_rules::ROOM_TYPE_NAME.to_string());
    match doc.component(id, &key) {
        Some(Component::Custom { data, .. }) => {
            let name = data.get("name")?.as_text()?.to_string();
            let area = data.get("area_mm2")?.as_i64()? as f64 / 1_000_000.0;
            Some((name, area))
        }
        _ => None,
    }
}
