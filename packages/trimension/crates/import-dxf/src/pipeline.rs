//! Import orchestration: phase A and phase B, both as commits.
//!
//! This is the module PRD Prompt 5 warns about — "the whole pipeline runs as commits,
//! not as a side-channel mutation — I1 applies here too, and this is the place it's most
//! tempting to break". There is no `&mut Document` anywhere below that is not reached
//! through a validated commit.

use crate::classify::{self, Classified};
use crate::importer::Importer;
use crate::rules::RuleSet;
use std::collections::BTreeMap;
use tri_commit::{Author, Commit, CommitError, Sequencer};
use tri_doc::{Component, EntityId, LayerId};

/// Everything the caller needs to review an import.
#[derive(Clone, Debug)]
pub struct ImportOutcome {
    /// Layer commit, phase-A commit, phase-B commit — in that order.
    pub commits: Vec<tri_commit::CommitId>,
    pub classified: Classified,
    /// How units were resolved. Check `provenance()` before trusting any dimension.
    pub unit_scale: tri_doc::Tracked<i64>,
    pub source_entities: usize,
    pub native_entities: usize,
}

impl ImportOutcome {
    /// A short report for a human, and the thing an agent should read instead of the
    /// document (invariant **I5**).
    pub fn report(&self) -> String {
        use crate::rules::Classification as C;
        let mut s = String::new();
        s.push_str(&format!(
            "imported {} source entities -> {} native objects\n",
            self.source_entities, self.native_entities
        ));
        s.push_str(&format!(
            "units: {} um/unit ({:?}) - {}\n",
            self.unit_scale.get(),
            self.unit_scale.provenance(),
            self.unit_scale.reason()
        ));
        for c in [
            C::Wall,
            C::Door,
            C::Window,
            C::Annotation,
            C::Ignored,
            C::Unknown,
        ] {
            let n = self.classified.count(c);
            if n > 0 {
                s.push_str(&format!("  {c:?}: {n}\n"));
            }
        }
        let q = self.classified.questionable();
        if !q.is_empty() {
            s.push_str(&format!("{} decision(s) need review:\n", q.len()));
            for d in q.iter().take(10) {
                s.push_str(&format!("  - {:?}: {}\n", d.source, d.because));
            }
        }
        s
    }
}

#[derive(Debug)]
pub enum ImportError {
    Read(String),
    Commit(CommitError),
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImportError::Read(m) => write!(f, "{m}"),
            ImportError::Commit(c) => write!(f, "{c}"),
        }
    }
}

impl std::error::Error for ImportError {}

/// Import a drawing into a live session.
///
/// Three commits, deliberately separate: layers, then raw source (I8), then derived
/// native objects. Keeping them apart means a re-import can replace the third without
/// touching the second, and a reviewer can see exactly which commit invented something.
pub fn import<I: Importer>(
    seq: &mut Sequencer,
    importer: &I,
    bytes: &[u8],
    file_name: &str,
    rules: &RuleSet,
) -> Result<ImportOutcome, ImportError>
where
    I::Error: std::fmt::Display,
{
    let load = importer
        .read_source(bytes, file_name)
        .map_err(|e| ImportError::Read(e.to_string()))?;

    // --- commit 1: layers -----------------------------------------------------
    let layer_ops = classify::layer_ops(&load);
    let layer_count = layer_ops.len();
    let c1 = submit(
        seq,
        layer_ops,
        format!("import {file_name}: {layer_count} layers"),
    )?;
    let layer_ids: BTreeMap<String, LayerId> = load
        .layers
        .iter()
        .enumerate()
        .map(|(i, l)| {
            (
                l.name.clone(),
                LayerId::from_raw(first_layer_raw(seq, layer_count) + i as u64),
            )
        })
        .collect();

    // --- commit 2: phase A, raw source (I8) -----------------------------------
    let source_op_count = load
        .ops
        .iter()
        .filter(|o| matches!(o, tri_doc::Op::AddSourceEntity { .. }))
        .count();
    let c2 = submit(
        seq,
        load.ops.clone(),
        format!("import {file_name}: {source_op_count} source entities (phase A, lossless)"),
    )?;
    // Source ids are monotonic and the schema iterates in id order, so the entities this
    // commit added are the last `source_op_count` of them.
    let all_sources: Vec<_> = seq.document().source().iter().map(|(id, _)| id).collect();
    let source_ids: Vec<_> = all_sources
        .iter()
        .skip(all_sources.len().saturating_sub(source_op_count))
        .copied()
        .collect();

    // --- commit 3: phase B, classification ------------------------------------
    let mut classified = classify::classify(&load, &source_ids, &layer_ids, rules);

    // Wall entities are minted first within this batch, so their ids are predictable.
    let wall_count = classified
        .ops
        .iter()
        .filter(|o| {
            matches!(o, tri_doc::Op::CreateEntity { components }
                if components.iter().any(|c| matches!(c, Component::WallProfile(_))))
        })
        .count();
    let next = next_entity_raw(seq);
    let wall_entities: Vec<EntityId> = (0..wall_count)
        .map(|i| EntityId::from_raw(next + i as u64))
        .collect();
    classify::resolve_hosts(&mut classified.ops, &wall_entities);

    let native = classified.ops.len();
    let c3 = submit(
        seq,
        classified.ops.clone(),
        format!("import {file_name}: {native} native objects (phase B, classified)"),
    )?;

    Ok(ImportOutcome {
        commits: vec![c1, c2, c3],
        classified,
        unit_scale: load.unit_scale,
        source_entities: source_op_count,
        native_entities: native,
    })
}

fn submit(
    seq: &mut Sequencer,
    ops: Vec<tri_doc::Op>,
    message: String,
) -> Result<tri_commit::CommitId, ImportError> {
    if ops.is_empty() {
        return Ok(seq.head());
    }
    // System authorship: still a commit, still validated. The label exists to make an
    // import visible in history, not to excuse it from I1.
    let commit = Commit::new(seq.head(), Author::system("importer"), ops, message);
    seq.submit(commit)
        .map(|c| c.id())
        .map_err(ImportError::Commit)
}

/// Ids are minted monotonically, so the layers just created occupy the last `n` slots.
fn first_layer_raw(seq: &Sequencer, n: usize) -> u64 {
    let total = seq.document().layers().len() as u64;
    total.saturating_sub(n as u64) + 1
}

fn next_entity_raw(seq: &Sequencer) -> u64 {
    seq.document()
        .iter_entities()
        .map(|(id, _)| id.raw())
        .max()
        .unwrap_or(0)
        + 1
}
