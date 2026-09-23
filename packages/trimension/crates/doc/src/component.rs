//! Composition, not inheritance (PRD §4.3). An entity is an id plus a set of components.

use crate::id::{LayerId, SourceId};
use crate::provenance::{Provenance, Tracked};
use crate::units::{Length, Point2};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The discriminant of a component. Built-ins are fixed; `Custom` is how the type
/// registry extends the model at runtime without new enum variants in `doc`.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum ComponentKey {
    Transform,
    Polyline2d,
    WallProfile,
    Opening,
    Solid3d,
    LayerRef,
    SourceRef,
    Provenance,
    Label,
    Custom(String),
}

#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub enum Component {
    Transform(Transform),
    Polyline2d(Polyline2d),
    WallProfile(WallProfile),
    Opening(Opening),
    Solid3d(Solid3d),
    LayerRef(LayerId),
    SourceRef(Vec<SourceId>),
    /// Entity-level origin: how this entity came to exist at all. Distinct from the
    /// per-value records inside the components above. See `provenance` module docs.
    Provenance {
        provenance: Provenance,
        reason: String,
    },
    Label(String),
    /// Runtime-registered component. Payload is a canonical ordered map so that hashing
    /// stays deterministic; see [`CanonicalValue`].
    Custom {
        type_name: String,
        data: BTreeMap<String, CanonicalValue>,
    },
}

impl Component {
    pub fn key(&self) -> ComponentKey {
        match self {
            Component::Transform(_) => ComponentKey::Transform,
            Component::Polyline2d(_) => ComponentKey::Polyline2d,
            Component::WallProfile(_) => ComponentKey::WallProfile,
            Component::Opening(_) => ComponentKey::Opening,
            Component::Solid3d(_) => ComponentKey::Solid3d,
            Component::LayerRef(_) => ComponentKey::LayerRef,
            Component::SourceRef(_) => ComponentKey::SourceRef,
            Component::Provenance { .. } => ComponentKey::Provenance,
            Component::Label(_) => ComponentKey::Label,
            Component::Custom { type_name, .. } => ComponentKey::Custom(type_name.clone()),
        }
    }

    /// Every tracked value this component carries, for I4 reporting in the UI.
    ///
    /// Field names are owned rather than `&'static str` because a runtime-registered
    /// component's field paths are built at runtime. That is the whole point: before this
    /// returned `Vec::new()` for `Component::Custom`, which meant the type registry —
    /// the sanctioned extension mechanism — could not satisfy I4 at all.
    pub fn provenance_records(&self) -> Vec<(String, Provenance, String)> {
        let owned = |f: &str, p: Provenance, r: &str| (f.to_string(), p, r.to_string());
        match self {
            Component::WallProfile(w) => vec![
                owned("height", w.height.provenance(), w.height.reason()),
                owned("thickness", w.thickness.provenance(), w.thickness.reason()),
                owned(
                    "base_elevation",
                    w.base_elevation.provenance(),
                    w.base_elevation.reason(),
                ),
            ],
            Component::Opening(o) => vec![
                owned("width", o.width.provenance(), o.width.reason()),
                owned("height", o.height.provenance(), o.height.reason()),
                owned("sill", o.sill.provenance(), o.sill.reason()),
            ],
            Component::Custom { data, .. } => {
                let mut out = Vec::new();
                for (k, v) in data {
                    v.collect_provenance(k, &mut out);
                }
                out
            }
            _ => Vec::new(),
        }
    }
}

/// A JSON-like value with deterministic ordering. Deliberately has no float variant:
/// see `units` module docs on why floats cannot appear in hashed document state.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum CanonicalValue {
    Null,
    Bool(bool),
    Int(i64),
    Length(Length),
    Text(String),
    List(Vec<CanonicalValue>),
    Map(BTreeMap<String, CanonicalValue>),
    /// A value carrying how it was arrived at.
    ///
    /// Without this variant the type registry is a hole in invariant **I4**: a component
    /// registered at runtime could hold a defaulted wall thickness with no record that it
    /// was defaulted, which is exactly the failure the invariant exists to prevent. The
    /// built-in components get provenance from [`Tracked`](crate::Tracked) in field
    /// position; runtime-registered ones get it from here.
    Tracked {
        value: Box<CanonicalValue>,
        provenance: Provenance,
        reason: String,
    },
}

impl CanonicalValue {
    pub fn tracked(
        value: CanonicalValue,
        provenance: Provenance,
        reason: impl Into<String>,
    ) -> Self {
        CanonicalValue::Tracked {
            value: Box::new(value),
            provenance,
            reason: reason.into(),
        }
    }

    pub fn measured(value: CanonicalValue, reason: impl Into<String>) -> Self {
        Self::tracked(value, Provenance::Measured, reason)
    }

    pub fn inferred(value: CanonicalValue, reason: impl Into<String>) -> Self {
        Self::tracked(value, Provenance::Inferred, reason)
    }

