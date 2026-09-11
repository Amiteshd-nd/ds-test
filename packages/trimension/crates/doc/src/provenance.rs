//! Invariant **I4**: no derived value travels without a record of how it was derived.
//!
//! # Why this is a value wrapper and not only a component
//! PRD §4.3 lists `Provenance` among the components, i.e. one record per entity. But I4
//! says *any number* not read from the drawing carries provenance, and a single wall
//! simultaneously has an `Assumed` height, an `Inferred` thickness and a `Measured`
//! outline. One record per entity cannot express that; it collapses to "mixed", which is
//! exactly the non-answer a reviewer cannot sign off on.
//!
//! So [`Tracked<T>`] wraps the *value*, in field position, and the entity-level
//! [`Component::Provenance`](crate::component::Component) record is kept for the
//! separate question of how the entity as a whole came to exist.

use serde::{Deserialize, Serialize};

/// How a value came to be.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    /// Read literally from the source drawing. A DXF `DIMENSION`, an explicit coordinate.
    Measured,
    /// Derived from source data by a rule. A centreline from two parallel polylines.
    Inferred,
    /// Not derivable from the drawing at all. A defaulted 2700mm wall height.
    Assumed,
}

impl Provenance {
    /// Ordering by how much a reviewer should distrust it.
    pub fn confidence_rank(self) -> u8 {
        match self {
            Provenance::Measured => 0,
            Provenance::Inferred => 1,
            Provenance::Assumed => 2,
        }
    }

    pub fn needs_review(self) -> bool {
        !matches!(self, Provenance::Measured)
    }
}

/// A value plus how it was arrived at. The reason string is mandatory and is shown to a
/// human in the UI — "default" is not an acceptable reason, "no DIMENSION or height
/// annotation found on layer A-WALL; used project default 2700mm" is.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub struct Tracked<T> {
    value: T,
    provenance: Provenance,
    reason: String,
}

impl<T> Tracked<T> {
    pub fn measured(value: T, reason: impl Into<String>) -> Self {
        Self::new(value, Provenance::Measured, reason)
    }

    pub fn inferred(value: T, reason: impl Into<String>) -> Self {
        Self::new(value, Provenance::Inferred, reason)
    }

    pub fn assumed(value: T, reason: impl Into<String>) -> Self {
        Self::new(value, Provenance::Assumed, reason)
    }

    /// Construction is deliberately permissive: an empty reason is rejected by
    /// `validate::check`, not by a `debug_assert` here. Enforcing it at construction
    /// would put a second, weaker gate in front of I1 — one that vanishes in release
    /// builds and that no test can exercise. There is exactly one enforcement point.
    fn new(value: T, provenance: Provenance, reason: impl Into<String>) -> Self {
        Tracked {
            value,
            provenance,
            reason: reason.into(),
        }
    }

    pub fn value(&self) -> &T {
        &self.value
    }

    pub fn provenance(&self) -> Provenance {
        self.provenance
    }

    pub fn reason(&self) -> &str {
        &self.reason
    }

    /// Transform the value while carrying the record forward. There is deliberately no
    /// way to extract the value and drop the record in one step.
    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> Tracked<U> {
        Tracked {
            value: f(self.value),
            provenance: self.provenance,
            reason: self.reason,
        }
    }

    /// Combine two tracked values. The result is never more trusted than its worst input,
    /// which is the property that stops confidence laundering.
    pub fn combine<U, V>(
        self,
        other: Tracked<U>,
        reason: impl Into<String>,
        f: impl FnOnce(T, U) -> V,
    ) -> Tracked<V> {
        let provenance = self.provenance.max(other.provenance);
        Tracked::new(f(self.value, other.value), provenance, reason)
    }
}

impl<T: Copy> Tracked<T> {
    pub fn get(&self) -> T {
        self.value
    }
}
