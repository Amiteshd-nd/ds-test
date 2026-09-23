//! Phase A of the DXF import (invariant **I8**): lossless and additive.
//!
//! Nothing here interprets. Every DXF entity becomes a `SourceEntity` carrying its own
//! type name, its own layer string and its own attributes, and every one of them keeps
//! its DXF handle so a re-import can diff against it rather than against derived
//! geometry.
//!
//! # Arcs
//! Arcs and circles are tessellated to polylines *at this boundary*, at a chord
//! tolerance derived from the healing tolerance. The exact arc parameters stay in the
//! source schema, so nothing is lost and a later kernel can recover them — but `geom2d`
//! and `solid` never have to know a curve exists, which is what keeps them from needing
//! NURBS (PRD §4.5, "do not add OCCT").

use crate::importer::{EntityFacts, Geometry, Importer, SourceLayer, SourceLoad};
use crate::units;
use dxf::entities::EntityType;
use dxf::Drawing;
use std::collections::BTreeMap;
use tri_doc::component::CanonicalValue;
use tri_doc::source::{ImportRecord, SourceEntity};
use tri_doc::{Length, Op, Point2};

pub struct DxfImporter {
    /// Maximum chord deviation when tessellating arcs, in millimetres.
    pub arc_tolerance_mm: i64,
}

impl Default for DxfImporter {
    fn default() -> Self {
        DxfImporter {
            arc_tolerance_mm: 2,
        }
    }
}

#[derive(Debug)]
pub enum DxfError {
    Parse(String),
}

impl std::fmt::Display for DxfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DxfError::Parse(m) => write!(f, "could not read DXF: {m}"),
        }
    }
}

impl std::error::Error for DxfError {}

impl Importer for DxfImporter {
    type Error = DxfError;

    fn format(&self) -> &'static str {
        "DXF"
    }

    fn read_source(&self, bytes: &[u8], file_name: &str) -> Result<SourceLoad, DxfError> {
        let mut cursor = std::io::BufReader::new(std::io::Cursor::new(bytes));
        let drawing = Drawing::load(&mut cursor).map_err(|e| DxfError::Parse(format!("{e:?}")))?;

        // Units first: every coordinate below depends on the answer, and the answer is
        // itself a provenance-bearing value rather than a constant.
        let max_extent = max_abs_coordinate(&drawing);
        let unit_scale = units::resolve(drawing.header.default_drawing_units, max_extent);
        let scale = *unit_scale.value();

        let mut load = SourceLoad {
            unit_scale: unit_scale.clone(),
            ..Default::default()
        };

        for l in drawing.layers() {
            load.layers.push(SourceLayer {
                name: l.name.clone(),
                // DXF stores an ACI palette index, not RGB. Resolving the palette is a
                // renderer concern (M3); the index is preserved verbatim here so nothing
                // is lost, which is what I8 asks for.
                color: aci_to_rgba(l.color.index().unwrap_or(7)),
                visible: l.is_layer_on,
            });
        }

        let mut count = 0usize;
        for e in drawing.entities() {
            let Some((kind, attributes, geometry, mut facts)) = self.read_entity(e, scale) else {
                continue;
            };

            facts.layer = e.common.layer.clone();
            facts.line_type = e.common.line_type_name.clone();
            facts.line_weight = e.common.lineweight_enum_value;

            load.ops.push(Op::AddSourceEntity {
                entity: SourceEntity {
                    kind: kind.to_string(),
                    layer: e.common.layer.clone(),
                    handle: handle_string(&e.common.handle),
                    attributes,
                },
            });
            load.facts.push(facts);
            load.geometry.push(geometry);
            count += 1;
        }

        load.ops.push(Op::RecordImport {
            record: ImportRecord {
                file_name: file_name.to_string(),
                format: "DXF".into(),
                unit_scale,
                entity_count: count,
            },
        });

        Ok(load)
    }
}