    pub fn assumed(value: CanonicalValue, reason: impl Into<String>) -> Self {
        Self::tracked(value, Provenance::Assumed, reason)
    }

    /// The value with any provenance wrapper removed.
    pub fn bare(&self) -> &CanonicalValue {
        match self {
            CanonicalValue::Tracked { value, .. } => value.bare(),
            other => other,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self.bare() {
            CanonicalValue::Int(i) => Some(*i),
            CanonicalValue::Length(l) => Some(l.as_um()),
            _ => None,
        }
    }

    pub fn as_length(&self) -> Option<Length> {
        match self.bare() {
            CanonicalValue::Length(l) => Some(*l),
            _ => None,
        }
    }

    pub fn as_text(&self) -> Option<&str> {
        match self.bare() {
            CanonicalValue::Text(t) => Some(t),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self.bare() {
            CanonicalValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Every tracked value beneath this one, keyed by a dotted path.
    ///
    /// Recursive so a nested parameter group reports `setbacks.front` rather than a bare
    /// `front` that collides with three other fields.
    pub fn collect_provenance(&self, prefix: &str, out: &mut Vec<(String, Provenance, String)>) {
        match self {
            CanonicalValue::Tracked {
                value,
                provenance,
                reason,
            } => {
                out.push((prefix.to_string(), *provenance, reason.clone()));
                value.collect_provenance(prefix, out);
            }
            CanonicalValue::Map(m) => {
                for (k, v) in m {
                    let path = if prefix.is_empty() {
                        k.clone()
                    } else {
                        format!("{prefix}.{k}")
                    };
                    v.collect_provenance(&path, out);
                }
            }
            CanonicalValue::List(items) => {
                for (i, v) in items.iter().enumerate() {
                    v.collect_provenance(&format!("{prefix}[{i}]"), out);
                }
            }
            _ => {}
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub struct Transform {
    pub translation: Point2,
    /// Rotation in milli-degrees. Integer for the same determinism reason as `Length`.
    pub rotation_mdeg: i32,
    /// Uniform scale in parts-per-million. 1_000_000 == identity.
    pub scale_ppm: i64,
}

impl Transform {
    pub const IDENTITY: Transform = Transform {
        translation: Point2::new(Length::ZERO, Length::ZERO),
        rotation_mdeg: 0,
        scale_ppm: 1_000_000,
    };
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Polyline2d {
    pub points: Vec<Point2>,
    pub closed: bool,
}

/// A wall run: centreline plus the dimensions needed to extrude it.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct WallProfile {
    pub centreline: Vec<Point2>,
    pub thickness: Tracked<Length>,
    pub height: Tracked<Length>,
    pub base_elevation: Tracked<Length>,
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Opening {
    /// The wall this opening cuts. Containment is a validated invariant.
    pub host: crate::id::EntityId,
    pub kind: OpeningKind,
    /// Distance along the host wall's centreline to the opening's centre.
    pub position: Length,
    pub width: Tracked<Length>,
    pub height: Tracked<Length>,
    pub sill: Tracked<Length>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpeningKind {
    Door,
    Window,
    Passage,
}

/// Tessellated result. Positions are µm; indices are triangles.
#[derive(Clone, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub struct Solid3d {
    pub positions: Vec<[i64; 3]>,
    pub indices: Vec<u32>,
}

/// A set of components, at most one per key.
#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct ComponentSet {
    inner: BTreeMap<ComponentKey, Component>,
}

impl ComponentSet {
    pub fn get(&self, key: &ComponentKey) -> Option<&Component> {
        self.inner.get(key)
    }

    pub fn has(&self, key: &ComponentKey) -> bool {
        self.inner.contains_key(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&ComponentKey, &Component)> {
        self.inner.iter()
    }

    pub fn keys(&self) -> impl Iterator<Item = &ComponentKey> {
        self.inner.keys()
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub(crate) fn set(&mut self, c: Component) -> Option<Component> {
        self.inner.insert(c.key(), c)
    }

    pub(crate) fn remove(&mut self, key: &ComponentKey) -> Option<Component> {
        self.inner.remove(key)
    }
}

/// Runtime type registry (PRD §4.3): custom component types are declared here rather
/// than by adding variants to [`Component`].
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TypeRegistry {
    types: BTreeMap<String, TypeDef>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TypeDef {
    pub name: String,
    /// Field name → whether it must be present. Intentionally minimal; this is a
    /// structural check, not a schema language.
    pub fields: BTreeMap<String, bool>,
}

impl TypeRegistry {
    pub fn get(&self, name: &str) -> Option<&TypeDef> {
        self.types.get(name)
    }

    pub fn contains(&self, name: &str) -> bool {
        self.types.contains_key(name)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &TypeDef)> {
        self.types.iter()
    }

    pub(crate) fn register(&mut self, def: TypeDef) {
        self.types.insert(def.name.clone(), def);
    }
}
