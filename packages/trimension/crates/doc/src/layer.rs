//! Nested layers. Cycles are an invariant violation (PRD §4.3) — this is the canonical
//! invariant test, and exactly the case Rayon cites as impossible to guarantee
//! client-side, which is why it is checked in shared code that both targets compile.

use crate::id::LayerId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layer {
    pub name: String,
    pub parent: Option<LayerId>,
    pub visible: bool,
    /// RGBA, as authored. Layer colour is display metadata, not geometry.
    pub color: [u8; 4],
}

/// `BTreeMap` rather than `HashMap`: iteration order feeds the document hash.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LayerTree {
    layers: BTreeMap<LayerId, Layer>,
}

impl LayerTree {
    pub fn get(&self, id: LayerId) -> Option<&Layer> {
        self.layers.get(&id)
    }

    pub fn contains(&self, id: LayerId) -> bool {
        self.layers.contains_key(&id)
    }

    pub fn iter(&self) -> impl Iterator<Item = (LayerId, &Layer)> {
        self.layers.iter().map(|(k, v)| (*k, v))
    }

    pub fn len(&self) -> usize {
        self.layers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.layers.is_empty()
    }

    /// Walk from `start` to the root. Terminates even on a corrupt tree: the walk is
    /// bounded by the layer count, so a cycle that somehow got in returns `Err` rather
    /// than hanging the browser tab.
    pub fn ancestors(&self, start: LayerId) -> Result<Vec<LayerId>, CycleDetected> {
        let mut seen = Vec::new();
        let mut cursor = Some(start);
        while let Some(id) = cursor {
            if seen.contains(&id) {
                return Err(CycleDetected { at: id });
            }
            seen.push(id);
            if seen.len() > self.layers.len() + 1 {
                return Err(CycleDetected { at: id });
            }
            cursor = self.layers.get(&id).and_then(|l| l.parent);
        }
        Ok(seen)
    }

    /// Would setting `child`'s parent to `new_parent` create a cycle?
    ///
    /// This is the single most important predicate in the invariant system: it is a
    /// *global* property of the tree, which is precisely why a CRDT cannot express it
    /// and why we need a central sequencer (PRD §4.4, anti-patterns).
    pub fn would_cycle(&self, child: LayerId, new_parent: Option<LayerId>) -> bool {
        let Some(parent) = new_parent else {
            return false; // reparenting to root is always safe
        };
        if parent == child {
            return true;
        }
        match self.ancestors(parent) {
            // `child` already above `parent` ⇒ linking them closes a loop.
            Ok(chain) => chain.contains(&child),
            // Already corrupt; refuse to make it worse.
            Err(_) => true,
        }
    }

    pub(crate) fn insert(&mut self, id: LayerId, layer: Layer) {
        self.layers.insert(id, layer);
    }

    pub(crate) fn get_mut(&mut self, id: LayerId) -> Option<&mut Layer> {
        self.layers.get_mut(&id)
    }

    pub(crate) fn remove(&mut self, id: LayerId) -> Option<Layer> {
        self.layers.remove(&id)
    }

    pub(crate) fn children_of(&self, id: LayerId) -> Vec<LayerId> {
        self.layers
            .iter()
            .filter(|(_, l)| l.parent == Some(id))
            .map(|(k, _)| *k)
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CycleDetected {
    pub at: LayerId,
}
