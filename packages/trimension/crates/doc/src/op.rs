//! The op alphabet. Every document mutation is expressible as a sequence of these and
//! nothing else — that is what makes invariant **I1** checkable rather than aspirational.

use crate::component::{Component, ComponentKey, TypeDef};
use crate::id::{EntityId, LayerId, SourceId};
use crate::layer::Layer;
use crate::source::{ImportRecord, SourceEntity};
use serde::{Deserialize, Serialize};

/// A single primitive mutation.
///
/// Ops that create things do not carry the new id: ids come from the document's
/// allocator so that replaying a sequence from empty reproduces them exactly. Ops that
/// reference things carry ids, which is what makes them validatable before apply.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub enum Op {
    CreateEntity {
        /// Components the entity is born with. An entity is never created empty and then
        /// populated — that would let an invalid intermediate state exist.
        components: Vec<Component>,
    },
    DeleteEntity {
        id: EntityId,
    },
    SetComponent {
        id: EntityId,
        component: Component,
    },
    RemoveComponent {
        id: EntityId,
        key: ComponentKey,
    },
    CreateLayer {
        layer: Layer,
    },
    /// The op that the layer-cycle invariant exists for.
    ReparentLayer {
        id: LayerId,
        new_parent: Option<LayerId>,
    },
    RenameLayer {
        id: LayerId,
        name: String,
    },
    SetLayerVisible {
        id: LayerId,
        visible: bool,
    },
    DeleteLayer {
        id: LayerId,
    },
    RegisterType {
        def: TypeDef,
    },
    /// I8 phase A: raw source entity, uninterpreted.
    AddSourceEntity {
        entity: SourceEntity,
    },
    RecordImport {
        record: ImportRecord,
    },
    /// Lazy migration (PRD §2, Rayon): a client opening an old document emits this.
    SetFormatVersion {
        version: u32,
    },
}

/// Ids minted while applying a batch, in order, so a caller can learn what it created
/// without reaching into the document.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Minted {
    pub entities: Vec<EntityId>,
    pub layers: Vec<LayerId>,
    pub sources: Vec<SourceId>,
}
