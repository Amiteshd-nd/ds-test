//! Stage 3 of PRD §4.5: pair parallel polylines into a centreline plus a thickness.
//!
//! This is the single most consequential inference in the whole pipeline. A drafter draws
//! a wall as two lines; we have to decide that those two particular lines are the two
//! faces of one wall rather than, say, a wall and a skirting, or two walls of a narrow
//! corridor. Everything downstream — the extrusion, the areas, the schedules — inherits
//! that decision, which is why every pairing emits `Inferred` provenance naming the
//! evidence, and every *unpaired* line is reported rather than quietly given a default
//! thickness.

use tri_doc::{Length, Point2};

/// A wall run derived from one or two source polylines.
#[derive(Clone, Debug, PartialEq)]
pub struct WallRun {
    pub centreline: Vec<Point2>,
    pub thickness: Length,
    /// Indices into the input, so the result maps back to source entities.
    pub sources: Vec<usize>,
    pub evidence: PairEvidence,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PairEvidence {
    /// Two parallel polylines were found facing each other.
    Paired {
        separation: Length,
        overlap: Length,
        angle_mdeg: i32,
    },
    /// A single line with nothing to pair against. Thickness is a default.
    Unpaired { reason: String },
}

impl PairEvidence {
    pub fn reason(&self) -> String {
        match self {
            PairEvidence::Paired {
                separation,
                overlap,
                angle_mdeg,
            } => format!(
                "paired with a parallel polyline {:.1}mm away, overlapping {:.0}mm, \
                 {:.2}deg off parallel",
                separation.as_mm_f64(),
                overlap.as_mm_f64(),
                *angle_mdeg as f64 / 1000.0
            ),
            PairEvidence::Unpaired { reason } => reason.clone(),
        }
    }

