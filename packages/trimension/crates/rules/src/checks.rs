//! Running a ruleset over a document.

use crate::diagnostic::{Diagnostic, DiagnosticSet, Severity};
use crate::ruleset::{RuleSet, RuleSetError};
use tri_doc::{Component, ComponentKey, Document, Length, Tracked};
use tri_params::ParameterSet;

/// Fill in tier 2 from tier 1 and a ruleset.
///
/// Every value written here is `Inferred`, and the reason names the clause it came from —
/// so a setback in the compliance panel can always answer "says who?". This is the only
/// place bylaw numbers enter the parameter set, which is why `ParameterSet::from_brief`
/// deliberately leaves tier 2 empty rather than guessing.
pub fn derive_parameters(p: &ParameterSet, rules: &RuleSet) -> Result<ParameterSet, RuleSetError> {
    let area_sqm = p.plot_area_sqm().round() as i64;
    let band = rules.band_for(area_sqm)?;
    let a = &rules.authority;
    let why = |what: &str| {
        format!(
            "{what}: {} {} band {}, {} — {}",
            a.name, a.revision, band.min_area_sqm, band.clause, a.effective
        )
    };

    let road_m = (p.road_width_mm.get().as_mm_f64() / 1000.0).round() as i64;
    let far = rules.far_for(road_m)?;
    let built_up = (p.plot_area_mm2() as i128 * far.far_x1000 as i128 / 1000) as i64;

    let mut out = p.clone();

    // --- staircase --------------------------------------------------------------
    // Risers to climb one floor, rounded up; treads are one fewer than risers; the run
    // plus a landing gives the footprint. Every number comes from the ruleset.
    if p.floors.get() > 1 {
        let rise = p.floor_to_floor.get().as_mm_f64() as i64;
        let risers = rise.div_euclid(rules.staircase_riser_mm)
            + i64::from(rise.rem_euclid(rules.staircase_riser_mm) != 0);
        let going = (risers - 1).max(1) * rules.staircase_tread_mm;
        // Two flights with a half landing: half the going, plus the landing depth.
        let depth = going / 2 + rules.staircase_tread_mm * 4;
        let width = rules.staircase_min_width_mm * 2;
        out.staircase_footprint_mm2 = Tracked::inferred(
            depth * width,
            format!(
                "{risers} risers at {}mm to climb {rise}mm, {}mm treads, two flights with a \
                 half landing at the {} minimum width of {}mm — {}",
                rules.staircase_riser_mm,
                rules.staircase_tread_mm,
                a.name,
                rules.staircase_min_width_mm,
                a.effective
            ),
        );
    } else {
        out.staircase_footprint_mm2 =
            Tracked::inferred(0, "single storey; no staircase needed".to_string());
    }

    // --- water storage ------------------------------------------------------------
    let occupants = (p.bedrooms.get() as i64 * rules.occupants_per_bedroom).max(1);
    let daily = occupants * rules.water_litres_per_person_day;
    let overhead = daily * rules.overhead_share_pct / 100;
    out.overhead_tank_litres = Tracked::inferred(
        overhead,
        format!(
            "{occupants} occupants ({} bedrooms x {}) at {} l/day, {}% overhead — {} {}",
            p.bedrooms.get(),
            rules.occupants_per_bedroom,
            rules.water_litres_per_person_day,
            rules.overhead_share_pct,
            a.name,
            a.effective
        ),
    );
    out.sump_litres = Tracked::inferred(
        daily - overhead,
        format!(
            "the remainder of {daily} l/day after the overhead tank — {} {}",
            a.name, a.effective
        ),
    );

    out.far_permitted_x1000 = Tracked::inferred(
        far.far_x1000,
        format!(
            "FAR for a {road_m} m road: {} {} — {}, {}",
            a.name, a.revision, far.clause, a.effective
        ),
    );
    out.built_up_permitted_mm2 = Tracked::inferred(
        built_up,
        format!(
            "plot area {:.1} m² × FAR {:.3} for a {road_m} m road — {} {} {}",
            p.plot_area_sqm(),
            far.far_x1000 as f64 / 1000.0,
            a.name,
            far.clause,
            a.effective
        ),
    );
    out.ground_coverage_permitted_x100 =
        Tracked::inferred(band.coverage_x100, why("ground coverage limit"));
    out.setback_front = Tracked::inferred(Length::from_mm(band.front_mm), why("front setback"));
    out.setback_rear = Tracked::inferred(Length::from_mm(band.rear_mm), why("rear setback"));
    out.setback_left = Tracked::inferred(Length::from_mm(band.side_mm), why("left setback"));
    out.setback_right = Tracked::inferred(Length::from_mm(band.side_mm), why("right setback"));
    Ok(out)
}

