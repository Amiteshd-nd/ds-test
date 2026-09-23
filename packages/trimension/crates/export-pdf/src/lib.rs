//! `tri-export-pdf` — a printable plan sheet.
//!
//! The PRD's second output, after DXF: "A PDF plan sheet with title block covers client
//! conversations." The done-when is "a sheet prints at correct scale with dimensions
//! legible", and both halves are literal. The drawing is at 1:50, 1:100 or another scale
//! from a fixed list, never scaled to fit, so a scale rule works on the paper. Text is
//! 2.5mm on paper at every scale, which is the drafting convention for a reason.
//!
//! # Where the geometry comes from
//! The wall faces are `tri_render::scene::wall_faces` — the same function the canvas
//! draws with. A sheet whose walls sat a few millimetres off the screen's would be wrong
//! in the one way an architect checks, and nothing else in the system would catch it.
//! Room outlines, labels and the compliance summary come from the document, because they
//! are text and the renderer has none.

pub mod pdf;
pub mod sheet;

use pdf::Page;
use sheet::{Fit, Paper, TitleBlock};
use tri_doc::component::{Component, ComponentKey};
use tri_doc::{Document, Point2};

pub use sheet::{choose, SCALES};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum SheetError {
    #[error("the document has no geometry to draw")]
    Empty,
}

/// What was produced, for the caller to report.
#[derive(Clone, Debug, PartialEq)]
pub struct SheetStats {
    pub paper: &'static str,
    pub scale_denominator: i64,
    pub walls: usize,
    pub rooms: usize,
    pub bytes: usize,
}

impl SheetStats {
    pub fn summary(&self) -> String {
        format!(
            "{} at 1:{} — {} walls, {} rooms, {:.0} KB",
            self.paper,
            self.scale_denominator,
            self.walls,
            self.rooms,
            self.bytes as f64 / 1024.0
        )
    }
}

/// Ink. Grey rather than black for everything but the fabric, the way a plot style would.
const WALL: [f64; 3] = [0.0, 0.0, 0.0];
const ROOM: [f64; 3] = [0.55, 0.55, 0.58];
const DIM: [f64; 3] = [0.25, 0.25, 0.3];
const FRAME: [f64; 3] = [0.4, 0.4, 0.44];
/// Text height on paper. 2.5mm is the smallest a drawing office will accept.
const TEXT_MM: f64 = 2.5;
const SMALL_MM: f64 = 1.9;

