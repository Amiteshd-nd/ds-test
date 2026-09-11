//! R-tree spatial index. Used by `query_entities` (invariant **I5**: spatial subsets, not
//! whole-document dumps) and by wall pairing to avoid an O(n²) sweep.

use rstar::{RTreeObject, AABB};
use tri_doc::{EntityId, Point2};

/// An indexed entity: its id and its bounding box in µm.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Indexed {
    pub id: EntityId,
    pub min: [i64; 2],
    pub max: [i64; 2],
}

impl Indexed {
    pub fn from_points(id: EntityId, points: &[Point2]) -> Option<Indexed> {
        let first = points.first()?;
        let mut min = [first.x.as_um(), first.y.as_um()];
        let mut max = min;
        for p in points {
            min[0] = min[0].min(p.x.as_um());
            min[1] = min[1].min(p.y.as_um());
            max[0] = max[0].max(p.x.as_um());
            max[1] = max[1].max(p.y.as_um());
        }
        Some(Indexed { id, min, max })
    }
}

impl RTreeObject for Indexed {
    type Envelope = AABB<[i64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners(self.min, self.max)
    }
}

pub type SpatialIndex = rstar::RTree<Indexed>;

pub fn build(items: Vec<Indexed>) -> SpatialIndex {
    rstar::RTree::bulk_load(items)
}

/// Everything whose bounding box intersects the query box. Results are sorted by id so
/// that a query returns the same list every time — an agent comparing two queries needs
/// stable ordering.
pub fn in_box(index: &SpatialIndex, min: [i64; 2], max: [i64; 2]) -> Vec<EntityId> {
    let mut v: Vec<EntityId> = index
        .locate_in_envelope_intersecting(AABB::from_corners(min, max))
        .map(|i| i.id)
        .collect();
    v.sort_unstable();
    v
}
