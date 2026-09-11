//! Stages 5 and 6 of PRD §4.5: profile → prism, and openings subtracted.
//!
//! # Deviation from PRD §4.5: no Manifold
//!
//! The PRD specifies "our own extrusion plus `Manifold` for mesh booleans". A spike at
//! M4 found two blocking problems with that:
//!
//! 1. `manifold-csg-sys` drives a CMake build of a C++ library, so every developer and
//!    every CI runner needs a working CMake and C++ toolchain.
//! 2. Building it for `wasm32-unknown-unknown` requires the crate's own
//!    `unstable-wasm-uu` feature, which is documented as needing LLVM 20+, forbidding
//!    C++ exceptions, and dropping parts of the API. Putting the browser client's
//!    geometry on an explicitly unstable path is not a foundation.
//!
//! There is also a correctness reason that outlives both. A general mesh boolean is
//! float arithmetic in C++. Its results are not guaranteed bit-identical between wasm32
//! and x86_64, which would break the deterministic document hash that M1 is built on —
//! the failure would surface as a client and server disagreeing about a document, which
//! is the worst class of bug this architecture can have.
//!
//! So this module does not do general CSG. It solves the *specific* problem M4 has:
//! subtracting axis-aligned rectangular openings from a prismatic wall. That is a 2D
//! problem — rectangles removed from the wall's elevation — swept through the wall
//! thickness, and it is solvable exactly in integers. No C++, no CMake, no unstable
//! features, deterministic across targets, and correct for every opening a DXF block
//! reference can describe.
//!
//! **When this is no longer enough** — non-rectangular openings, walls meeting at
//! arbitrary angles that need true solid union, real fillets — that is the moment to
//! reconsider, and the PRD's answer (a real kernel, server-side) becomes right. It is
//! not right yet.

use crate::mesh::Mesh;
use tri_doc::{Length, Point2};
use tri_geom2d::profile::Profile;

/// An opening to cut, in wall-run coordinates.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpeningCut {
    /// Distance along the centreline to the opening's centre.
    pub position: Length,
    pub width: Length,
    pub height: Length,
    /// Height of the opening's bottom edge above the wall base.
    pub sill: Length,
}

impl OpeningCut {
    fn s_range(&self) -> (i64, i64) {
        let half = self.width.as_um() / 2;
        (self.position.as_um() - half, self.position.as_um() + half)
    }

    fn z_range(&self) -> (i64, i64) {
        (self.sill.as_um(), self.sill.as_um() + self.height.as_um())
    }
}

/// What the cut actually did, for provenance.
#[derive(Clone, Debug, PartialEq)]
pub struct CutReport {
    pub applied: usize,
    /// Openings that fell outside the wall and were skipped, with the reason.
    pub skipped: Vec<String>,
    /// Openings that overlapped each other and were merged into one void.
    pub merged: usize,
}

/// Extrude a closed profile straight up. The general case, used for anything that is not
/// a wall with openings.
pub fn extrude(profile: &Profile, base_um: i64, height_um: i64) -> Mesh {
    let mut mesh = Mesh::default();
    if height_um <= 0 || profile.outline.len() < 3 {
        return mesh;
    }
    let top = base_um + height_um;
    let n = profile.outline.len();

    // Sides.
    for i in 0..n {
        let a = profile.outline[i];
        let b = profile.outline[(i + 1) % n];
        mesh.quad(
            [a.x.as_um(), a.y.as_um(), base_um],
            [b.x.as_um(), b.y.as_um(), base_um],
            [b.x.as_um(), b.y.as_um(), top],
            [a.x.as_um(), a.y.as_um(), top],
        );
    }

    // Caps, as a fan. Valid because `Profile::build` produces convex-per-segment
    // outlines; a general polygon would need ear clipping, which is what the wall path
    // below avoids needing at all.
    let o = profile.outline[0];
    for i in 1..n - 1 {
        let a = profile.outline[i];
        let b = profile.outline[i + 1];
        mesh.triangle(
            [o.x.as_um(), o.y.as_um(), top],
            [a.x.as_um(), a.y.as_um(), top],
            [b.x.as_um(), b.y.as_um(), top],
        );
        mesh.triangle(
            [o.x.as_um(), o.y.as_um(), base_um],
            [b.x.as_um(), b.y.as_um(), base_um],
            [a.x.as_um(), a.y.as_um(), base_um],
        );
    }

    mesh
}

