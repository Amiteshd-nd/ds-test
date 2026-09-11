//! Stable identifiers.
//!
//! # Deviation from PRD §4.3 (`SlotMap`)
//! The PRD stores entities in a `SlotMap`. Two problems against M1's requirements:
//! slotmap keys carry a generation counter, so an id is not purely a function of the
//! commit history; and its iteration order is an implementation detail, which makes a
//! deterministic document hash depend on a third-party crate's internals.
//!
//! Instead: `EntityId(u64)` from a monotonic counter that is itself part of document
//! state, stored in a `BTreeMap`. Ids are then a pure function of the commit sequence,
//! iteration is sorted, and the hash is reproducible by construction rather than by
//! hoping. Slot reuse was the only thing `SlotMap` bought us and we do not want it —
//! PRD §4.3 says ids are stable for the life of the document, so nothing is ever reused.

use serde::{Deserialize, Serialize};
use std::fmt;

macro_rules! id_type {
    ($name:ident, $prefix:literal, $doc:literal) => {
        #[doc = $doc]
        #[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        pub struct $name(pub(crate) u64);

        impl $name {
            pub const fn raw(self) -> u64 {
                self.0
            }

            /// Only for deserialising an existing document or writing a test fixture.
            pub const fn from_raw(v: u64) -> Self {
                $name(v)
            }
        }

        impl fmt::Debug for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}{}", $prefix, self.0)
            }
        }
    };
}

id_type!(
    EntityId,
    "e",
    "Identifies an entity. Stable for the life of the document."
);
id_type!(LayerId, "l", "Identifies a layer in the layer tree.");
id_type!(
    SourceId,
    "s",
    "Identifies a raw imported entity in the source schema."
);

/// Monotonic id allocation. Part of document state so that replaying a commit sequence
/// from empty reproduces the same ids — one of M1's required tests.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdAllocator {
    next_entity: u64,
    next_layer: u64,
    next_source: u64,
}

impl IdAllocator {
    pub(crate) fn entity(&mut self) -> EntityId {
        self.next_entity += 1;
        EntityId(self.next_entity)
    }

    pub(crate) fn layer(&mut self) -> LayerId {
        self.next_layer += 1;
        LayerId(self.next_layer)
    }

    pub(crate) fn source(&mut self) -> SourceId {
        self.next_source += 1;
        SourceId(self.next_source)
    }

    pub(crate) fn peek_entity(&self) -> EntityId {
        EntityId(self.next_entity + 1)
    }
}
