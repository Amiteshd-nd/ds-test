//! Stage 4 of PRD §4.5: a closed 2D profile per wall run.
//!
//! The profile is the footprint the extrusion sweeps. For a straight run it is a
//! rectangle; for a multi-segment run it is the offset polygon on both sides. Mitring at
//! interior corners is deliberately *not* attempted here — see the note on `build`.

use tri_doc::{Length, Point2};

/// A closed loop, counter-clockwise, with no repeated final point.
#[derive(Clone, Debug, PartialEq)]
pub struct Profile {
    pub outline: Vec<Point2>,
}

impl Profile {
    /// Twice the signed area, in µm². Exact; sign gives winding.
    pub fn signed_area_2x(&self) -> i128 {
        let n = self.outline.len();
        (0..n)
            .map(|i| {
                let a = self.outline[i];
                let b = self.outline[(i + 1) % n];
                a.x.as_um() as i128 * b.y.as_um() as i128
                    - b.x.as_um() as i128 * a.y.as_um() as i128
            })
            .sum()
    }

    pub fn area_mm2(&self) -> f64 {
        (self.signed_area_2x().abs() as f64 / 2.0) / 1_000_000.0
    }

    pub fn is_counter_clockwise(&self) -> bool {
        self.signed_area_2x() > 0
    }

    /// Force counter-clockwise winding, so the extruder can assume it.
    pub fn normalised(mut self) -> Profile {
        if !self.is_counter_clockwise() {
            self.outline.reverse();
        }
        self
    }

    pub fn is_valid(&self) -> bool {
        self.outline.len() >= 3 && self.signed_area_2x() != 0
    }
}

/// Build a closed profile for a wall run of the given thickness.
///
/// # Why there is no mitring
/// A proper mitre needs the intersection of adjacent offset lines, which is unbounded as
/// the interior angle approaches 180° and ill-defined at self-intersections. Getting it
/// right is the job of a polygon-offset kernel, and the PRD is explicit that OCCT does
/// not come in before M4's limits are actually hit (§4.5). So: each segment is offset
/// independently and the offsets are joined end to end. At corners this leaves a small
/// notch on the inside and a small overshoot on the outside, both bounded by the wall
/// thickness.
///
/// That is a real, visible limitation on any run with a corner — recorded here, in the
/// caller's provenance, and in `ARCHITECTURE.md`, rather than discovered later.
pub fn build(centreline: &[Point2], thickness: Length) -> Option<Profile> {
    if centreline.len() < 2 || thickness.as_um() <= 0 {
        return None;
    }
    let half = thickness.as_um() / 2;

    let left = offset_side(centreline, half);
    let right = offset_side(centreline, -half);

    let mut outline = left;
    outline.extend(right.into_iter().rev());
    outline.dedup();

    let profile = Profile { outline }.normalised();
    profile.is_valid().then_some(profile)
}

/// Offset every vertex along the normal of its adjacent segment.
fn offset_side(pts: &[Point2], by_um: i64) -> Vec<Point2> {
    let mut out = Vec::with_capacity(pts.len());
    for i in 0..pts.len() {
        let (a, b) = if i + 1 < pts.len() {
            (pts[i], pts[i + 1])
        } else {
            (pts[i - 1], pts[i])
        };
        let dx = (b.x.as_um() - a.x.as_um()) as i128;
        let dy = (b.y.as_um() - a.y.as_um()) as i128;
        let len = crate::isqrt(dx * dx + dy * dy).max(1);
        let nx = -dy * by_um as i128 / len;
        let ny = dx * by_um as i128 / len;
        out.push(Point2::new(
            Length::from_um(pts[i].x.as_um() + nx as i64),
            Length::from_um(pts[i].y.as_um() + ny as i64),
        ));
    }
    out
}
