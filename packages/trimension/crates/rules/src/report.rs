//! The compliance report: what the panel shows.
//!
//! A view over data that already exists — diagnostics from [`check`](crate::check) and
//! provenance from the parameter set. It computes nothing the rest of the crate does not
//! already know, which is the point: a panel that derives its own numbers is a second
//! implementation of the rules, and the two will disagree at the worst moment.

use crate::checks::check;
use crate::diagnostic::{Diagnostic, Severity};
use crate::ruleset::RuleSet;
use serde::{Deserialize, Serialize};
use tri_doc::{Component, ComponentKey, Document, Provenance};
use tri_params::ParameterSet;

/// How a measured value stands against its limit.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Standing {
    /// Comfortably within.
    Ok,
    /// Within, but with less than a tenth to spare. Worth knowing before an edit puts it
    /// over, rather than after.
    Tight,
    /// Over the limit.
    Over,
    /// No limit applies, or none has been derived yet.
    Unmeasured,
}

/// One line of the panel.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct Metric {
    pub id: String,
    pub label: String,
    /// Already in display units, so the UI does no arithmetic.
    pub value: f64,
    pub limit: Option<f64>,
    pub unit: String,
    pub standing: Standing,
    /// Shown on hover. This is the whole reason the panel is credible.
    pub provenance: Provenance,
    pub reason: String,
}

impl Metric {
    /// Fraction of the limit used, for a gauge. `None` when nothing limits it.
    pub fn utilisation(&self) -> Option<f64> {
        self.limit.filter(|l| *l > 0.0).map(|l| self.value / l)
    }
}

/// Everything the panel renders.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct ComplianceReport {
    pub metrics: Vec<Metric>,
    pub diagnostics: Vec<Diagnostic>,
    /// "BBMP placeholder-v0, effective 2024-04-01 — NOT reviewed by a practising architect"
    pub authority: String,
    pub effective: String,
    /// Shown verbatim, always. Architects need to know which revision they are looking at,
    /// and we need them to know it is indicative.
    pub disclaimer: String,
    /// Has anyone qualified checked these numbers?
    pub reviewed: bool,
}

impl ComplianceReport {
    pub fn passes_hard_rules(&self) -> bool {
        !self
            .diagnostics
            .iter()
            .any(|d| d.severity == Severity::Hard)
    }

    pub fn counts(&self) -> (usize, usize, usize) {
        let n = |s: Severity| self.diagnostics.iter().filter(|d| d.severity == s).count();
        (n(Severity::Hard), n(Severity::Soft), n(Severity::Advisory))
    }

    /// Entities a hard failure points at, so the canvas can colour them.
    pub fn failing_entities(&self) -> Vec<u64> {
        let mut v: Vec<u64> = self
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Hard)
            .flat_map(|d| d.entities.iter().map(|e| e.raw()))
            .collect();
        v.sort_unstable();
        v.dedup();
        v
    }

    pub fn warning_entities(&self) -> Vec<u64> {
        let mut v: Vec<u64> = self
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Soft)
            .flat_map(|d| d.entities.iter().map(|e| e.raw()))
            .collect();
        v.sort_unstable();
        v.dedup();
        v
    }
}

fn standing(value: f64, limit: Option<f64>) -> Standing {
    match limit {
        None => Standing::Unmeasured,
        Some(l) if l <= 0.0 => Standing::Unmeasured,
        Some(l) if value > l => Standing::Over,
        Some(l) if value / l > 0.9 => Standing::Tight,
        Some(_) => Standing::Ok,
    }
}

fn sqm(mm2: i64) -> f64 {
    mm2 as f64 / 1_000_000.0
}

/// Build the report.
pub fn report(doc: &Document, rules: &RuleSet) -> ComplianceReport {
    let diagnostics = check(doc, rules);
    let mut metrics = Vec::new();

    if let Some((_, p)) = tri_params::component::find(doc) {
        metrics = build_metrics(doc, &p);
    }

    ComplianceReport {
        metrics,
        diagnostics: diagnostics.diagnostics,
        authority: rules.provenance_line(),
        effective: rules.authority.effective.clone(),
        disclaimer: rules.disclaimer.clone(),
        reviewed: rules.authority.reviewed_by.is_some(),
    }
}

