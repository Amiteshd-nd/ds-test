//! Writing the file.

use crate::scheme;
use dxf::entities::{DimensionBase, Entity, EntityType, Line, LwPolyline, RotatedDimension, Text};
use dxf::enums::Units as DxfUnits;
use dxf::tables::Layer;
use dxf::{Color, Drawing, LwPolylineVertex, Point as DxfPoint};
use tri_doc::component::{OpeningKind, Polyline2d, WallProfile};
use tri_doc::{Component, ComponentKey, Document, Length, Point2};
use tri_params::LayerScheme;

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("the document has no parameter set, so there is no layer scheme to export with")]
    NoParameters,
    #[error("could not write the DXF: {0}")]
    Write(String),
}

/// What went into the file, for the caller to report.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ExportStats {
    pub walls: usize,
    pub openings: usize,
    pub rooms: usize,
    pub labels: usize,
    pub dimensions: usize,
}

impl ExportStats {
    pub fn summary(&self) -> String {
        format!(
            "{} walls, {} openings, {} rooms, {} labels, {} dimensions",
            self.walls, self.openings, self.rooms, self.labels, self.dimensions
        )
    }
}

/// Plan scale the text is sized for. 1:100 is the usual scale for a residential plan.
const SCALE_DENOMINATOR: i64 = 100;

/// Export a document to DXF bytes.
pub fn export(doc: &Document) -> Result<(Vec<u8>, ExportStats), ExportError> {
    let (_, params) = tri_params::component::find(doc).ok_or(ExportError::NoParameters)?;
    let layers = params.layers.value().clone();

    let mut drawing = Drawing::new();
    let mut stats = ExportStats::default();

    // Target R2000, not the crate's R12 default.
    //
    // This is not a preference. `Drawing::new()` starts at AC1009 (R12), which has
    // neither `LWPOLYLINE` nor `$INSUNITS` — and the writer drops entities the target
    // version cannot hold *without an error*. The first version of this exporter produced
    // a 10 KB file containing twelve text labels and not one wall, and reported success.
    //
    // R2000 rather than something newer because this is an exchange format: it is the
    // oldest version that carries everything we need, so it opens in the widest range of
    // software an architect might actually have.
    drawing.header.version = dxf::enums::AcadVersion::R2000;

    // Units, stated explicitly.
    //
    // The importer's own heuristic exists because so many files leave this at Unitless
    // and leave the reader to guess from the extents. Writing it is one line and removes
    // a whole class of "why is the building 8mm wide" support conversation.
    drawing.header.default_drawing_units = DxfUnits::Millimeters;

    for name in layers.all() {
        let mut layer = Layer {
            name: name.to_string(),
            ..Default::default()
        };
        layer.color = Color::from_index(scheme::colour_for(&layers, name) as u8);
        drawing.add_layer(layer);
    }

    walls(doc, &layers, &mut drawing, &mut stats);
    openings(doc, &layers, &mut drawing, &mut stats);
    rooms(doc, &layers, &mut drawing, &mut stats);
    overall_dimensions(doc, &layers, &mut drawing, &mut stats);

    let mut bytes = Vec::new();
    drawing
        .save(&mut bytes)
        .map_err(|e| ExportError::Write(format!("{e:?}")))?;
    Ok((bytes, stats))
}

/// Millimetres. The document stores micrometres; DXF carries plain numbers and the
/// `$INSUNITS` header says what they mean.
fn mm(l: Length) -> f64 {
    l.as_mm_f64()
}

fn xy(p: Point2) -> (f64, f64) {
    (mm(p.x), mm(p.y))
}

fn on_layer(mut e: Entity, layer: &str) -> Entity {
    e.common.layer = layer.to_string();
    e
}

fn polyline(points: &[Point2], closed: bool) -> LwPolyline {
    width_polyline(points, closed, 0.0)
}

fn width_polyline(points: &[Point2], closed: bool, width_mm: f64) -> LwPolyline {
    LwPolyline {
        constant_width: width_mm,
        flags: i32::from(closed),
        vertices: points
            .iter()
            .map(|p| {
                let (x, y) = xy(*p);
                LwPolylineVertex {
                    x,
                    y,
                    ..Default::default()
                }
            })
            .collect(),
        ..Default::default()
    }
}

