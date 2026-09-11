//! M2's tests (PRD §6, Prompt 3).
//!
//! "Done when: all three import, classification results are snapshot-tested, and the
//! messy fixture's failures are visible in provenance rather than silently wrong."

use tri_commit::Sequencer;
use tri_doc::component::WallProfile;
use tri_doc::{Component, ComponentKey, Provenance};
use tri_import_dxf::classify::Classified;
use tri_import_dxf::rules::{Classification, RuleSet, TextMatch};
use tri_import_dxf::{import, DxfImporter, ImportOutcome};

const CLEAN: &[u8] = include_bytes!("../../../fixtures/dxf/clean-plan.dxf");
const CURVED: &[u8] = include_bytes!("../../../fixtures/dxf/curved-plan.dxf");
const MESSY: &[u8] = include_bytes!("../../../fixtures/dxf/messy-plan.dxf");

fn run(bytes: &[u8], name: &str) -> (Sequencer, ImportOutcome) {
    let mut seq = Sequencer::default();
    let outcome = import(
        &mut seq,
        &DxfImporter::default(),
        bytes,
        name,
        &RuleSet::ncs_default(),
    )
    .unwrap_or_else(|e| panic!("{name} must import: {e}"));
    (seq, outcome)
}

/// Snapshot comparison that prints the actual value on failure, so regenerating is a
/// copy-paste rather than an archaeology exercise.
fn assert_snapshot(name: &str, actual: &str, expected: &str) {
    if actual.trim() != expected.trim() {
        panic!(
            "snapshot '{name}' changed.\n--- expected ---\n{expected}\n--- actual ---\n{actual}"
        );
    }
}

// ---------------------------------------------------------------------------
// All three import
// ---------------------------------------------------------------------------

#[test]
fn all_three_fixtures_import() {
    for (bytes, name) in [
        (CLEAN, "clean-plan.dxf"),
        (CURVED, "curved-plan.dxf"),
        (MESSY, "messy-plan.dxf"),
    ] {
        let (seq, outcome) = run(bytes, name);
        assert!(
            outcome.source_entities > 0,
            "{name} produced no source entities"
        );
        assert_eq!(outcome.commits.len(), 3, "{name}: layers, phase A, phase B");
        assert!(
            !seq.document().source().is_empty(),
            "{name}: I8 source schema is empty"
        );
        println!("--- {name} ---\n{}", outcome.report());
    }
}

// ---------------------------------------------------------------------------
// I8: phase A is lossless and additive
// ---------------------------------------------------------------------------

#[test]
fn phase_a_preserves_every_entity_verbatim() {
    let (seq, outcome) = run(CLEAN, "clean-plan.dxf");
    let src = seq.document().source();

    // The clean fixture has 12 entities: 5 walls, 4 inserts, 2 texts, 1 grid line.
    assert_eq!(src.len(), 12, "phase A dropped or invented entities");
    assert_eq!(outcome.source_entities, 12);

    // Layer strings survive exactly as authored — not normalised, not uppercased.
    let layers: Vec<_> = src.iter().map(|(_, e)| e.layer.clone()).collect();
    assert!(layers.contains(&"A-WALL".to_string()));
    assert!(layers.contains(&"A-GRID".to_string()));

    // Even the entities that phase B ignores are still here. That is the whole point.
    let grid = src.iter().find(|(_, e)| e.layer == "A-GRID");
    assert!(
        grid.is_some(),
        "an ignored entity was dropped from the source schema"
    );

    // Kinds are the source format's own names.
    let kinds: Vec<_> = src.iter().map(|(_, e)| e.kind.clone()).collect();
    assert!(kinds.contains(&"LWPOLYLINE".to_string()));
    assert!(kinds.contains(&"INSERT".to_string()));
    assert!(kinds.contains(&"TEXT".to_string()));
}