/// A room the programme wants, and how big it should be.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RoomTarget {
    pub kind: String,
    pub count: u8,
    /// Target area in mm², at least the ruleset minimum.
    pub target_area_mm2: i64,
    pub reason: String,
}

/// Work out what rooms the brief implies and roughly how big each should be.
///
/// Deliberately not stored on the document. A target is an intermediate the generator
/// consumes; the rooms it actually lays out are what gets committed, with their own
/// provenance. Storing both would mean two versions of the same number that can disagree.
///
/// The split below is a starting point, not a standard. It divides the permissible
/// built-up area by convention and then floors every room at the ruleset minimum, so a
/// tight plot produces small-but-legal rooms rather than illegal ones.
pub fn derive_program(p: &ParameterSet, rules: &RuleSet) -> Vec<RoomTarget> {
    let per_floor = p.built_up_permitted_mm2.get() / p.floors.get().max(1) as i64;
    let bedrooms = p.bedrooms.get().max(1);
    let toilets = p.toilets.get().max(1);

    // Shares of one floor's area. They sum to less than 100: the remainder is
    // circulation, walls and the stair, which are not rooms.
    let shares: [(&str, u8, i64); 4] = [
        ("living", 1, 30),
        ("bedroom", bedrooms, 34),
        ("kitchen", 1, 10),
        ("toilet", toilets, 8),
    ];

    shares
        .iter()
        .map(|(kind, count, share)| {
            let each = per_floor * share / 100 / (*count).max(1) as i64;
            let floor = rules.minimum_for(kind).map(|m| m.min_area_mm2).unwrap_or(0);
            let target = each.max(floor);
            let reason = if target > each {
                format!(
                    "{share}% of the {:.1} m² permissible floor area split {count} ways is \
                     {:.2} m², below the {:.2} m² minimum for a {kind}, so the minimum applies",
                    per_floor as f64 / 1_000_000.0,
                    each as f64 / 1_000_000.0,
                    floor as f64 / 1_000_000.0,
                )
            } else {
                format!(
                    "{share}% of the {:.1} m² permissible floor area, split {count} ways",
                    per_floor as f64 / 1_000_000.0
                )
            };
            RoomTarget {
                kind: kind.to_string(),
                count: *count,
                target_area_mm2: target,
                reason,
            }
        })
        .collect()
}

/// Run every rule against a document.
///
/// Pure: reads the document, writes nothing. Nothing in this function can reject a
/// commit, and nothing in this crate can reach the code that would (see the crate docs
/// and the deliberately short dependency list in `Cargo.toml`).
pub fn check(doc: &Document, rules: &RuleSet) -> DiagnosticSet {
    let mut out = DiagnosticSet {
        diagnostics: Vec::new(),
        authority: rules.provenance_line(),
        effective: rules.authority.effective.clone(),
    };

    let Some((_, params)) = tri_params::component::find(doc) else {
        // No brief on the document. Not a failure — an imported DXF has no parameter set
        // and is not expected to. There is simply nothing to check against.
        return out;
    };

    if !params.is_derived() {
        out.diagnostics.push(Diagnostic {
            rule_id: "params.not-derived".into(),
            severity: Severity::Soft,
            message: "Tier 2 has not been derived, so FAR and setbacks are unchecked. \
                      Run the ruleset over this brief before trusting any dimension."
                .into(),
            entities: Vec::new(),
            source: "internal".into(),
            measured: None,
            limit: None,
        });
        return out;
    }

    far(doc, &params, rules, &mut out);
    ground_coverage(doc, &params, &mut out);
    setbacks(doc, &params, &mut out);
    room_minimums(doc, rules, &mut out);
    room_proportions(doc, &mut out);
    out
}