    pub fn is_paired(&self) -> bool {
        matches!(self, PairEvidence::Paired { .. })
    }
}

/// Tuning for the pairing search. Explicit rather than constant, for the same reason the
/// healing tolerance is.
#[derive(Clone, Copy, Debug)]
pub struct PairParams {
    /// Largest plausible wall thickness.
    pub max_thickness: Length,
    /// Smallest plausible wall thickness. Below this the two lines are more likely a
    /// double-drawn single line than a wall.
    pub min_thickness: Length,
    /// How far from parallel two lines may be, in milli-degrees.
    pub angle_tolerance_mdeg: i32,
    /// The pair must overlap along their shared direction by at least this much.
    pub min_overlap: Length,
    /// Thickness assigned when nothing pairs.
    pub default_thickness: Length,
}

impl Default for PairParams {
    fn default() -> Self {
        PairParams {
            max_thickness: Length::from_mm(600),
            min_thickness: Length::from_mm(50),
            angle_tolerance_mdeg: 2_000, // 2 degrees
            min_overlap: Length::from_mm(300),
            default_thickness: Length::from_mm(100),
        }
    }
}

/// Pair up straight polylines into wall runs.
///
/// Only straight two-point runs are considered for pairing; a tessellated arc is left
/// unpaired on purpose, because "parallel" is not a useful predicate for a curve and
/// pretending otherwise would produce a confidently wrong centreline.
pub fn pair_walls(lines: &[(usize, Vec<Point2>)], p: PairParams) -> Vec<WallRun> {
    let mut used = vec![false; lines.len()];
    let mut runs = Vec::new();

    for i in 0..lines.len() {
        if used[i] {
            continue;
        }
        let (src_i, pts_i) = &lines[i];
        if pts_i.len() != 2 {
            // Curves and multi-segment chains: carried through, never paired.
            runs.push(WallRun {
                centreline: pts_i.clone(),
                thickness: p.default_thickness,
                sources: vec![*src_i],
                evidence: PairEvidence::Unpaired {
                    reason: format!(
                        "polyline has {} points; pairing only handles straight two-point \
                         runs, so thickness fell back to the {:.0}mm default",
                        pts_i.len(),
                        p.default_thickness.as_mm_f64()
                    ),
                },
            });
            used[i] = true;
            continue;
        }

        // Best candidate: closest parallel partner with enough overlap.
        let mut best: Option<(usize, i64, i64, i32)> = None;
        for (j, item) in lines.iter().enumerate().skip(i + 1) {
            if used[j] || item.1.len() != 2 {
                continue;
            }
            let Some((sep, overlap, angle)) = evaluate(pts_i, &item.1, p) else {
                continue;
            };
            if best.is_none_or(|(_, bsep, _, _)| sep < bsep) {
                best = Some((j, sep, overlap, angle));
            }
        }

        match best {
            Some((j, sep, overlap, angle)) => {
                used[i] = true;
                used[j] = true;
                runs.push(WallRun {
                    centreline: midline(pts_i, &lines[j].1),
                    thickness: Length::from_um(sep),
                    sources: vec![*src_i, lines[j].0],
                    evidence: PairEvidence::Paired {
                        separation: Length::from_um(sep),
                        overlap: Length::from_um(overlap),
                        angle_mdeg: angle,
                    },
                });
            }
            None => {
                used[i] = true;
                runs.push(WallRun {
                    centreline: pts_i.clone(),
                    thickness: p.default_thickness,
                    sources: vec![*src_i],
                    evidence: PairEvidence::Unpaired {
                        reason: format!(
                            "no parallel polyline found within {:.0}mm at under {:.1}deg \
                             with {:.0}mm of overlap; thickness fell back to the {:.0}mm \
                             default and the centreline is the drawn line itself, not a \
                             true centre",
                            p.max_thickness.as_mm_f64(),
                            p.angle_tolerance_mdeg as f64 / 1000.0,
                            p.min_overlap.as_mm_f64(),
                            p.default_thickness.as_mm_f64()
                        ),
                    },
                });
            }
        }
    }

    runs
}

/// Are these two segments a plausible wall pair? Returns (separation, overlap, angle).
fn evaluate(a: &[Point2], b: &[Point2], p: PairParams) -> Option<(i64, i64, i32)> {
    let angle = angle_between_mdeg(a, b);
    if angle > p.angle_tolerance_mdeg {
        return None;
    }

    // Perpendicular distance from b's midpoint to a's infinite line.
    let sep = perpendicular_distance(midpoint(b), a[0], a[1]);
    if sep < p.min_thickness.as_um() || sep > p.max_thickness.as_um() {
        return None;
    }

    let overlap = projected_overlap(a, b);
    if overlap < p.min_overlap.as_um() {
        return None;
    }

    Some((sep, overlap, angle))
}

/// Smallest angle between two segments, treating direction as irrelevant (a wall's two
/// faces are often drawn in opposite directions).
fn angle_between_mdeg(a: &[Point2], b: &[Point2]) -> i32 {
    let (ax, ay) = delta(a);
    let (bx, by) = delta(b);
    // |cross| / (|a||b|) = sin(theta). Integer cross and dot, float only for the arcsin.
    let cross = (ax * by - ay * bx).unsigned_abs() as f64;
    let la = ((ax * ax + ay * ay) as f64).sqrt();
    let lb = ((bx * bx + by * by) as f64).sqrt();
    if la == 0.0 || lb == 0.0 {
        return i32::MAX;
    }
    let sin = (cross / (la * lb)).clamp(0.0, 1.0);
    (sin.asin().to_degrees() * 1000.0).round() as i32
}

fn delta(seg: &[Point2]) -> (i128, i128) {
    (
        (seg[1].x.as_um() - seg[0].x.as_um()) as i128,
        (seg[1].y.as_um() - seg[0].y.as_um()) as i128,
    )
}

fn midpoint(seg: &[Point2]) -> Point2 {
    Point2::new(
        Length::from_um((seg[0].x.as_um() + seg[1].x.as_um()) / 2),
        Length::from_um((seg[0].y.as_um() + seg[1].y.as_um()) / 2),
    )
}

fn perpendicular_distance(p: Point2, a: Point2, b: Point2) -> i64 {
    let (dx, dy) = (
        (b.x.as_um() - a.x.as_um()) as i128,
        (b.y.as_um() - a.y.as_um()) as i128,
    );
    let len = crate::isqrt(dx * dx + dy * dy).max(1);
    let cross =
        (dx * (a.y.as_um() - p.y.as_um()) as i128 - dy * (a.x.as_um() - p.x.as_um()) as i128).abs();
    (cross / len) as i64
}

/// How much the two segments overlap when projected onto the first one's direction.
fn projected_overlap(a: &[Point2], b: &[Point2]) -> i64 {
    let (dx, dy) = delta(a);
    let len = crate::isqrt(dx * dx + dy * dy).max(1);
    let project = |p: Point2| -> i128 {
        ((p.x.as_um() - a[0].x.as_um()) as i128 * dx + (p.y.as_um() - a[0].y.as_um()) as i128 * dy)
            / len
    };
    let (a0, a1) = (0i128, len);
    let (b0, b1) = {
        let (x, y) = (project(b[0]), project(b[1]));
        (x.min(y), x.max(y))
    };
    (a1.min(b1) - a0.max(b0)).max(0) as i64
}

/// The centreline of a pair: each of a's endpoints moved halfway to b's line.
///
/// Deliberately anchored to `a` rather than averaging endpoints, because the two faces
/// of a wall frequently have different lengths (one runs past a junction), and averaging
/// endpoints of different-length lines produces a centreline that is skewed rather than
/// centred.
fn midline(a: &[Point2], b: &[Point2]) -> Vec<Point2> {
    let half = perpendicular_distance(midpoint(b), a[0], a[1]) / 2;
    let (dx, dy) = delta(a);
    let len = crate::isqrt(dx * dx + dy * dy).max(1);
    // Unit left normal, times half the separation.
    let (nx, ny) = (-dy * half as i128 / len, dx * half as i128 / len);

    // Which side is b on? Move toward it.
    let sign = {
        let m = midpoint(b);
        let cross = dx * (m.y.as_um() - a[0].y.as_um()) as i128
            - dy * (m.x.as_um() - a[0].x.as_um()) as i128;
        if cross >= 0 {
            1i128
        } else {
            -1
        }
    };

    a.iter()
        .map(|p| {
            Point2::new(
                Length::from_um(p.x.as_um() + (nx * sign) as i64),
                Length::from_um(p.y.as_um() + (ny * sign) as i64),
            )
        })
        .collect()
}