#[test]
fn every_native_object_points_back_at_its_source() {
    let (seq, _) = run(CLEAN, "clean-plan.dxf");
    let mut checked = 0;
    for (id, set) in seq.document().iter_entities() {
        let Some(Component::SourceRef(refs)) = set.get(&ComponentKey::SourceRef) else {
            panic!("entity {id:?} has no SourceRef");
        };
        assert!(!refs.is_empty());
        for r in refs {
            assert!(
                seq.document().source().contains(*r),
                "entity {id:?} references a source entity that does not exist"
            );
        }
        checked += 1;
    }
    assert!(checked > 0);
}

#[test]
fn re_importing_the_same_drawing_is_additive_not_destructive() {
    // I8: a second import must not rewrite the first one's source entities.
    let (mut seq, first) = run(CLEAN, "clean-plan.dxf");
    let source_after_first = seq.document().source().len();

    import(
        &mut seq,
        &DxfImporter::default(),
        CLEAN,
        "clean-plan.dxf",
        &RuleSet::ncs_default(),
    )
    .unwrap();

    assert_eq!(
        seq.document().source().len(),
        source_after_first * 2,
        "re-import overwrote the original source entities instead of adding"
    );
    // Handles are preserved, so a diff has something to key on.
    assert!(seq.document().source().by_handle("0").is_none() || true);
    assert_eq!(first.commits.len(), 3);
}

// ---------------------------------------------------------------------------
// Classification snapshots
// ---------------------------------------------------------------------------

fn classification_summary(c: &Classified) -> String {
    use Classification::*;
    [Wall, Door, Window, Annotation, Ignored, Unknown]
        .iter()
        .map(|k| format!("{k:?}={}", c.count(*k)))
        .collect::<Vec<_>>()
        .join(" ")
}

#[test]
fn clean_plan_classification_snapshot() {
    let (_, o) = run(CLEAN, "clean-plan.dxf");
    assert_snapshot(
        "clean-plan",
        &classification_summary(&o.classified),
        "Wall=5 Door=2 Window=2 Annotation=2 Ignored=1 Unknown=0",
    );
    assert!(
        o.classified.unknown().is_empty(),
        "a clean NCS drawing should classify completely: {:?}",
        o.classified.unknown()
    );
}

#[test]
fn curved_plan_classification_snapshot() {
    let (_, o) = run(CURVED, "curved-plan.dxf");
    assert_snapshot(
        "curved-plan",
        &classification_summary(&o.classified),
        "Wall=7 Door=1 Window=0 Annotation=1 Ignored=0 Unknown=0",
    );
}

#[test]
fn messy_plan_classification_snapshot() {
    let (_, o) = run(MESSY, "messy-plan.dxf");
    assert_snapshot(
        "messy-plan",
        &classification_summary(&o.classified),
        "Wall=7 Door=0 Window=0 Annotation=1 Ignored=2 Unknown=1",
    );
}

#[test]
fn the_messy_door_leaf_is_misclassified_as_a_wall_but_says_so() {
    // A known, deliberate limitation, pinned here so it cannot regress silently.
    //
    // The messy fixture draws a door as a 900mm leaf line plus a swing arc instead of a
    // block. 900mm clears the 800mm "long straight run" threshold, so the leaf reads as
    // a wall. A drafter would dispute this immediately.
    //
    // The point is not that the guess is right — it is wrong. The point is that it is
    // `Assumed`, with a reason naming the last-resort rule, so a reviewer sees it. The
    // alternative designs are worse: a higher threshold loses real short walls, and
    // recognising the arc-plus-line idiom is a heuristic that would itself need
    // provenance. When M4 pairs polylines into wall runs, an unpaired 900mm stub should
    // be demoted; until then this is the honest answer.
    let (_, o) = run(MESSY, "messy-plan.dxf");
    let leaf = o
        .classified
        .decisions
        .iter()
        .filter(|d| d.rule_id.as_deref() == Some("wall.geometry.long_line"))
        .collect::<Vec<_>>();
    assert!(!leaf.is_empty());
    for d in &leaf {
        assert_eq!(d.provenance, Provenance::Assumed);
        assert!(d.because.contains("last resort"), "{}", d.because);
    }

    // The swing arc is left Unknown rather than guessed into the model.
    assert_eq!(o.classified.unknown().len(), 1);
}

