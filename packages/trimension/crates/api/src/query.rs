//! The read side — invariant **I5**.
//!
//! Every function here returns a *subset* or a *summary*. There is deliberately no
//! `serialize_document`, no `all_entities`, and no way to page through the whole model
//! one query at a time without noticing: every result carries a truncation flag, and the
//! caps are hard.
//!
//! "If a task seems to need the whole model, the answer is a better query, not a bigger
//! context window."

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tri_doc::component::WallProfile;
use tri_doc::{Component, ComponentKey, Document, EntityId, Provenance};

/// Hard cap on entities returned by a single query. Not configurable by the caller: a
/// caller who could raise it would raise it.
pub const MAX_RESULTS: usize = 200;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct BoxMm {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl BoxMm {
    fn contains_point(&self, p: tri_doc::Point2) -> bool {
        let (x, y) = (p.x.as_mm_f64(), p.y.as_mm_f64());
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y
    }

    /// Does the segment `a`-`b` intersect this box?
    ///
    /// Vertex containment alone is not enough, and getting this wrong is not cosmetic:
    /// an 8m wall whose two endpoints are both off-screen would fail a vertex test and
    /// disappear from the drawing, and a click in the middle of a wall would select
    /// nothing. Liang-Barsky, which handles both the crossing and the fully-enclosed
    /// cases in one pass.
    fn intersects_segment(&self, a: tri_doc::Point2, b: tri_doc::Point2) -> bool {
        let (x0, y0) = (a.x.as_mm_f64(), a.y.as_mm_f64());
        let (x1, y1) = (b.x.as_mm_f64(), b.y.as_mm_f64());
        let (dx, dy) = (x1 - x0, y1 - y0);

        let mut t0 = 0.0f64;
        let mut t1 = 1.0f64;
        for (p, q) in [
            (-dx, x0 - self.min_x),
            (dx, self.max_x - x0),
            (-dy, y0 - self.min_y),
            (dy, self.max_y - y0),
        ] {
            if p == 0.0 {
                // Parallel to this edge: reject only if it starts outside the slab.
                if q < 0.0 {
                    return false;
                }
                continue;
            }
            let r = q / p;
            if p < 0.0 {
                if r > t1 {
                    return false;
                }
                t0 = t0.max(r);
            } else {
                if r < t0 {
                    return false;
                }
                t1 = t1.min(r);
            }
        }
        t0 <= t1
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    Wall,
    Opening,
    Polyline,
    Annotation,
    Solid,
    Other,
}

fn kind_of(set: &tri_doc::ComponentSet) -> EntityKind {
    if set.has(&ComponentKey::WallProfile) {
        EntityKind::Wall
    } else if set.has(&ComponentKey::Opening) {
        EntityKind::Opening
    } else if set.has(&ComponentKey::Solid3d) {
        EntityKind::Solid
    } else if set.has(&ComponentKey::Polyline2d) {
        EntityKind::Polyline
    } else if set.has(&ComponentKey::Label) {
        EntityKind::Annotation
    } else {
        EntityKind::Other
    }
}

/// One entity, described compactly. Note what is *not* here: geometry. A caller that
/// needs coordinates asks `measure`, which returns numbers with provenance rather than
/// a vertex dump.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct EntitySummary {
    pub id: u64,
    pub kind: EntityKind,
    pub layer: Option<String>,
    pub label: Option<String>,
    /// The least confident provenance anywhere on this entity — what a reviewer should
    /// look at first.
    pub confidence: Option<String>,
    pub point_count: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct QueryResult {
    pub entities: Vec<EntitySummary>,
    /// How many matched in total. If this exceeds `entities.len()`, the answer was cut.
    pub total_matched: usize,
    /// True when results were dropped. A caller seeing this must narrow the query rather
    /// than paging until it has everything — that would be reassembling the document.
    pub truncated: bool,
}

/// Spatial and attribute query with a hard cap.
pub fn query_entities(
    doc: &Document,
    bbox: Option<BoxMm>,
    layer: Option<&str>,
    kind: Option<EntityKind>,
    limit: Option<usize>,
) -> QueryResult {
    let cap = limit.unwrap_or(MAX_RESULTS).min(MAX_RESULTS);
    let mut matched = 0usize;
    let mut out = Vec::new();

    for (id, set) in doc.iter_entities() {
        if let Some(k) = kind {
            if kind_of(set) != k {
                continue;
            }
        }
        let layer_name = layer_name_of(doc, set);
        if let Some(want) = layer {
            if layer_name.as_deref() != Some(want) {
                continue;
            }
        }
        if let Some(b) = bbox {
            if !touches(set, b) {
                continue;
            }
        }
        matched += 1;
        if out.len() < cap {
            out.push(summarise(id, set, layer_name));
        }
    }

    QueryResult {
        truncated: matched > out.len(),
        total_matched: matched,
        entities: out,
    }
}

fn layer_name_of(doc: &Document, set: &tri_doc::ComponentSet) -> Option<String> {
    match set.get(&ComponentKey::LayerRef) {
        Some(Component::LayerRef(l)) => doc.layers().get(*l).map(|l| l.name.clone()),
        _ => None,
    }
}

fn points_of(set: &tri_doc::ComponentSet) -> Vec<tri_doc::Point2> {
    match (
        set.get(&ComponentKey::WallProfile),
        set.get(&ComponentKey::Polyline2d),
    ) {
        (Some(Component::WallProfile(w)), _) => w.centreline.clone(),
        (_, Some(Component::Polyline2d(p))) => p.points.clone(),
        _ => Vec::new(),
    }
}

/// Does any part of this entity's geometry fall inside the box?
fn touches(set: &tri_doc::ComponentSet, b: BoxMm) -> bool {
    let pts = points_of(set);
    match pts.len() {
        0 => false,
        1 => b.contains_point(pts[0]),
        _ => pts.windows(2).any(|w| b.intersects_segment(w[0], w[1])),
    }
}

fn summarise(id: EntityId, set: &tri_doc::ComponentSet, layer: Option<String>) -> EntitySummary {
    let worst = set
        .iter()
        .flat_map(|(_, c)| c.provenance_records())
        .map(|(_, p, _)| p)
        .max();
    EntitySummary {
        id: id.raw(),
        kind: kind_of(set),
        layer,
        label: match set.get(&ComponentKey::Label) {
            Some(Component::Label(l)) => Some(l.clone()),
            _ => None,
        },
        confidence: worst.map(|p| format!("{p:?}")),
        point_count: points_of(set).len(),
    }
}

/// Aggregates for a region — counts and breakdowns, never entity lists.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct RegionDescription {
    pub entity_count: usize,
    pub by_kind: BTreeMap<String, usize>,
    pub by_layer: BTreeMap<String, usize>,
    pub by_confidence: BTreeMap<String, usize>,
    pub total_wall_length_mm: f64,
    pub extents_mm: Option<BoxMm>,
    /// The single most useful sentence for an agent deciding what to do next.
    pub headline: String,
}

pub fn describe_region(doc: &Document, bbox: Option<BoxMm>) -> RegionDescription {
    let mut d = RegionDescription {
        entity_count: 0,
        by_kind: BTreeMap::new(),
        by_layer: BTreeMap::new(),
        by_confidence: BTreeMap::new(),
        total_wall_length_mm: 0.0,
        extents_mm: None,
        headline: String::new(),
    };
    let mut min = (f64::MAX, f64::MAX);
    let mut max = (f64::MIN, f64::MIN);

    for (_, set) in doc.iter_entities() {
        if let Some(b) = bbox {
            if !touches(set, b) {
                continue;
            }
        }
        d.entity_count += 1;
        *d.by_kind.entry(format!("{:?}", kind_of(set))).or_insert(0) += 1;
        if let Some(l) = layer_name_of(doc, set) {
            *d.by_layer.entry(l).or_insert(0) += 1;
        }
        for (_, c) in set.iter() {
            for (_, p, _) in c.provenance_records() {
                *d.by_confidence.entry(format!("{p:?}")).or_insert(0) += 1;
            }
        }
        if let Some(Component::WallProfile(WallProfile { centreline, .. })) =
            set.get(&ComponentKey::WallProfile)
        {
            d.total_wall_length_mm +=
                tri_doc::validate::centreline_length_um(centreline) as f64 / 1000.0;
        }
        for p in points_of(set) {
            let (x, y) = (p.x.as_mm_f64(), p.y.as_mm_f64());
            min = (min.0.min(x), min.1.min(y));
            max = (max.0.max(x), max.1.max(y));
        }
    }

    if d.entity_count > 0 && min.0 <= max.0 {
        d.extents_mm = Some(BoxMm {
            min_x: min.0,
            min_y: min.1,
            max_x: max.0,
            max_y: max.1,
        });
    }

    let assumed = d.by_confidence.get("Assumed").copied().unwrap_or(0);
    d.headline = format!(
        "{} entities, {:.1}m of wall, {} value(s) marked Assumed and needing review",
        d.entity_count,
        d.total_wall_length_mm / 1000.0,
        assumed
    );
    d
}

/// A measurement, with the provenance of everything that went into it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct Measurement {
    pub entity: u64,
    pub kind: EntityKind,
    pub length_mm: Option<f64>,
    pub area_m2: Option<f64>,
    pub volume_m3: Option<f64>,
    pub height_mm: Option<f64>,
    pub thickness_mm: Option<f64>,
    /// Field → (provenance, reason). This is why a measurement is trustworthy or not,
    /// and it travels with the number rather than being available on request.
    pub provenance: BTreeMap<String, String>,
    /// True if any input was `Assumed`. The one field a reviewer must read.
    pub contains_assumptions: bool,
}

