//! Stage 1 of PRD §4.5: make the drawing topologically sound before deriving anything.
//!
//! Real drawings do not close. Endpoints miss by a fraction of a millimetre, the same
//! line gets drawn twice by two people, and a "closed" room has a gap you cannot see at
//! any sensible zoom. Every fix here is a decision, so every fix is reported.
//!
//! The tolerance is an explicit parameter, never a constant (PRD Prompt 5). Because
//! coordinates are exact integers (`tri_doc::units`), "within tolerance" is an exact
//! comparison rather than an epsilon whose behaviour depends on magnitude.

use tri_doc::{Length, Point2};

/// What healing did, so it can be attached to provenance rather than done invisibly.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct HealReport {
    /// Endpoints moved to meet each other: (from, to, distance).
    pub snapped: Vec<(Point2, Point2, Length)>,
    /// Polylines whose ends were within tolerance and were closed.
    pub closed_loops: Vec<usize>,
    /// Indices of input polylines dropped as exact duplicates of an earlier one.
    pub duplicates: Vec<usize>,
    /// Zero-length segments removed.
    pub degenerate_segments: usize,
    /// Gaps found but *not* closed because they exceeded the tolerance. These are the
    /// interesting ones: a gap we refused to close is a defect the drawing still has.
    pub gaps_left_open: Vec<(Point2, Point2, Length)>,
}

impl HealReport {
    pub fn is_clean(&self) -> bool {
        self.snapped.is_empty()
            && self.closed_loops.is_empty()
            && self.duplicates.is_empty()
            && self.degenerate_segments == 0
            && self.gaps_left_open.is_empty()
    }

    /// A sentence per class of repair, for a provenance reason string.
    pub fn summary(&self) -> String {
        if self.is_clean() {
            return "geometry needed no repair".into();
        }
        let mut parts = Vec::new();
        if !self.snapped.is_empty() {
            let worst = self
                .snapped
                .iter()
                .map(|(_, _, d)| d.as_um())
                .max()
                .unwrap_or(0);
            parts.push(format!(
                "snapped {} endpoint(s), largest move {:.3}mm",
                self.snapped.len(),
                worst as f64 / 1000.0
            ));
        }
        if !self.closed_loops.is_empty() {
            parts.push(format!("closed {} near-loop(s)", self.closed_loops.len()));
        }
        if !self.duplicates.is_empty() {
            parts.push(format!(
                "removed {} duplicate polyline(s)",
                self.duplicates.len()
            ));
        }
        if self.degenerate_segments > 0 {
            parts.push(format!(
                "removed {} zero-length segment(s)",
                self.degenerate_segments
            ));
        }
        if !self.gaps_left_open.is_empty() {
            let worst = self
                .gaps_left_open
                .iter()
                .map(|(_, _, d)| d.as_um())
                .max()
                .unwrap_or(0);
            parts.push(format!(
                "LEFT {} gap(s) open, largest {:.1}mm - beyond tolerance, drawing still has them",
                self.gaps_left_open.len(),
                worst as f64 / 1000.0
            ));
        }
        parts.join("; ")
    }
}

/// A polyline being healed.
#[derive(Clone, Debug, PartialEq)]
pub struct Chain {
    pub points: Vec<Point2>,
    pub closed: bool,
    /// Index in the caller's input, so the result maps back to source entities.
    pub origin: usize,
}

/// Heal a set of polylines.
///
/// `tolerance` is the largest gap that may be silently closed. Anything larger is
/// recorded in [`HealReport::gaps_left_open`] and left alone — closing a 20mm gap because
/// it "looks like" a corner is exactly the sort of unrecorded decision that makes a model
/// unsignable.
pub fn heal(input: &[Chain], tolerance: Length) -> (Vec<Chain>, HealReport) {
    let mut report = HealReport::default();
    let tol_sq = (tolerance.as_um() as i128).pow(2);

    // 1. Drop exact duplicates. Compared in both directions: A->B and B->A are the
    //    same wall drawn twice, which is the common case when two people trace over
    //    each other.
    let mut kept: Vec<Chain> = Vec::with_capacity(input.len());
    for (i, chain) in input.iter().enumerate() {
        let dup = kept.iter().any(|k| same_geometry(&k.points, &chain.points));
        if dup {
            report.duplicates.push(i);
        } else {
            kept.push(chain.clone());
        }
    }

    // 2. Remove zero-length and sub-tolerance segments within each chain.
    for chain in kept.iter_mut() {
        let before = chain.points.len();
        let mut out: Vec<Point2> = Vec::with_capacity(before);
        for p in &chain.points {
            if out.last().is_none_or(|last| last.dist_sq(*p) > 0) {
                out.push(*p);
            }
        }
        report.degenerate_segments += before.saturating_sub(out.len());
        chain.points = out;
    }
    kept.retain(|c| c.points.len() >= 2);

    // 3. Snap endpoints between chains. Every endpoint within tolerance of an earlier
    //    endpoint moves to it — earlier wins, so the result does not depend on
    //    iteration direction.
    let mut anchors: Vec<Point2> = Vec::new();
    for chain in kept.iter_mut() {
        for idx in [0, chain.points.len() - 1] {
            let p = chain.points[idx];
            match anchors
                .iter()
                .find(|a| a.dist_sq(p) > 0 && a.dist_sq(p) <= tol_sq)
            {
                Some(&anchor) => {
                    let d = Length::from_um(crate::isqrt(anchor.dist_sq(p)) as i64);
                    report.snapped.push((p, anchor, d));
                    chain.points[idx] = anchor;
                }
                None => anchors.push(p),
            }
        }
    }

    // 4. Close near-loops within a chain.
    for (i, chain) in kept.iter_mut().enumerate() {
        if chain.closed || chain.points.len() < 3 {
            continue;
        }
        let (first, last) = (chain.points[0], chain.points[chain.points.len() - 1]);
        let d2 = first.dist_sq(last);
        if d2 > 0 && d2 <= tol_sq {
            let n = chain.points.len();
            chain.points[n - 1] = first;
            chain.closed = true;
            report.closed_loops.push(i);
        }
    }

    // 5. Report the gaps we refused to close. An endpoint that is near another endpoint
    //    but further away than the tolerance is a defect the drawing still has, and the
    //    reviewer needs to know rather than discovering it when a room fails to enclose.
    let report_window = tolerance.as_um().saturating_mul(10);
    let window_sq = (report_window as i128).pow(2);
    let ends: Vec<Point2> = kept
        .iter()
        .filter(|c| !c.closed)
        .flat_map(|c| [c.points[0], c.points[c.points.len() - 1]])
        .collect();
    for (i, a) in ends.iter().enumerate() {
        for b in ends.iter().skip(i + 1) {
            let d2 = a.dist_sq(*b);
            if d2 > tol_sq && d2 <= window_sq {
                report
                    .gaps_left_open
                    .push((*a, *b, Length::from_um(crate::isqrt(d2) as i64)));
            }
        }
    }

    (kept, report)
}

/// Two polylines describing the same run, in either direction.
fn same_geometry(a: &[Point2], b: &[Point2]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a == b || a.iter().rev().copied().collect::<Vec<_>>() == b
}
