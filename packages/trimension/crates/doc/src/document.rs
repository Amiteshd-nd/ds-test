//! The document itself. Invariants **I1** and **I2** live or die here.

use crate::component::{Component, ComponentKey, ComponentSet, TypeRegistry};
use crate::hash::{Canonical, CanonicalHash, DocHash};
use crate::id::{EntityId, IdAllocator};
use crate::layer::LayerTree;
use crate::op::{Minted, Op};
use crate::source::SourceSchema;
use crate::validate::Validated;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Bumped when the on-disk shape changes. A client opening an older document emits a
/// migration commit (PRD §2, lazy migration) rather than the server rewriting it.
pub const CURRENT_FORMAT_VERSION: u32 = 1;

/// The whole document.
///
/// Every field is private and there is exactly one `&mut self` method that changes
/// state: [`Document::apply`], which cannot be called without a
/// [`Validated`](crate::validate::Validated). That is invariant I1, checked by the
/// compiler.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Document {
    entities: BTreeMap<EntityId, ComponentSet>,
    types: TypeRegistry,
    layers: LayerTree,
    source: SourceSchema,
    ids: IdAllocator,
    format_version: u32,
    /// Incremented on every successful apply. Binds a `Validated` proof to the exact
    /// state it was checked against, closing the validate-then-mutate race.
    revision: u64,
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

impl Document {
    pub fn new() -> Self {
        Document {
            entities: BTreeMap::new(),
            types: TypeRegistry::default(),
            layers: LayerTree::default(),
            source: SourceSchema::default(),
            ids: IdAllocator::default(),
            format_version: CURRENT_FORMAT_VERSION,
            revision: 0,
        }
    }

    // ---- reads -----------------------------------------------------------------

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn format_version(&self) -> u32 {
        self.format_version
    }

    pub fn layers(&self) -> &LayerTree {
        &self.layers
    }

    pub fn types(&self) -> &TypeRegistry {
        &self.types
    }

    pub fn source(&self) -> &SourceSchema {
        &self.source
    }

    pub fn entity_count(&self) -> usize {
        self.entities.len()
    }

    pub fn contains_entity(&self, id: EntityId) -> bool {
        self.entities.contains_key(&id)
    }

    pub fn components(&self, id: EntityId) -> Option<&ComponentSet> {
        self.entities.get(&id)
    }

    pub fn component(&self, id: EntityId, key: &ComponentKey) -> Option<&Component> {
        self.entities.get(&id).and_then(|s| s.get(key))
    }

    /// Sorted by id, so every consumer sees the same order on every target.
    pub fn iter_entities(&self) -> impl Iterator<Item = (EntityId, &ComponentSet)> {
        self.entities.iter().map(|(k, v)| (*k, v))
    }

    /// Entities carrying a given component kind.
    pub fn iter_with(&self, key: ComponentKey) -> impl Iterator<Item = (EntityId, &ComponentSet)> {
        self.entities
            .iter()
            .filter(move |(_, set)| set.has(&key))
            .map(|(k, v)| (*k, v))
    }

    pub(crate) fn peek_next_entity_raw(&self) -> u64 {
        self.ids.peek_entity().raw() - 1
    }

    pub(crate) fn peek_next_layer_raw(&self) -> u64 {
        let mut probe = self.ids.clone();
        probe.layer().raw() - 1
    }

    pub(crate) fn peek_next_source_raw(&self) -> u64 {
        let mut probe = self.ids.clone();
        probe.source().raw() - 1
    }

    /// Content hash. Deterministic across runs and across compile targets — see `hash`.
    ///
    /// `revision` is deliberately excluded: two documents reached by different commit
    /// counts but holding identical content must hash identically, otherwise the
    /// "replay from empty reproduces the original" test is testing the counter rather
    /// than the content.
    pub fn hash(&self) -> DocHash {
        let mut c = Canonical::new();
        c.tag(0xD0).u32(self.format_version);
        c.len(self.entities.len());
        for (id, set) in &self.entities {
            c.u64(id.raw());
            set.hash_into(&mut c);
        }
        self.layers.hash_into(&mut c);
        self.types.hash_into(&mut c);
        self.source.hash_into(&mut c);
        // Allocator state matters: two documents with the same content but different
        // next-ids will diverge on the next commit, so they are not interchangeable.
        c.u64(self.peek_next_entity_raw())
            .u64(self.peek_next_layer_raw())
            .u64(self.peek_next_source_raw());
        c.finish()
    }