/// Build a wall as a solid with its openings already absent.
///
/// Rather than building a prism and subtracting from it, this builds only the material
/// that remains — the panels either side of each opening, plus the lintel above and the
/// sill below. The result is exact, is closed by construction, and has no boolean in it
/// to go wrong.
pub fn wall_with_openings(
    centreline: &[Point2],
    thickness: Length,
    base: Length,
    height: Length,
    openings: &[OpeningCut],
) -> (Mesh, CutReport) {
    let mut mesh = Mesh::default();
    let mut report = CutReport {
        applied: 0,
        skipped: Vec::new(),
        merged: 0,
    };

    let run = tri_doc::validate::centreline_length_um(centreline);
    let (h, base_um) = (height.as_um(), base.as_um());
    if run <= 0 || h <= 0 || thickness.as_um() <= 0 || centreline.len() < 2 {
        return (mesh, report);
    }

    // Keep only openings that actually fall within the wall, and clamp them to it.
    let mut voids: Vec<(i64, i64, i64, i64)> = Vec::new();
    for o in openings {
        let (s0, s1) = o.s_range();
        let (z0, z1) = o.z_range();
        if s1 <= 0 || s0 >= run {
            report.skipped.push(format!(
                "opening at {:.0}mm spans {:.0}..{:.0}mm, entirely outside a {:.0}mm wall run",
                o.position.as_mm_f64(),
                s0 as f64 / 1000.0,
                s1 as f64 / 1000.0,
                run as f64 / 1000.0
            ));
            continue;
        }
        if z0 >= h {
            report.skipped.push(format!(
                "opening sill at {:.0}mm is at or above the {:.0}mm wall height",
                o.sill.as_mm_f64(),
                height.as_mm_f64()
            ));
            continue;
        }
        voids.push((s0.max(0), s1.min(run), z0.max(0), z1.min(h)));
        report.applied += 1;
    }

    // Merge overlapping voids so a slab never sees two intervals that touch.
    voids.sort_unstable();
    let before = voids.len();
    voids = merge_overlapping(voids);
    report.merged = before.saturating_sub(voids.len());

    // Cut the wall into vertical slabs at every void edge *and* every centreline vertex,
    // so each slab is straight and can be mapped to world space exactly.
    let mut cuts: Vec<i64> = vec![0, run];
    for (s0, s1, _, _) in &voids {
        cuts.push(*s0);
        cuts.push(*s1);
    }
    let mut travelled = 0i64;
    for seg in centreline.windows(2) {
        travelled += tri_doc::validate::isqrt_i128(seg[0].dist_sq(seg[1])) as i64;
        cuts.push(travelled);
    }
    cuts.retain(|c| *c >= 0 && *c <= run);
    cuts.sort_unstable();
    cuts.dedup();

    // For each slab, the z-intervals of remaining material.
    for w in cuts.windows(2) {
        let (a, b) = (w[0], w[1]);
        if a >= b {
            continue;
        }
        let mid = (a + b) / 2;
        let blocking: Vec<(i64, i64)> = voids
            .iter()
            .filter(|(s0, s1, _, _)| *s0 <= mid && mid < *s1)
            .map(|(_, _, z0, z1)| (*z0, *z1))
            .collect();

        for (z0, z1) in free_intervals(&blocking, 0, h) {
            push_block(
                &mut mesh,
                centreline,
                thickness,
                a,
                b,
                base_um + z0,
                base_um + z1,
            );
        }
    }

    (mesh, report)
}

fn merge_overlapping(mut v: Vec<(i64, i64, i64, i64)>) -> Vec<(i64, i64, i64, i64)> {
    let mut out: Vec<(i64, i64, i64, i64)> = Vec::with_capacity(v.len());
    for cur in v.drain(..) {
        match out.last_mut() {
            // Only merge when they overlap in *both* axes; two openings at different
            // heights over the same span are separate voids, not one.
            Some(last) if cur.0 < last.1 && cur.2 < last.3 && cur.3 > last.2 => {
                last.1 = last.1.max(cur.1);
                last.2 = last.2.min(cur.2);
                last.3 = last.3.max(cur.3);
            }
            _ => out.push(cur),
        }
    }
    out
}