/// Footprint against the ground coverage limit.
fn ground_coverage(doc: &Document, params: &ParameterSet, out: &mut DiagnosticSet) {
    let Some(footprint) = footprint_mm2(doc) else {
        return;
    };
    let plot = params.plot_area_mm2();
    let limit_x100 = params.ground_coverage_permitted_x100.get();
    if plot <= 0 || limit_x100 <= 0 {
        return;
    }
    let permitted = (plot as i128 * limit_x100 as i128 / 10_000) as i64;
    if footprint <= permitted {
        return;
    }
    out.diagnostics.push(Diagnostic {
        rule_id: "bbmp.ground-coverage".into(),
        severity: Severity::Hard,
        message: format!(
            "Ground coverage is {:.1} m² against {:.1} m² permitted ({:.0}% of a {:.1} m² \
             plot) — over by {:.1} m².",
            footprint as f64 / 1_000_000.0,
            permitted as f64 / 1_000_000.0,
            limit_x100 as f64 / 100.0,
            plot as f64 / 1_000_000.0,
            (footprint - permitted) as f64 / 1_000_000.0,
        ),
        entities: Vec::new(),
        source: params.ground_coverage_permitted_x100.reason().to_string(),
        measured: Some(footprint),
        limit: Some(permitted),
    });
}

/// Is anything built outside the building line?
///
/// Reported per side and against the offending wall, so the canvas can colour the wall
/// rather than show a list the architect has to map back onto the drawing themselves.
fn setbacks(doc: &Document, params: &ParameterSet, out: &mut DiagnosticSet) {
    let plot_w = params.plot_width.get().as_um();
    let plot_d = params.plot_depth.get().as_um();
    if plot_w <= 0 || plot_d <= 0 {
        return;
    }

    // (label, the wall's own provenance-bearing setback, and how far a point intrudes)
    // How far the building actually sits from one plot edge, given the envelope
    // (min x, min y, max x, max y) in micrometres.
    type Clearance = fn(i64, i64, i64, i64) -> i64;
    let sides: [(&str, &Tracked<Length>, Clearance); 4] = [
        ("front", &params.setback_front, |_x, y, _w, _d| y),
        ("rear", &params.setback_rear, |_x, y, _w, d| d - y),
        ("left", &params.setback_left, |x, _y, _w, _d| x),
        ("right", &params.setback_right, |x, _y, w, _d| w - x),
    ];

    for (label, required, distance) in sides {
        let limit = required.get().as_um();
        if limit <= 0 {
            continue;
        }
        let mut worst: Option<(tri_doc::EntityId, i64)> = None;

        for (id, set) in doc.iter_with(ComponentKey::WallProfile) {
            let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
                continue;
            };
            // Measure to the outer face, not the centreline: a wall is inside its setback
            // only if all of it is.
            let half = w.thickness.get().as_um() / 2;
            for p in &w.centreline {
                let d = distance(p.x.as_um(), p.y.as_um(), plot_w, plot_d) - half;
                if d < limit && worst.is_none_or(|(_, prev)| d < prev) {
                    worst = Some((id, d));
                }
            }
        }

        if let Some((entity, measured)) = worst {
            out.diagnostics.push(Diagnostic {
                rule_id: format!("bbmp.setback.{label}"),
                severity: Severity::Hard,
                message: format!(
                    "The {label} setback is {:.0} mm against {:.0} mm required — the wall \
                     face is {:.0} mm inside the building line.",
                    measured as f64 / 1000.0,
                    limit as f64 / 1000.0,
                    (limit - measured) as f64 / 1000.0,
                ),
                entities: vec![entity],
                source: required.reason().to_string(),
                measured: Some(measured),
                limit: Some(limit),
            });
        }
    }
}

/// Rooms that are legal but awkward.
///
/// A room can meet its minimum area and still be a corridor. Anything longer than
/// [`AWKWARD_RATIO`] to one is hard to furnish, which is a judgement rather than a rule —
/// so it is `Soft`, and the architect overrides it without argument.
pub const AWKWARD_RATIO: f64 = 2.5;

/// Is a room of this kind, at this size, awkward to furnish?
///
/// Public because the generator ranks its options by how many awkward rooms each one has,
/// and a second copy of this rule in `tri-gen` would drift: the generator would rank a
/// layout first and the panel would then warn about it. One definition, two callers.
pub fn is_awkward(kind: &str, width_mm: f64, depth_mm: f64) -> bool {
    // Kinds that are long and thin on purpose. A toilet is a fixture in a slot; a
    // corridor that is not long and thin is not a corridor. F4's 3BHK put a genuine
    // 9021 x 1050 corridor in a plan and this check called it hard to furnish, which is
    // advice nobody can act on — the shape *is* the room.
    if matches!(kind, "toilet" | "corridor" | "circulation") {
        return false;
    }
    let (long, short) = if width_mm >= depth_mm {
        (width_mm, depth_mm)
    } else {
        (depth_mm, width_mm)
    };
    short > 0.0 && long / short > AWKWARD_RATIO
}