pub fn measure(doc: &Document, ids: &[u64]) -> Vec<Measurement> {
    ids.iter()
        .filter_map(|raw| {
            let id = EntityId::from_raw(*raw);
            let set = doc.components(id)?;
            let mut m = Measurement {
                entity: *raw,
                kind: kind_of(set),
                length_mm: None,
                area_m2: None,
                volume_m3: None,
                height_mm: None,
                thickness_mm: None,
                provenance: BTreeMap::new(),
                contains_assumptions: false,
            };

            for (_, c) in set.iter() {
                for (field, prov, reason) in c.provenance_records() {
                    m.provenance
                        .insert(field.to_string(), format!("{prov:?}: {reason}"));
                    if prov == Provenance::Assumed {
                        m.contains_assumptions = true;
                    }
                }
            }

            if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
                let len = tri_doc::validate::centreline_length_um(&w.centreline) as f64 / 1000.0;
                m.length_mm = Some(len);
                m.height_mm = Some(w.height.get().as_mm_f64());
                m.thickness_mm = Some(w.thickness.get().as_mm_f64());
                m.volume_m3 = Some(
                    (len / 1000.0)
                        * (w.thickness.get().as_mm_f64() / 1000.0)
                        * (w.height.get().as_mm_f64() / 1000.0),
                );
                m.area_m2 = Some((len / 1000.0) * (w.height.get().as_mm_f64() / 1000.0));
            }

            if let Some(Component::Polyline2d(p)) = set.get(&ComponentKey::Polyline2d) {
                m.length_mm =
                    Some(tri_doc::validate::centreline_length_um(&p.points) as f64 / 1000.0);
            }

            Some(m)
        })
        .collect()
}