/// Draw the sheet.
pub fn export(doc: &Document, title: TitleBlock) -> Result<(Vec<u8>, SheetStats), SheetError> {
    let bounds = plan_bounds(doc).ok_or(SheetError::Empty)?;
    let (min_x, min_y, max_x, max_y) = bounds;
    let fit = choose(
        max_x - min_x,
        max_y - min_y,
        &[Paper::A4Landscape, Paper::A3Landscape, Paper::A2Landscape],
    );
    let (pw, ph) = fit.paper.size_mm();
    let mut page = Page::new(pw, ph);

    // Centre the drawing in the frame. `to_paper` is the only place document coordinates
    // become paper coordinates, so the scale is applied exactly once.
    let (fx, fy, fw, fh) = fit.frame();
    let k = fit.paper_per_um();
    let draw_w = (max_x - min_x) as f64 * k;
    let draw_h = (max_y - min_y) as f64 * k;
    let ox = fx + (fw - draw_w) / 2.0;
    let oy = fy + (fh - draw_h) / 2.0;
    let to_paper = |p: Point2| -> (f64, f64) {
        (
            ox + (p.x.as_um() - min_x) as f64 * k,
            oy + (p.y.as_um() - min_y) as f64 * k,
        )
    };

    // --- rooms, under the walls ------------------------------------------------
    let mut rooms = 0;
    page.pen(ROOM, 0.13);
    for (_, set) in doc.iter_with(ComponentKey::Polyline2d) {
        let Some(Component::Polyline2d(pl)) = set.get(&ComponentKey::Polyline2d) else {
            continue;
        };
        if set
            .get(&ComponentKey::Custom(tri_rules::ROOM_TYPE_NAME.to_string()))
            .is_none()
        {
            continue;
        }
        rooms += 1;
        let pts: Vec<(f64, f64)> = pl.points.iter().map(|p| to_paper(*p)).collect();
        page.polyline(&pts, pl.closed);
    }

    // --- walls -----------------------------------------------------------------
    let mut walls = 0;
    page.pen(WALL, 0.25);
    for (_, set) in doc.iter_with(ComponentKey::WallProfile) {
        let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
            continue;
        };
        walls += 1;
        let (left, right) = tri_render::scene::wall_faces(w);
        for face in [left, right] {
            let pts: Vec<(f64, f64)> = face.iter().map(|p| to_paper(*p)).collect();
            page.polyline(&pts, false);
        }
    }

    // --- room labels and areas -------------------------------------------------
    for room in tri_rules::room::all(doc) {
        let Some(Component::Polyline2d(pl)) = doc.component(room.entity, &ComponentKey::Polyline2d)
        else {
            continue;
        };
        let (cx, cy) = centroid(&pl.points);
        let (px, py) = to_paper(Point2::new(
            tri_doc::Length::from_um(cx),
            tri_doc::Length::from_um(cy),
        ));
        // Only label a room the label actually fits in. A 2.5mm name spilling out of a
        // 1.2m toilet at 1:100 is worse than no name.
        let room_w = room.width.as_um() as f64 * k;
        if pdf::text_width_mm(&room.name, TEXT_MM) > room_w - 1.0 {
            continue;
        }
        page.text_centred(px, py + 0.6, TEXT_MM, &room.name);
        page.text_centred(
            px,
            py - TEXT_MM - 0.2,
            SMALL_MM,
            &format!("{:.1} m2", room.area_mm2 as f64 / 1_000_000.0),
        );
    }

    // --- overall dimensions ----------------------------------------------------
    //
    // Two strings, below and to the left, offset clear of the building. Computed here
    // rather than read from the document because nothing stores them: the DXF exporter
    // computes the same two from the same bounds.
    page.pen(DIM, 0.13);
    let off = 8.0;
    let (bl, br) = (to_paper(pt(min_x, min_y)), to_paper(pt(max_x, min_y)));
    let tl = to_paper(pt(min_x, max_y));
    dimension_h(&mut page, bl, br, oy - off, um_to_mm(max_x - min_x));
    dimension_v(&mut page, bl, tl, ox - off, um_to_mm(max_y - min_y));

    // --- frame, scale bar and title block --------------------------------------
    page.pen(FRAME, 0.2);
    page.rect(fx, fy, fw, fh);
    scale_bar(&mut page, fx + 4.0, fy + 4.0, fit);
    title_block(&mut page, &fit, &title);

    let bytes = pdf::document(&[page], &title.project);
    let stats = SheetStats {
        paper: fit.paper.name(),
        scale_denominator: fit.scale_denominator,
        walls,
        rooms,
        bytes: bytes.len(),
    };
    Ok((bytes, stats))
}

/// Micrometres to millimetres. A dimension on an architectural drawing is in whole
/// millimetres — the first version passed micrometres into a parameter it had named
/// `metres` and printed `8692000` beside a 8.7m wall, which is the kind of mistake that is
/// obvious on paper and invisible in a byte comparison.
fn um_to_mm(v: i64) -> f64 {
    v as f64 / 1000.0
}

fn pt(x: i64, y: i64) -> Point2 {
    Point2::new(tri_doc::Length::from_um(x), tri_doc::Length::from_um(y))
}

fn centroid(points: &[Point2]) -> (i64, i64) {
    if points.is_empty() {
        return (0, 0);
    }
    let n = points.len() as i64;
    (
        points.iter().map(|p| p.x.as_um()).sum::<i64>() / n,
        points.iter().map(|p| p.y.as_um()).sum::<i64>() / n,
    )
}

/// A dimension string with ticks and the figure above the line, the way a plan reads.
fn dimension_h(page: &mut Page, a: (f64, f64), b: (f64, f64), y: f64, millimetres: f64) {
    page.line((a.0, y), (b.0, y));
    for x in [a.0, b.0] {
        page.line((x, y - 1.5), (x, y + 1.5));
        page.line((x, y), (x, y + 8.0));
    }
    page.text_centred(
        (a.0 + b.0) / 2.0,
        y + 1.0,
        SMALL_MM,
        &format!("{millimetres:.0}"),
    );
}