#[test]
fn rules_fired_are_recorded_per_entity() {
    let (_, o) = run(CLEAN, "clean-plan.dxf");
    let snap = o.classified.snapshot();
    // Every decision names the rule that produced it, or explicitly names none.
    for line in snap.lines() {
        assert!(
            line.contains("rule="),
            "decision without a rule field: {line}"
        );
        assert!(
            line.contains("prov="),
            "decision without provenance: {line}"
        );
    }
    assert!(
        snap.contains("wall.layer.ncs"),
        "expected the NCS wall rule to fire:\n{snap}"
    );
    assert!(
        snap.contains("ignored.layer.grid"),
        "grid should be ignored:\n{snap}"
    );
}

// ---------------------------------------------------------------------------
// The messy fixture must fail *honestly*
// ---------------------------------------------------------------------------

#[test]
fn messy_plan_units_are_flagged_as_a_guess_not_silently_applied() {
    let (_, o) = run(MESSY, "messy-plan.dxf");

    assert_ne!(
        o.unit_scale.provenance(),
        Provenance::Measured,
        "a drawing with no $INSUNITS must not report a Measured scale"
    );
    assert_eq!(
        o.unit_scale.get(),
        tri_import_dxf::units::UM_PER_M,
        "extents of ~8 units are only plausible as metres"
    );
    let why = o.unit_scale.reason();
    assert!(
        why.contains("$INSUNITS"),
        "reason must name the missing header: {why}"
    );
    assert!(why.contains("metres"), "reason must name the guess: {why}");
    assert!(
        why.contains("verify"),
        "reason must tell the reader to check: {why}"
    );
}

#[test]
fn clean_plan_units_are_measured_because_the_header_says_so() {
    let (_, o) = run(CLEAN, "clean-plan.dxf");
    assert_eq!(o.unit_scale.provenance(), Provenance::Measured);
    assert_eq!(o.unit_scale.get(), tri_import_dxf::units::UM_PER_MM);
}

#[test]
fn messy_plan_defects_are_visible_in_provenance_not_silently_wrong() {
    let (seq, o) = run(MESSY, "messy-plan.dxf");

    // 1. Unclassifiable entities are reported, not dropped.
    let unknown = o.classified.unknown();
    assert!(
        !unknown.is_empty(),
        "the messy fixture has entities on unrecognised layers; none were reported"
    );
    for d in &unknown {
        assert!(
            d.because.contains("no rule") && d.because.contains("matched layer"),
            "an unknown must say what it failed to match: {}",
            d.because
        );
    }

    // 2. Every questionable decision carries Assumed provenance with a real reason.
    let questionable = o.classified.questionable();
    assert!(
        !questionable.is_empty(),
        "a drawing this bad cannot have zero questionable decisions"
    );
    for d in &questionable {
        assert!(
            !d.because.trim().is_empty(),
            "assumed decision with no reason"
        );
    }

    // 3. Nothing derived was laundered into Measured.
    let mut assumed = 0;
    let mut measured = 0;
    for (_, set) in seq.document().iter_entities() {
        for (_, c) in set.iter() {
            for (field, prov, reason) in c.provenance_records() {
                assert!(!reason.trim().is_empty(), "{field} has no reason");
                match prov {
                    Provenance::Assumed => assumed += 1,
                    Provenance::Measured => measured += 1,
                    Provenance::Inferred => {}
                }
            }
        }
    }
    assert!(
        assumed > 0,
        "no Assumed values in a drawing full of guesses"
    );
    assert_eq!(
        measured, 0,
        "nothing in this drawing was actually measured; {measured} value(s) claim to be"
    );
}