fn build_metrics(doc: &Document, p: &ParameterSet) -> Vec<Metric> {
    let footprint = footprint_mm2(doc);
    let floors = p.floors.get().max(1) as i64;
    let built_up = footprint * floors;
    let plot = p.plot_area_mm2();

    let permitted_built_up = p.built_up_permitted_mm2.get();
    let far_used = if plot > 0 {
        built_up as f64 / plot as f64
    } else {
        0.0
    };
    let far_limit = p.far_permitted_x1000.get() as f64 / 1000.0;
    let coverage_used = if plot > 0 {
        footprint as f64 / plot as f64 * 100.0
    } else {
        0.0
    };
    let coverage_limit = p.ground_coverage_permitted_x100.get() as f64 / 100.0;

    let mut m = vec![
        Metric {
            id: "far".into(),
            label: "FAR".into(),
            value: (far_used * 1000.0).round() / 1000.0,
            limit: (far_limit > 0.0).then_some(far_limit),
            unit: String::new(),
            standing: standing(far_used, (far_limit > 0.0).then_some(far_limit)),
            provenance: p.far_permitted_x1000.provenance(),
            reason: p.far_permitted_x1000.reason().to_string(),
        },
        Metric {
            id: "built_up".into(),
            label: "Built-up area".into(),
            value: sqm(built_up),
            limit: (permitted_built_up > 0).then(|| sqm(permitted_built_up)),
            unit: "m²".into(),
            standing: standing(
                sqm(built_up),
                (permitted_built_up > 0).then(|| sqm(permitted_built_up)),
            ),
            provenance: p.built_up_permitted_mm2.provenance(),
            reason: p.built_up_permitted_mm2.reason().to_string(),
        },
        Metric {
            id: "built_up_per_floor".into(),
            label: "Per floor".into(),
            value: sqm(footprint),
            limit: (permitted_built_up > 0).then(|| sqm(permitted_built_up / floors)),
            unit: "m²".into(),
            standing: Standing::Unmeasured,
            provenance: Provenance::Inferred,
            reason: format!(
                "footprint measured from the wall centrelines, across {floors} floor(s)"
            ),
        },
        Metric {
            id: "ground_coverage".into(),
            label: "Ground coverage".into(),
            value: (coverage_used * 10.0).round() / 10.0,
            limit: (coverage_limit > 0.0).then_some(coverage_limit),
            unit: "%".into(),
            standing: standing(
                coverage_used,
                (coverage_limit > 0.0).then_some(coverage_limit),
            ),
            provenance: p.ground_coverage_permitted_x100.provenance(),
            reason: p.ground_coverage_permitted_x100.reason().to_string(),
        },
    ];

    // Setbacks, measured to the nearest wall face on each side.
    for (id, label, required) in [
        ("setback_front", "Front setback", &p.setback_front),
        ("setback_rear", "Rear setback", &p.setback_rear),
        ("setback_left", "Left setback", &p.setback_left),
        ("setback_right", "Right setback", &p.setback_right),
    ] {
        let want = required.get().as_mm_f64();
        let got = measured_setback(doc, p, id);
        m.push(Metric {
            id: id.into(),
            label: label.into(),
            value: got.unwrap_or(0.0).round(),
            limit: (want > 0.0).then_some(want),
            unit: "mm".into(),
            // A setback is the one metric where *more* is compliant, so the usual
            // over/under test is inverted.
            standing: match (got, want) {
                (_, w) if w <= 0.0 => Standing::Unmeasured,
                (None, _) => Standing::Unmeasured,
                (Some(g), w) if g < w => Standing::Over,
                (Some(g), w) if g < w * 1.1 => Standing::Tight,
                _ => Standing::Ok,
            },
            provenance: required.provenance(),
            reason: required.reason().to_string(),
        });
    }

    m
}

/// The smallest distance from the plot boundary to any wall face on one side.
fn measured_setback(doc: &Document, p: &ParameterSet, side: &str) -> Option<f64> {
    let plot_w = p.plot_width.get().as_um();
    let plot_d = p.plot_depth.get().as_um();
    let mut best: Option<i64> = None;

    for (_, set) in doc.iter_with(ComponentKey::WallProfile) {
        let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
            continue;
        };
        let half = w.thickness.get().as_um() / 2;
        for pt in &w.centreline {
            let d = match side {
                "setback_front" => pt.y.as_um(),
                "setback_rear" => plot_d - pt.y.as_um(),
                "setback_left" => pt.x.as_um(),
                "setback_right" => plot_w - pt.x.as_um(),
                _ => continue,
            } - half;
            best = Some(best.map_or(d, |b: i64| b.min(d)));
        }
    }
    best.map(|v| v as f64 / 1000.0)
}

fn footprint_mm2(doc: &Document) -> i64 {
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
    if !any {
        return 0;
    }
    let w = (max.0 - min.0) / 1_000;
    let d = (max.1 - min.1) / 1_000;
    (w as i128 * d as i128) as i64
}
