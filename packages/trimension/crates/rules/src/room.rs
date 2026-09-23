//! The room vocabulary.
//!
//! Defined here rather than in the generator because the rule engine is what has to
//! *interpret* a room — a generator that owned the definition could rename a field and
//! silently stop being checked. `doc` has no business knowing what a kitchen is, so this
//! is a registered component type rather than a built-in.

use std::collections::BTreeMap;
use tri_doc::component::{CanonicalValue, Component, ComponentKey, TypeDef};
use tri_doc::{Document, EntityId, Length, Provenance};

pub const ROOM_TYPE_NAME: &str = "Room";

pub fn type_definition() -> TypeDef {
    TypeDef {
        name: ROOM_TYPE_NAME.to_string(),
        fields: [("name", true), ("kind", true), ("area_mm2", true)]
            .iter()
            .map(|(f, r)| (f.to_string(), *r))
            .collect(),
    }
}

/// A room as stored on the document.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Room {
    pub entity: EntityId,
    pub name: String,
    /// Matches a `kind` in the ruleset's minimum table.
    pub kind: String,
    pub area_mm2: i64,
    pub width: Length,
    pub depth: Length,
    /// How the area was arrived at, carried through so a room that fails a minimum can
    /// say whether the dimension was stated or guessed.
    pub area_provenance: Provenance,
}

/// Build the component data for a room, stating how the area was arrived at.
///
/// A room the template laid out is `Assumed`; one whose edge an architect dragged is
/// `Measured`, because moving it is evidence. [`to_data`] keeps the common case short.
pub fn to_data_with(
    name: &str,
    kind: &str,
    area_mm2: i64,
    width: Length,
    depth: Length,
    reason: &str,
    provenance: Provenance,
) -> BTreeMap<String, CanonicalValue> {
    let mut data = to_data(name, kind, area_mm2, width, depth, reason);
    if provenance != Provenance::Assumed {
        for key in ["area_mm2", "width", "depth"] {
            if let Some(CanonicalValue::Tracked { value, .. }) = data.get(key) {
                data.insert(
                    key.to_string(),
                    CanonicalValue::tracked((**value).clone(), provenance, reason),
                );
            }
        }
    }
    data
}

/// Build the component data for a room.
pub fn to_data(
    name: &str,
    kind: &str,
    area_mm2: i64,
    width: Length,
    depth: Length,
    reason: &str,
) -> BTreeMap<String, CanonicalValue> {
    BTreeMap::from([
        ("name".to_string(), CanonicalValue::Text(name.to_string())),
        ("kind".to_string(), CanonicalValue::Text(kind.to_string())),
        (
            "area_mm2".to_string(),
            CanonicalValue::assumed(CanonicalValue::Int(area_mm2), reason),
        ),
        (
            "width".to_string(),
            CanonicalValue::assumed(CanonicalValue::Length(width), reason),
        ),
        (
            "depth".to_string(),
            CanonicalValue::assumed(CanonicalValue::Length(depth), reason),
        ),
    ])
}

/// Every room on the document.
pub fn all(doc: &Document) -> Vec<Room> {
    let key = ComponentKey::Custom(ROOM_TYPE_NAME.to_string());
    doc.iter_with(key.clone())
        .filter_map(|(entity, set)| {
            let Component::Custom { data, .. } = set.get(&key)? else {
                return None;
            };
            let provenance = match data.get("area_mm2") {
                Some(CanonicalValue::Tracked { provenance, .. }) => *provenance,
                // A room whose area arrived without provenance is reported as the least
                // trustworthy thing it could be, rather than quietly as measured.
                _ => Provenance::Assumed,
            };
            Some(Room {
                entity,
                name: data.get("name")?.as_text()?.to_string(),
                kind: data.get("kind")?.as_text()?.to_string(),
                area_mm2: data.get("area_mm2")?.as_i64()?,
                width: data.get("width").and_then(|v| v.as_length())?,
                depth: data.get("depth").and_then(|v| v.as_length())?,
                area_provenance: provenance,
            })
        })
        .collect()
}