fn room_proportions(doc: &Document, out: &mut DiagnosticSet) {
    for room in crate::room::all(doc) {
        let (w, d) = (room.width.as_mm_f64(), room.depth.as_mm_f64());
        if !is_awkward(&room.kind, w, d) {
            continue;
        }
        let (long, short) = if w >= d { (w, d) } else { (d, w) };
        out.diagnostics.push(Diagnostic {
            rule_id: "proportion.awkward".into(),
            severity: Severity::Soft,
            message: format!(
                "{} is {:.0} x {:.0} mm, a {:.1}:1 room. It meets the minimum area but is \
                 hard to furnish.",
                room.name,
                long,
                short,
                long / short
            ),
            entities: vec![room.entity],
            source: "judgement, not a bylaw".into(),
            measured: Some((long / short * 100.0) as i64),
            limit: Some((AWKWARD_RATIO * 100.0) as i64),
        });
    }
}

/// Ground-floor footprint from the wall centrelines, in mm².
fn footprint_mm2(doc: &Document) -> Option<i64> {
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
    any.then(|| {
        let w = (max.0 - min.0) / 1_000;
        let d = (max.1 - min.1) / 1_000;
        (w as i128 * d as i128) as i64
    })
}

/// Built-up area against the permissible figure.
fn far(doc: &Document, params: &ParameterSet, rules: &RuleSet, out: &mut DiagnosticSet) {
    let built = built_up_mm2(doc, params);
    let permitted = params.built_up_permitted_mm2.get();
    if permitted <= 0 || built <= permitted {
        return;
    }
    let over = (built - permitted) as f64 / 1_000_000.0;
    out.diagnostics.push(Diagnostic {
        rule_id: "bbmp.far".into(),
        severity: Severity::Hard,
        message: format!(
            "Built-up area is {:.1} m² against {:.1} m² permitted — over by {over:.1} m². \
             The generator will not produce this; you can still draw it.",
            built as f64 / 1_000_000.0,
            permitted as f64 / 1_000_000.0,
        ),
        entities: Vec::new(),
        source: params.built_up_permitted_mm2.reason().to_string(),
        measured: Some(built),
        limit: Some(permitted),
    });
    let _ = rules;
}

/// Footprint × floors.
///
/// A rough measure: it takes the bounding box of the wall centrelines rather than the
/// enclosed polygon, so an L-shaped plan reads high. Good enough to catch a plan that is
/// plainly over, honest enough to say so — the exact figure needs the room polygons.
fn built_up_mm2(doc: &Document, params: &ParameterSet) -> i64 {
    footprint_mm2(doc).unwrap_or(0) * params.floors.get().max(1) as i64
}

/// Habitable rooms against their minimum area and width.
///
/// Only rooms that actually carry a minimum in the ruleset are checked. A room kind the
/// table says nothing about passes silently, which is correct — the ruleset is the
/// authority on what is regulated, and inventing a minimum for an unlisted kind would be
/// the hardcoding this crate exists to avoid.
fn room_minimums(doc: &Document, rules: &RuleSet, out: &mut DiagnosticSet) {
    for room in crate::room::all(doc) {
        let Some(min) = rules.minimum_for(&room.kind) else {
            continue;
        };
        let short_side = room.width.min(room.depth);

        if room.area_mm2 < min.min_area_mm2 {
            out.diagnostics.push(Diagnostic {
                rule_id: format!("room.min-area.{}", room.kind),
                severity: Severity::Hard,
                message: format!(
                    "{} is {:.2} m² against a {:.2} m² minimum for a {}.",
                    room.name,
                    room.area_mm2 as f64 / 1_000_000.0,
                    min.min_area_mm2 as f64 / 1_000_000.0,
                    room.kind
                ),
                entities: vec![room.entity],
                source: min.clause.clone(),
                measured: Some(room.area_mm2),
                limit: Some(min.min_area_mm2),
            });
        }

        if short_side.as_um() < min.min_width_mm * 1_000 {
            out.diagnostics.push(Diagnostic {
                rule_id: format!("room.min-width.{}", room.kind),
                severity: Severity::Hard,
                message: format!(
                    "{} is {:.0} mm across its short side, against a {} mm minimum for a {}.",
                    room.name,
                    short_side.as_mm_f64(),
                    min.min_width_mm,
                    room.kind
                ),
                entities: vec![room.entity],
                source: min.clause.clone(),
                measured: Some(short_side.as_um() / 1_000),
                limit: Some(min.min_width_mm),
            });
        }
    }
}