/// Walls, twice over.
///
/// The closed outline is what an architect works with — it hatches, it offsets, it reads
/// as a wall. The centreline is what a *reader* needs: our own importer reconstructs a
/// wall by pairing parallel lines, and a single closed rectangle gives it nothing to
/// pair, so a file with outlines alone loses every thickness on the way back in. Both
/// layers, and the round-trip test checks both facts.
fn walls(doc: &Document, layers: &LayerScheme, drawing: &mut Drawing, stats: &mut ExportStats) {
    for (_, set) in doc.iter_with(ComponentKey::WallProfile) {
        let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
            continue;
        };

        // The wall: its centreline, carrying its thickness as the polyline's constant
        // width. Renders as a solid band in any viewer, and reads back exactly — the
        // thickness is stated in the file rather than inferred from the gap between two
        // lines, so a round trip returns `Measured` rather than a default.
        drawing.add_entity(on_layer(
            Entity::new(EntityType::LwPolyline(width_polyline(
                &w.centreline,
                false,
                mm(w.thickness.get()),
            ))),
            &layers.walls,
        ));

        // The same wall again as a closed outline, for hatching. On its own layer so
        // re-import does not count every wall twice.
        if let Some(profile) = tri_geom2d::profile::build(&w.centreline, w.thickness.get()) {
            drawing.add_entity(on_layer(
                Entity::new(EntityType::LwPolyline(polyline(&profile.outline, true))),
                &layers.wall_hatch,
            ));
        }
        stats.walls += 1;
    }
}

/// Openings, as a leaf line across the reveal.
///
/// Not a block reference. A block is the right long-term answer — it is how a door
/// schedule works and how the importer's block-name rule classifies one — but a block
/// definition that is a single line is a block with nothing in it, and inventing a door
/// symbol here would be inventing a drawing convention this tool has not earned. A line
/// on the door layer is honest and reads correctly.
fn openings(doc: &Document, layers: &LayerScheme, drawing: &mut Drawing, stats: &mut ExportStats) {
    let walls: Vec<(tri_doc::EntityId, WallProfile)> = doc
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(id, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => Some((id, w.clone())),
            _ => None,
        })
        .collect();

    for (_, set) in doc.iter_with(ComponentKey::Opening) {
        let Some(Component::Opening(o)) = set.get(&ComponentKey::Opening) else {
            continue;
        };
        let Some((_, host)) = walls.iter().find(|(id, _)| *id == o.host) else {
            continue;
        };
        let Some((a, b)) = span_along(&host.centreline, o.position, o.width.get()) else {
            continue;
        };

        let layer = match o.kind {
            OpeningKind::Window => &layers.windows,
            _ => &layers.doors,
        };
        let (x1, y1) = xy(a);
        let (x2, y2) = xy(b);
        drawing.add_entity(on_layer(
            Entity::new(EntityType::Line(Line {
                p1: DxfPoint::new(x1, y1, 0.0),
                p2: DxfPoint::new(x2, y2, 0.0),
                ..Default::default()
            })),
            layer,
        ));
        stats.openings += 1;
    }
}

/// The two ends of an opening, measured along a centreline.
fn span_along(centreline: &[Point2], position: Length, width: Length) -> Option<(Point2, Point2)> {
    let half = width.as_um() / 2;
    Some((
        point_at(centreline, position.as_um() - half)?,
        point_at(centreline, position.as_um() + half)?,
    ))
}

fn point_at(centreline: &[Point2], distance_um: i64) -> Option<Point2> {
    let mut travelled = 0i64;
    for seg in centreline.windows(2) {
        let len = tri_doc::validate::isqrt_i128(seg[0].dist_sq(seg[1])) as i64;
        if len == 0 {
            continue;
        }
        if distance_um <= travelled + len {
            let t = (distance_um - travelled).clamp(0, len) as i128;
            let dx = (seg[1].x.as_um() - seg[0].x.as_um()) as i128;
            let dy = (seg[1].y.as_um() - seg[0].y.as_um()) as i128;
            return Some(Point2::new(
                Length::from_um(seg[0].x.as_um() + (dx * t / len as i128) as i64),
                Length::from_um(seg[0].y.as_um() + (dy * t / len as i128) as i64),
            ));
        }
        travelled += len;
    }
    centreline.last().copied()
}