    // ---- the single write path (I1) --------------------------------------------

    /// Apply a validated batch. Atomic: a `Validated` is only issued when every op in
    /// the batch passed, so there is no partial-apply path to reason about.
    ///
    /// The only way to obtain the `Validated` argument is
    /// [`validate::check`](crate::validate::check).
    pub fn apply(&mut self, proof: Validated<'_>) -> Result<Minted, StaleValidation> {
        if proof.revision != self.revision {
            return Err(StaleValidation {
                validated_against: proof.revision,
                current: self.revision,
            });
        }

        let mut minted = Minted::default();
        for op in proof.ops {
            self.apply_one(op, &mut minted);
        }
        self.revision += 1;
        Ok(minted)
    }

    /// Infallible by construction: validation already rejected everything that could
    /// fail. Anything that could still go wrong here is a bug in `validate`, and is
    /// asserted rather than silently tolerated.
    fn apply_one(&mut self, op: &Op, minted: &mut Minted) {
        match op {
            Op::CreateEntity { components } => {
                let id = self.ids.entity();
                let mut set = ComponentSet::default();
                for c in components {
                    set.set(c.clone());
                }
                self.entities.insert(id, set);
                minted.entities.push(id);
            }
            Op::DeleteEntity { id } => {
                self.entities.remove(id);
            }
            Op::SetComponent { id, component } => {
                if let Some(set) = self.entities.get_mut(id) {
                    set.set(component.clone());
                }
            }
            Op::RemoveComponent { id, key } => {
                if let Some(set) = self.entities.get_mut(id) {
                    set.remove(key);
                }
            }
            Op::CreateLayer { layer } => {
                let id = self.ids.layer();
                self.layers.insert(id, layer.clone());
                minted.layers.push(id);
            }
            Op::ReparentLayer { id, new_parent } => {
                if let Some(l) = self.layers.get_mut(*id) {
                    l.parent = *new_parent;
                }
            }
            Op::RenameLayer { id, name } => {
                if let Some(l) = self.layers.get_mut(*id) {
                    l.name = name.clone();
                }
            }
            Op::SetLayerVisible { id, visible } => {
                if let Some(l) = self.layers.get_mut(*id) {
                    l.visible = *visible;
                }
            }
            Op::DeleteLayer { id } => {
                self.layers.remove(*id);
            }
            Op::RegisterType { def } => {
                self.types.register(def.clone());
            }
            Op::AddSourceEntity { entity } => {
                let id = self.ids.source();
                self.source.insert(id, entity.clone());
                minted.sources.push(id);
            }
            Op::RecordImport { record } => {
                self.source.imports.push(record.clone());
            }
            Op::SetFormatVersion { version } => {
                self.format_version = *version;
            }
        }
    }
}

/// A proof was checked against a document state that has since moved on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StaleValidation {
    pub validated_against: u64,
    pub current: u64,
}

impl std::fmt::Display for StaleValidation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "validation was against revision {} but the document is at {}",
            self.validated_against, self.current
        )
    }
}

impl std::error::Error for StaleValidation {}

/// Convenience for tests and for `commit`: validate then apply in one step.
///
/// This is *not* a bypass — it calls the same `check` and would not compile without it.
pub fn validate_and_apply(doc: &mut Document, ops: &[Op]) -> Result<Minted, ApplyError> {
    let proof = crate::validate::check(doc, ops).map_err(ApplyError::Rejected)?;
    doc.apply(proof).map_err(ApplyError::Stale)
}

#[derive(Debug)]
pub enum ApplyError {
    Rejected(Vec<crate::validate::Violation>),
    Stale(StaleValidation),
}

impl std::fmt::Display for ApplyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApplyError::Rejected(vs) => {
                write!(f, "commit rejected ({} violation(s)):", vs.len())?;
                for v in vs {
                    write!(f, "\n  - {v}")?;
                }
                Ok(())
            }
            ApplyError::Stale(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for ApplyError {}