impl DxfImporter {
    /// Returns `None` for entity types this importer does not read. They are skipped
    /// rather than silently coerced — an unread type shows up as a count mismatch
    /// against the file, which is a visible failure rather than a wrong model.
    fn read_entity(
        &self,
        e: &dxf::entities::Entity,
        scale: i64,
    ) -> Option<(
        &'static str,
        BTreeMap<String, CanonicalValue>,
        Geometry,
        EntityFacts,
    )> {
        let mut attrs = BTreeMap::new();
        let mut facts = EntityFacts::default();

        let (kind, geometry) = match &e.specific {
            EntityType::Line(l) => {
                let pts = vec![pt(l.p1.x, l.p1.y, scale), pt(l.p2.x, l.p2.y, scale)];
                attrs.insert("x1".into(), CanonicalValue::Length(pts[0].x));
                attrs.insert("y1".into(), CanonicalValue::Length(pts[0].y));
                attrs.insert("x2".into(), CanonicalValue::Length(pts[1].x));
                attrs.insert("y2".into(), CanonicalValue::Length(pts[1].y));
                facts.point_count = 2;
                (
                    "LINE",
                    Geometry::Polyline {
                        points: pts,
                        closed: false,
                    },
                )
            }

            EntityType::LwPolyline(p) => {
                let closed = p.flags & 1 == 1;
                let points: Vec<Point2> = p.vertices.iter().map(|v| pt(v.x, v.y, scale)).collect();
                attrs.insert("closed".into(), CanonicalValue::Bool(closed));
                attrs.insert(
                    "vertex_count".into(),
                    CanonicalValue::Int(points.len() as i64),
                );
                // Bulges encode arc segments. Recorded so nothing is lost, but a bulged
                // polyline is flagged as curved so the classifier can see it.
                let bulged = p.vertices.iter().any(|v| v.bulge.abs() > 1e-9);
                attrs.insert("has_bulge".into(), CanonicalValue::Bool(bulged));
                facts.closed = closed;
                facts.point_count = points.len();
                facts.is_arc_or_curve = bulged;
                facts.constant_width_um = units::to_um(p.constant_width, scale);
                attrs.insert(
                    "constant_width_um".into(),
                    CanonicalValue::Int(facts.constant_width_um),
                );
                ("LWPOLYLINE", Geometry::Polyline { points, closed })
            }

            EntityType::Arc(a) => {
                let points = self.tessellate_arc(
                    pt(a.center.x, a.center.y, scale),
                    units::to_um(a.radius, scale),
                    a.start_angle,
                    a.end_angle,
                );
                attrs.insert(
                    "radius_um".into(),
                    CanonicalValue::Int(units::to_um(a.radius, scale)),
                );
                attrs.insert(
                    "start_angle_mdeg".into(),
                    CanonicalValue::Int((a.start_angle * 1000.0).round() as i64),
                );
                attrs.insert(
                    "end_angle_mdeg".into(),
                    CanonicalValue::Int((a.end_angle * 1000.0).round() as i64),
                );
                facts.is_arc_or_curve = true;
                facts.point_count = points.len();
                ("ARC", Geometry::Arc { points })
            }

            EntityType::Circle(c) => {
                let points = self.tessellate_arc(
                    pt(c.center.x, c.center.y, scale),
                    units::to_um(c.radius, scale),
                    0.0,
                    360.0,
                );
                attrs.insert(
                    "radius_um".into(),
                    CanonicalValue::Int(units::to_um(c.radius, scale)),
                );
                facts.is_arc_or_curve = true;
                facts.closed = true;
                facts.point_count = points.len();
                ("CIRCLE", Geometry::Arc { points })
            }

            EntityType::Insert(i) => {
                let at = pt(i.location.x, i.location.y, scale);
                attrs.insert("block".into(), CanonicalValue::Text(i.name.clone()));
                attrs.insert("x".into(), CanonicalValue::Length(at.x));
                attrs.insert("y".into(), CanonicalValue::Length(at.y));
                attrs.insert(
                    "rotation_mdeg".into(),
                    CanonicalValue::Int((i.rotation * 1000.0).round() as i64),
                );
                facts.is_block_reference = true;
                facts.block_name = Some(i.name.clone());
                (
                    "INSERT",
                    Geometry::Insert {
                        at,
                        rotation_mdeg: (i.rotation * 1000.0).round() as i32,
                        block: i.name.clone(),
                    },
                )
            }

            EntityType::Text(t) => {
                let at = pt(t.location.x, t.location.y, scale);
                attrs.insert("value".into(), CanonicalValue::Text(t.value.clone()));
                attrs.insert("x".into(), CanonicalValue::Length(at.x));
                attrs.insert("y".into(), CanonicalValue::Length(at.y));
                facts.is_text = true;
                (
                    "TEXT",
                    Geometry::Text {
                        at,
                        value: t.value.clone(),
                    },
                )
            }

            EntityType::MText(t) => {
                let at = pt(t.insertion_point.x, t.insertion_point.y, scale);
                attrs.insert("value".into(), CanonicalValue::Text(t.text.clone()));
                facts.is_text = true;
                (
                    "MTEXT",
                    Geometry::Text {
                        at,
                        value: t.text.clone(),
                    },
                )
            }

            _ => return None,
        };

        facts.length_um = polyline_length_um(geometry.points());
        Some((kind, attrs, geometry, facts))
    }

