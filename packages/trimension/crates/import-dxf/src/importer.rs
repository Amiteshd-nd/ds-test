//! The format-agnostic import seam.
//!
//! DWG (PRD §4.6) slots in behind this trait, server-side only, without `doc` learning
//! that a second format exists.

use tri_doc::Op;

/// The facts a classifier needs about one source entity, independent of format.
///
/// This is deliberately a flat struct rather than a DXF type: it is the boundary that
/// keeps `dxf` from leaking into the rule engine, and it is what a future DWG importer
/// would populate instead.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct EntityFacts {
    pub layer: String,
    pub block_name: Option<String>,
    pub line_type: String,
    pub line_weight: i16,
    pub is_text: bool,
    pub is_block_reference: bool,
    pub is_arc_or_curve: bool,
    pub closed: bool,
    pub point_count: usize,
    /// Total length in µm, already unit-scaled.
    pub length_um: i64,
    /// A polyline's constant width, in µm, when the file states one.
    ///
    /// DXF carries this on `LWPOLYLINE`, and drafters use it for exactly what it looks
    /// like: a line that represents something of a known thickness. When it is present
    /// the wall thickness is *read* rather than inferred from the gap between two
    /// parallel lines, which is the difference between `Measured` and `Inferred`.
    pub constant_width_um: i64,
}

pub trait Importer {
    type Error;

    fn format(&self) -> &'static str;

    /// Phase A: raw source entities only, no interpretation (invariant **I8**).
    fn read_source(&self, bytes: &[u8], file_name: &str) -> Result<SourceLoad, Self::Error>;
}

/// The result of phase A: ops that populate the source schema, plus the per-entity facts
/// phase B will classify. Nothing here is a native object yet.
#[derive(Clone, Debug)]
pub struct SourceLoad {
    /// `AddSourceEntity` and `RecordImport` ops, in order. Applied as a commit — the
    /// import path has no exemption from I1.
    pub ops: Vec<Op>,
    /// Parallel to the `AddSourceEntity` ops, in the same order.
    pub facts: Vec<EntityFacts>,
    /// Geometry recovered from each entity, in document µm, for phase B.
    pub geometry: Vec<Geometry>,
    /// How the drawing's units were resolved. Never silently applied.
    pub unit_scale: tri_doc::Tracked<i64>,
    /// Layer names in the source file, in first-seen order.
    pub layers: Vec<SourceLayer>,
}

impl Default for SourceLoad {
    fn default() -> Self {
        SourceLoad {
            ops: Vec::new(),
            facts: Vec::new(),
            geometry: Vec::new(),
            // A default that is honest about being a default (I4).
            unit_scale: tri_doc::Tracked::assumed(1_000, "no import performed yet"),
            layers: Vec::new(),
        }
    }
}

#[derive(Clone, PartialEq, Debug)]
pub struct SourceLayer {
    pub name: String,
    pub color: [u8; 4],
    pub visible: bool,
}

/// Geometry as recovered from the source, in µm.
#[derive(Clone, PartialEq, Debug)]
pub enum Geometry {
    Polyline {
        points: Vec<tri_doc::Point2>,
        closed: bool,
    },
    /// Arcs are tessellated at import; `solid` never sees a curve. See `dxf_importer`
    /// for why, and what it costs.
    Arc {
        points: Vec<tri_doc::Point2>,
    },
    Insert {
        at: tri_doc::Point2,
        rotation_mdeg: i32,
        block: String,
    },
    Text {
        at: tri_doc::Point2,
        value: String,
    },
    None,
}

impl Geometry {
    pub fn points(&self) -> &[tri_doc::Point2] {
        match self {
            Geometry::Polyline { points, .. } | Geometry::Arc { points } => points,
            _ => &[],
        }
    }
}