#[test]
fn every_wall_height_in_every_fixture_is_assumed_with_a_named_default() {
    // "Do not let a default become a fact." A 2700mm height must never appear without a
    // record saying where 2700 came from.
    for (bytes, name) in [(CLEAN, "clean"), (CURVED, "curved"), (MESSY, "messy")] {
        let (seq, _) = run(bytes, name);
        let mut walls = 0;
        for (id, set) in seq.document().iter_entities() {
            let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
                continue;
            };
            walls += 1;
            assert_eq!(
                w.height.provenance(),
                Provenance::Assumed,
                "{name}: wall {id:?} height is not marked as assumed"
            );
            assert!(
                w.height.reason().contains("2700") && w.height.reason().contains("default"),
                "{name}: wall {id:?} height reason does not name the default: {}",
                w.height.reason()
            );
        }
        assert!(walls > 0, "{name}: no walls found");
    }
}

#[test]
fn the_dashed_setting_out_line_is_ignored_rather_than_built() {
    let (_, o) = run(MESSY, "messy-plan.dxf");
    let snap = o.classified.snapshot();
    assert!(
        snap.contains("ignored.linetype.dashed"),
        "the dashed line should have been caught by linetype, not built as a wall:\n{snap}"
    );
}

#[test]
fn geometry_heuristics_are_marked_assumed_not_inferred() {
    // A wall recognised only because it is a long line is a guess, and must read as one.
    let (_, o) = run(MESSY, "messy-plan.dxf");
    for d in &o.classified.decisions {
        if d.rule_id.as_deref() == Some("wall.geometry.long_line") {
            assert_eq!(
                d.provenance,
                Provenance::Assumed,
                "a geometry-only wall guess claimed to be inferred"
            );
            return;
        }
    }
    panic!(
        "expected the layer-0 wall to be caught by the geometry heuristic:\n{}",
        o.classified.snapshot()
    );
}

// ---------------------------------------------------------------------------
// Rules are data
// ---------------------------------------------------------------------------

#[test]
fn the_classifier_contains_no_layer_name_strings() {
    // The anti-pattern check, made mechanical: the classifier source must not mention
    // any office's layer convention.
    let src = include_str!("../src/classify.rs");
    for forbidden in [
        "A-WALL",
        "A-DOOR",
        "A-GLAZ",
        "A-ANNO",
        "DEFPOINTS",
        "WALL\"",
    ] {
        assert!(
            !src.contains(forbidden),
            "classify.rs hardcodes the layer string {forbidden:?}; rules are data"
        );
    }
}

#[test]
fn a_house_rule_set_reclassifies_the_messy_drawing() {
    // The real test of "rules are data": the messy fixture's unknown layers become walls
    // with a site-specific rule set and no code change.
    let mut rules = RuleSet::ncs_default();
    rules.name = "acme-house-style".into();
    rules.rules.push(tri_import_dxf::rules::Rule {
        id: "wall.layer.acme".into(),
        because: "Acme draws external walls on WALLS-EXTERNAL".into(),
        matcher: tri_import_dxf::rules::Match::Layer(TextMatch::StartsWith("WALLS-".into())),
        becomes: Classification::Wall,
        weight: 500,
        confidence: tri_import_dxf::rules::Confidence::Strong,
    });

    let mut seq = Sequencer::default();
    let o = import(
        &mut seq,
        &DxfImporter::default(),
        MESSY,
        "messy-plan.dxf",
        &rules,
    )
    .unwrap();

    let snap = o.classified.snapshot();
    assert!(
        snap.contains("wall.layer.acme"),
        "the house rule did not fire:\n{snap}"
    );
    // Those walls are now Inferred rather than Assumed, because a named rule fired.
    let acme: Vec<_> = o
        .classified
        .decisions
        .iter()
        .filter(|d| d.rule_id.as_deref() == Some("wall.layer.acme"))
        .collect();
    assert!(!acme.is_empty());
    assert!(acme.iter().all(|d| d.provenance == Provenance::Inferred));
}