    /// Chord count from the sagitta formula, so the tolerance means what it says
    /// regardless of radius.
    fn tessellate_arc(
        &self,
        centre: Point2,
        radius_um: i64,
        start_deg: f64,
        end_deg: f64,
    ) -> Vec<Point2> {
        if radius_um <= 0 {
            return vec![centre];
        }
        let tol_um = (self.arc_tolerance_mm * 1_000).max(1) as f64;
        let r = radius_um as f64;
        let sweep = {
            let mut s = end_deg - start_deg;
            while s <= 0.0 {
                s += 360.0;
            }
            s.min(360.0)
        };
        // max chord angle where sagitta <= tol
        let max_step = if tol_um >= r {
            std::f64::consts::PI
        } else {
            2.0 * (1.0 - tol_um / r).clamp(-1.0, 1.0).acos()
        };
        let steps = ((sweep.to_radians() / max_step).ceil() as usize).clamp(2, 512);

        (0..=steps)
            .map(|i| {
                let a = (start_deg + sweep * (i as f64 / steps as f64)).to_radians();
                Point2::new(
                    Length::from_um(centre.x.as_um() + (r * a.cos()).round() as i64),
                    Length::from_um(centre.y.as_um() + (r * a.sin()).round() as i64),
                )
            })
            .collect()
    }
}

/// Minimal AutoCAD Color Index → RGBA. Only the first 9 indices are fixed by the
/// standard; beyond that the palette is a lookup table that belongs in `render`, so
/// anything higher falls back to foreground grey rather than inventing a colour.
fn aci_to_rgba(index: u8) -> [u8; 4] {
    match index {
        1 => [255, 0, 0, 255],
        2 => [255, 255, 0, 255],
        3 => [0, 255, 0, 255],
        4 => [0, 255, 255, 255],
        5 => [0, 0, 255, 255],
        6 => [255, 0, 255, 255],
        7 => [255, 255, 255, 255],
        8 => [128, 128, 128, 255],
        9 => [192, 192, 192, 255],
        _ => [180, 180, 180, 255],
    }
}

fn pt(x: f64, y: f64, scale: i64) -> Point2 {
    Point2::new(
        Length::from_um(units::to_um(x, scale)),
        Length::from_um(units::to_um(y, scale)),
    )
}

fn polyline_length_um(points: &[Point2]) -> i64 {
    tri_doc::validate::centreline_length_um(points)
}

fn handle_string(h: &dxf::Handle) -> Option<String> {
    if h.is_empty() {
        None
    } else {
        Some(format!("{:X}", h.0))
    }
}

/// Largest absolute coordinate in the drawing, for the unit heuristic.
fn max_abs_coordinate(drawing: &Drawing) -> f64 {
    let mut m: f64 = 0.0;
    let mut take = |x: f64, y: f64| {
        m = m.max(x.abs()).max(y.abs());
    };
    for e in drawing.entities() {
        match &e.specific {
            EntityType::Line(l) => {
                take(l.p1.x, l.p1.y);
                take(l.p2.x, l.p2.y);
            }
            EntityType::LwPolyline(p) => {
                for v in &p.vertices {
                    take(v.x, v.y);
                }
            }
            EntityType::Arc(a) => take(a.center.x + a.radius, a.center.y + a.radius),
            EntityType::Circle(c) => take(c.center.x + c.radius, c.center.y + c.radius),
            EntityType::Insert(i) => take(i.location.x, i.location.y),
            EntityType::Text(t) => take(t.location.x, t.location.y),
            _ => {}
        }
    }
    m
}