/// Complement of `blocking` within `[lo, hi)`.
fn free_intervals(blocking: &[(i64, i64)], lo: i64, hi: i64) -> Vec<(i64, i64)> {
    let mut sorted: Vec<(i64, i64)> = blocking.to_vec();
    sorted.sort_unstable();
    let mut out = Vec::new();
    let mut cursor = lo;
    for (z0, z1) in sorted {
        if z0 > cursor {
            out.push((cursor, z0.min(hi)));
        }
        cursor = cursor.max(z1);
        if cursor >= hi {
            break;
        }
    }
    if cursor < hi {
        out.push((cursor, hi));
    }
    out.retain(|(a, b)| b > a);
    out
}

/// One rectangular block of wall: the material between `s0..s1` along the run and
/// `z0..z1` in height, spanning the full thickness. Six faces, closed by construction.
fn push_block(
    mesh: &mut Mesh,
    centreline: &[Point2],
    thickness: Length,
    s0: i64,
    s1: i64,
    z0: i64,
    z1: i64,
) {
    let half = thickness.as_um() / 2;
    let Some((a_l, a_r)) = faces_at(centreline, s0, half) else {
        return;
    };
    let Some((b_l, b_r)) = faces_at(centreline, s1, half) else {
        return;
    };

    let p = |xy: Point2, z: i64| [xy.x.as_um(), xy.y.as_um(), z];

    // Left face, right face, two ends, top, bottom. Winding is outward.
    mesh.quad(p(a_l, z0), p(b_l, z0), p(b_l, z1), p(a_l, z1));
    mesh.quad(p(b_r, z0), p(a_r, z0), p(a_r, z1), p(b_r, z1));
    mesh.quad(p(a_r, z0), p(a_l, z0), p(a_l, z1), p(a_r, z1));
    mesh.quad(p(b_l, z0), p(b_r, z0), p(b_r, z1), p(b_l, z1));
    mesh.quad(p(a_l, z1), p(b_l, z1), p(b_r, z1), p(a_r, z1));
    mesh.quad(p(a_r, z0), p(b_r, z0), p(b_l, z0), p(a_l, z0));
}

/// The two face points at distance `s` along the centreline.
fn faces_at(centreline: &[Point2], s: i64, half_um: i64) -> Option<(Point2, Point2)> {
    let mut travelled = 0i64;
    for seg in centreline.windows(2) {
        let len = tri_doc::validate::isqrt_i128(seg[0].dist_sq(seg[1])) as i64;
        if len == 0 {
            continue;
        }
        if s <= travelled + len || travelled + len == 0 {
            let t = (s - travelled).clamp(0, len);
            let dx = (seg[1].x.as_um() - seg[0].x.as_um()) as i128;
            let dy = (seg[1].y.as_um() - seg[0].y.as_um()) as i128;
            let cx = seg[0].x.as_um() + (dx * t as i128 / len as i128) as i64;
            let cy = seg[0].y.as_um() + (dy * t as i128 / len as i128) as i64;
            let nx = (-dy * half_um as i128 / len as i128) as i64;
            let ny = (dx * half_um as i128 / len as i128) as i64;
            return Some((
                Point2::new(Length::from_um(cx + nx), Length::from_um(cy + ny)),
                Point2::new(Length::from_um(cx - nx), Length::from_um(cy - ny)),
            ));
        }
        travelled += len;
    }
    // Past the end: clamp to the last segment.
    let last = centreline.windows(2).next_back()?;
    let dx = (last[1].x.as_um() - last[0].x.as_um()) as i128;
    let dy = (last[1].y.as_um() - last[0].y.as_um()) as i128;
    let len = tri_doc::validate::isqrt_i128(dx * dx + dy * dy).max(1);
    let nx = (-dy * half_um as i128 / len) as i64;
    let ny = (dx * half_um as i128 / len) as i64;
    Some((
        Point2::new(
            Length::from_um(last[1].x.as_um() + nx),
            Length::from_um(last[1].y.as_um() + ny),
        ),
        Point2::new(
            Length::from_um(last[1].x.as_um() - nx),
            Length::from_um(last[1].y.as_um() - ny),
        ),
    ))
}