/// Room outlines, names and areas.
///
/// The area is written next to the name because it is the number an architect checks
/// first, and making them compute it from a boundary they have to select is a small
/// discourtesy that adds up.
fn rooms(doc: &Document, layers: &LayerScheme, drawing: &mut Drawing, stats: &mut ExportStats) {
    let height = scheme::text_height_mm(SCALE_DENOMINATOR);
    let by_entity: std::collections::BTreeMap<_, _> = tri_rules::room::all(doc)
        .into_iter()
        .map(|r| (r.entity, r))
        .collect();

    for (id, set) in doc.iter_entities() {
        let Some(room) = by_entity.get(&id) else {
            continue;
        };
        if let Some(Component::Polyline2d(Polyline2d { points, .. })) =
            set.get(&ComponentKey::Polyline2d)
        {
            drawing.add_entity(on_layer(
                Entity::new(EntityType::LwPolyline(polyline(points, true))),
                &layers.furniture,
            ));
            stats.rooms += 1;

            if let Some(centre) = centroid(points) {
                let (cx, cy) = xy(centre);
                for (offset, value) in [
                    (height * 0.7, room.name.clone()),
                    (
                        -height * 0.7,
                        format!("{:.2} m2", room.area_mm2 as f64 / 1_000_000.0),
                    ),
                ] {
                    drawing.add_entity(on_layer(
                        Entity::new(EntityType::Text(Text {
                            location: DxfPoint::new(cx, cy + offset, 0.0),
                            text_height: height,
                            value,
                            horizontal_text_justification:
                                dxf::enums::HorizontalTextJustification::Center,
                            second_alignment_point: DxfPoint::new(cx, cy + offset, 0.0),
                            ..Default::default()
                        })),
                        &layers.text,
                    ));
                    stats.labels += 1;
                }
            }
        }
    }
}

fn centroid(points: &[Point2]) -> Option<Point2> {
    if points.is_empty() {
        return None;
    }
    let n = points.len() as i64;
    Some(Point2::new(
        Length::from_um(points.iter().map(|p| p.x.as_um()).sum::<i64>() / n),
        Length::from_um(points.iter().map(|p| p.y.as_um()).sum::<i64>() / n),
    ))
}

/// Overall dimensions across the building, on their own layer.
///
/// Associative `DIMENSION` entities rather than lines and text pretending to be
/// dimensions: an architect who stretches a wall expects the number to follow, and an
/// exploded dimension silently stops being true the moment the drawing is edited. Two of
/// them — overall width and overall depth — because that is what a schematic plan
/// carries, and inventing a full dimension string here would be inventing a drafting
/// convention this tool has not earned.
fn overall_dimensions(
    doc: &Document,
    layers: &LayerScheme,
    drawing: &mut Drawing,
    stats: &mut ExportStats,
) {
    let Some(bounds) = wall_bounds(doc) else {
        return;
    };
    let (min, max) = bounds;
    // Offset the dimension line clear of the building.
    let gap = scheme::text_height_mm(SCALE_DENOMINATOR) * 3.0;

    let width = mm(Length::from_um(max.0 - min.0));
    let depth = mm(Length::from_um(max.1 - min.1));
    let (x0, y0) = (mm(Length::from_um(min.0)), mm(Length::from_um(min.1)));
    let (x1, y1) = (mm(Length::from_um(max.0)), mm(Length::from_um(max.1)));

    // (first point, second point, dimension-line point, rotation, measurement)
    let runs = [
        (
            DxfPoint::new(x0, y0, 0.0),
            DxfPoint::new(x1, y0, 0.0),
            DxfPoint::new((x0 + x1) / 2.0, y0 - gap, 0.0),
            0.0,
            width,
        ),
        (
            DxfPoint::new(x1, y0, 0.0),
            DxfPoint::new(x1, y1, 0.0),
            DxfPoint::new(x1 + gap, (y0 + y1) / 2.0, 0.0),
            90.0,
            depth,
        ),
    ];

    for (p1, p2, line_point, rotation, measurement) in runs {
        let dimension = RotatedDimension {
            dimension_base: DimensionBase {
                definition_point_1: line_point.clone(),
                text_mid_point: line_point.clone(),
                actual_measurement: measurement,
                // Empty means "show the measured value", which is what keeps it
                // associative. Writing the number here would freeze it.
                text: String::new(),
                dimension_style_name: "STANDARD".to_string(),
                ..Default::default()
            },
            insertion_point: DxfPoint::new(0.0, 0.0, 0.0),
            definition_point_2: p1,
            definition_point_3: p2,
            rotation_angle: rotation,
            extension_line_angle: 0.0,
        };
        drawing.add_entity(on_layer(
            Entity::new(EntityType::RotatedDimension(dimension)),
            &layers.dimensions,
        ));
        stats.dimensions += 1;
    }
}

/// Extents of the wall centrelines, in µm.
fn wall_bounds(doc: &Document) -> Option<((i64, i64), (i64, i64))> {
    let mut min = (i64::MAX, i64::MAX);
    let mut max = (i64::MIN, i64::MIN);
    let mut any = false;
    for (_, set) in doc.iter_with(ComponentKey::WallProfile) {
        let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
            continue;
        };
        for p in &w.centreline {
            any = true;
            min = (min.0.min(p.x.as_um()), min.1.min(p.y.as_um()));
            max = (max.0.max(p.x.as_um()), max.1.max(p.y.as_um()));
        }
    }
    any.then_some((min, max))
}