fn dimension_v(page: &mut Page, a: (f64, f64), b: (f64, f64), x: f64, millimetres: f64) {
    page.line((x, a.1), (x, b.1));
    for y in [a.1, b.1] {
        page.line((x - 1.5, y), (x + 1.5, y));
        page.line((x, y), (x + 8.0, y));
    }
    // Horizontal text beside the line rather than rotated: a rotated string needs a text
    // matrix, and on a sheet this size it is legible either way.
    page.text(
        x + 1.0,
        (a.1 + b.1) / 2.0,
        SMALL_MM,
        &format!("{millimetres:.0}"),
    );
}

/// A graphic scale bar. The thing that makes a printed sheet still measurable after
/// somebody photocopies it at 94%.
fn scale_bar(page: &mut Page, x: f64, y: f64, fit: Fit) {
    let metre_mm = 1000.0 / fit.scale_denominator as f64;
    let segments = if metre_mm < 4.0 { 10 } else { 5 };
    page.pen(FRAME, 0.15);
    for i in 0..segments {
        let x0 = x + i as f64 * metre_mm;
        page.rect(x0, y, metre_mm, 1.4);
    }
    page.text(x, y + 2.2, SMALL_MM, "0");
    page.text(
        x + segments as f64 * metre_mm - 2.0,
        y + 2.2,
        SMALL_MM,
        &format!("{segments} m"),
    );
}

fn title_block(page: &mut Page, fit: &Fit, t: &TitleBlock) {
    let (pw, _) = fit.paper.size_mm();
    let x = sheet::MARGIN_MM;
    let w = pw - 2.0 * sheet::MARGIN_MM;
    let y = sheet::MARGIN_MM;
    let h = sheet::TITLE_BLOCK_MM - 2.0;

    page.pen(FRAME, 0.2);
    page.rect(x, y, w, h);

    let left = x + 3.0;
    page.text(left, y + h - 6.0, 4.0, &t.project);
    page.text(left, y + h - 11.0, TEXT_MM, &t.plot);
    page.text(left, y + h - 15.5, SMALL_MM, &t.drawing);

    // Scale and paper, stated. A sheet that does not say its own scale is not a drawing.
    let mid = x + w * 0.45;
    page.text(
        mid,
        y + h - 6.0,
        TEXT_MM,
        &format!("SCALE 1:{}", fit.scale_denominator),
    );
    page.text(mid, y + h - 10.5, SMALL_MM, fit.paper.name());
    page.text(mid, y + h - 14.5, SMALL_MM, &t.date);
    if !t.revision.is_empty() {
        page.text(mid, y + h - 18.5, SMALL_MM, &t.revision);
    }

    let right = x + w * 0.68;
    for (i, (k, v)) in t.facts.iter().take(4).enumerate() {
        let ly = y + h - 6.0 - i as f64 * 4.0;
        page.text(right, ly, SMALL_MM, k);
        page.text_right(x + w - 3.0, ly, SMALL_MM, v);
    }

    // The disclaimer runs the width of the block, at the bottom, always. Every ruleset in
    // this product ships unreviewed, and a printed sheet is the one artefact that leaves
    // the building and turns up in a meeting without the panel beside it.
    page.text(left, y + 5.0, SMALL_MM, &t.authority);
    page.text(left, y + 1.8, SMALL_MM, &t.disclaimer);
}

/// Bounds of everything drawn in plan, in micrometres.
fn plan_bounds(doc: &Document) -> Option<(i64, i64, i64, i64)> {
    let mut b: Option<(i64, i64, i64, i64)> = None;
    let mut add = |p: Point2| {
        let (x, y) = (p.x.as_um(), p.y.as_um());
        b = Some(match b {
            None => (x, y, x, y),
            Some((a, c, d, e)) => (a.min(x), c.min(y), d.max(x), e.max(y)),
        });
    };
    for (_, set) in doc.iter_with(ComponentKey::WallProfile) {
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            let (left, right) = tri_render::scene::wall_faces(w);
            for face in [left, right] {
                for p in face {
                    add(p);
                }
            }
        }
    }
    b
}