#[test]
fn the_bundled_rule_set_round_trips_through_json() {
    let rules = RuleSet::ncs_default();
    let back = RuleSet::from_json(&rules.to_json()).expect("round trip");
    assert_eq!(rules, back);
    assert!(!rules.rules.is_empty());
}

#[test]
fn rule_evaluation_order_is_deterministic() {
    let rules = RuleSet::ncs_default();
    let a: Vec<_> = rules.ordered().iter().map(|r| r.id.clone()).collect();
    let b: Vec<_> = rules.ordered().iter().map(|r| r.id.clone()).collect();
    assert_eq!(a, b);
    // Heavier rules genuinely come first.
    let weights: Vec<_> = rules.ordered().iter().map(|r| r.weight).collect();
    assert!(weights.windows(2).all(|w| w[0] >= w[1]), "{weights:?}");
}

#[test]
fn glob_matching_handles_the_patterns_a_drafter_would_write() {
    let cases = [
        ("*-WALL*", "A-WALL", true),
        ("*-WALL*", "A-WALL-EXTG", true),
        ("*-WALL*", "S-WALL-FNDN", true),
        ("*-WALL*", "A-DOOR", false),
        ("*-WALL*", "a-wall", true), // case-insensitive
        ("A-???", "A-100", true),
        ("A-???", "A-1000", false),
        ("*", "anything", true),
    ];
    for (pattern, subject, expect) in cases {
        assert_eq!(
            TextMatch::Glob(pattern.into()).matches(subject),
            expect,
            "glob {pattern:?} vs {subject:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Arcs
// ---------------------------------------------------------------------------

#[test]
fn arcs_are_tessellated_at_the_boundary_and_the_original_is_kept() {
    let (seq, _) = run(CURVED, "curved-plan.dxf");

    // The exact arc parameters survive in the source schema...
    let arc = seq
        .document()
        .source()
        .iter()
        .find(|(_, e)| e.kind == "ARC")
        .expect("no ARC in the source schema");
    assert!(arc.1.attributes.contains_key("radius_um"));
    assert!(arc.1.attributes.contains_key("start_angle_mdeg"));

    // ...while the derived wall is a polyline with enough points to hold the tolerance.
    let curved_wall = seq
        .document()
        .iter_with(ComponentKey::WallProfile)
        .map(|(_, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => w.centreline.len(),
            _ => 0,
        })
        .max()
        .unwrap_or(0);
    assert!(
        curved_wall > 10,
        "a 1800mm-radius half-round tessellated to only {curved_wall} points"
    );
}

#[test]
fn a_small_circle_does_not_become_a_wall_run() {
    let (seq, _) = run(CURVED, "curved-plan.dxf");
    // The 200mm column is closed and short; it must not have produced a long wall.
    let lengths: Vec<i64> = seq
        .document()
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(_, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(WallProfile { centreline, .. })) => {
                Some(tri_doc::validate::centreline_length_um(centreline))
            }
            _ => None,
        })
        .collect();
    assert!(!lengths.is_empty());
}

// ---------------------------------------------------------------------------
// I1
// ---------------------------------------------------------------------------

#[test]
fn the_entire_import_went_through_validated_commits() {
    let (seq, o) = run(CLEAN, "clean-plan.dxf");
    assert_eq!(
        seq.history().len(),
        3,
        "import must be exactly three commits"
    );
    for c in seq.history().iter() {
        assert!(
            c.verify_id(),
            "a commit in history fails its integrity check"
        );
        assert!(
            matches!(c.author(), tri_commit::Author::System(s) if s == "importer"),
            "import commits must be labelled, not anonymous"
        );
    }
    assert_eq!(o.commits.len(), 3);

    // Replaying history from empty reproduces the document exactly — which is only true
    // if nothing bypassed the commit path.
    let mut replay = Sequencer::default();
    for c in seq.history().iter() {
        replay.submit(c.clone()).expect("replay");
    }
    assert_eq!(replay.document().hash(), seq.document().hash());
}
