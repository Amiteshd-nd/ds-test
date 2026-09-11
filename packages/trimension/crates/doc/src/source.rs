//! Invariant **I8**: the source schema. Raw imported entities, preserved verbatim,
//! never rewritten by anything downstream.
//!
//! Native objects point *back* here via `Component::SourceRef`. Re-import of a revised
//! drawing diffs against this, not against derived geometry — which is the whole reason
//! it exists: derived geometry has decisions baked into it, and diffing decisions is
//! meaningless.

use crate::component::CanonicalValue;
use crate::id::SourceId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One entity exactly as it appeared in the source file. Uninterpreted.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct SourceEntity {
    /// The source format's own type name, e.g. `"LWPOLYLINE"`, `"INSERT"`.
    pub kind: String,
    /// The source file's own layer name, verbatim, including case and punctuation.
    pub layer: String,
    /// The source handle, if the format has one. Used to diff across re-imports.
    pub handle: Option<String>,
    /// Everything else, unmodified.
    pub attributes: BTreeMap<String, CanonicalValue>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceSchema {
    entities: BTreeMap<SourceId, SourceEntity>,
    /// Provenance of the whole import: file name, format, unit resolution.
    pub imports: Vec<ImportRecord>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportRecord {
    pub file_name: String,
    pub format: String,
    /// How the drawing's units were resolved. `$INSUNITS` is unreliable, so this is
    /// surfaced rather than silently applied (PRD Prompt 3).
    pub unit_scale: crate::provenance::Tracked<i64>,
    pub entity_count: usize,
}

impl SourceSchema {
    pub fn get(&self, id: SourceId) -> Option<&SourceEntity> {
        self.entities.get(&id)
    }

    pub fn contains(&self, id: SourceId) -> bool {
        self.entities.contains_key(&id)
    }

    pub fn iter(&self) -> impl Iterator<Item = (SourceId, &SourceEntity)> {
        self.entities.iter().map(|(k, v)| (*k, v))
    }

    pub fn len(&self) -> usize {
        self.entities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }

    /// Find a previously imported entity by its source handle, for re-import diffing.
    pub fn by_handle(&self, handle: &str) -> Option<(SourceId, &SourceEntity)> {
        self.iter()
            .find(|(_, e)| e.handle.as_deref() == Some(handle))
    }

    pub(crate) fn insert(&mut self, id: SourceId, entity: SourceEntity) {
        self.entities.insert(id, entity);
    }
}
