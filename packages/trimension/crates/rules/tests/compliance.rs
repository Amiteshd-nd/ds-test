//! P1's tests. The load-bearing one is
//! `a_far_violating_plan_still_commits` — if that ever fails, the tool is fighting the
//! architect at the moment they most need it to get out of the way.

use tri_commit::{Author, Commit, Sequencer, UserId};
use tri_doc::component::WallProfile;
use tri_doc::{Component, Length, Op, Point2, Provenance, Tracked};
use tri_params::{component as params_component, Orientation, ParameterSet};
use tri_rules::{check, derive_parameters, RuleSet, Severity};

fn brief() -> ParameterSet {
    ParameterSet::from_brief(
        Length::from_mm(9144),  // 30 ft
        Length::from_mm(12192), // 40 ft
        Orientation::North,
        3,
        2,
        1,
    )
    .unwrap()
}

fn p(x_mm: i64, y_mm: i64) -> Point2 {
    Point2::new(Length::from_mm(x_mm), Length::from_mm(y_mm))
}

/// A rectangle of walls `w` × `d` millimetres, with its near corner at the origin.
fn walls(w: i64, d: i64) -> Vec<Op> {
    walls_at(0, 0, w, d)
}

/// The same rectangle, placed. Used for the compliant case, which has to sit inside its
/// setbacks — a building on the plot boundary is in breach by definition, so a fixture
/// drawn at the origin cannot be the one that demonstrates compliance.
fn walls_at(x: i64, y: i64, w: i64, d: i64) -> Vec<Op> {
    [
        (p(x, y), p(x + w, y)),
        (p(x + w, y), p(x + w, y + d)),
        (p(x + w, y + d), p(x, y + d)),
        (p(x, y + d), p(x, y)),
    ]
    .into_iter()
    .map(|(a, b)| Op::CreateEntity {
        components: vec![Component::WallProfile(WallProfile {
            centreline: vec![a, b],
            thickness: Tracked::assumed(Length::from_mm(230), "default"),
            height: Tracked::assumed(Length::from_mm(3000), "default"),
            base_elevation: Tracked::assumed(Length::ZERO, "ground"),
        })],
    })
    .collect()
}

fn session_with(params: &ParameterSet, wall_ops: Vec<Op>) -> Sequencer {
    let mut seq = Sequencer::default();
    let mut ops = vec![
        Op::RegisterType {
            def: params_component::type_definition(),
        },
        Op::CreateEntity {
            components: vec![params_component::to_component(params)],
        },
    ];
    ops.extend(wall_ops);
    seq.submit(Commit::new(
        seq.head(),
        Author::Human(UserId("amitesh".into())),
        ops,
        "brief and walls",
    ))
    .expect("structurally valid");
    seq
}

// ---------------------------------------------------------------------------
// The one that matters
// ---------------------------------------------------------------------------

#[test]
fn a_far_violating_plan_still_commits_and_the_diagnostic_is_queryable() {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).expect("30x40 is in a band");

    // Build out to the full plot on both floors — far past the permissible built-up.
    let seq = session_with(&derived, walls(9144, 12192));

    // The commit went through. That is the assertion; everything else is detail.
    assert_eq!(seq.history().len(), 1, "the commit was rejected");
    assert!(seq.document().entity_count() >= 4);

    let diagnostics = check(seq.document(), &rules);
    let far: Vec<_> = diagnostics
        .diagnostics
        .iter()
        .filter(|d| d.rule_id == "bbmp.far")
        .collect();
    assert_eq!(far.len(), 1, "{}", diagnostics.summary());
    assert_eq!(far[0].severity, Severity::Hard);
    assert!(!diagnostics.passes_hard_rules());
    // The message names both numbers, so the panel does not have to reconstruct them.
    assert!(far[0].measured.unwrap() > far[0].limit.unwrap());
    assert!(far[0].message.contains("permitted"), "{}", far[0].message);
}

#[test]
fn a_compliant_plan_raises_no_hard_diagnostic() {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    // Inside the setbacks on every side, and small enough for the coverage limit.
    let inset = 2_500;
    let seq = session_with(&derived, walls_at(inset, inset, 4_000, 5_000));
    let d = check(seq.document(), &rules);
    assert!(d.passes_hard_rules(), "{}", d.summary());
}

#[test]
fn the_rules_crate_cannot_reach_commit_validation() {
    // The separation is structural, not a convention: `tri-commit` is not a dependency
    // of `tri-rules`, so no bylaw check can reach `commit::validate` even by accident.
    // This reads the manifest because that is where the guarantee actually lives.
    let manifest = include_str!("../Cargo.toml");
    let deps = manifest
        .split("[dependencies]")
        .nth(1)
        .and_then(|s| s.split("[dev-dependencies]").next())
        .expect("a dependencies section");
    assert!(
        !deps.contains("tri-commit"),
        "tri-rules must not depend on tri-commit — bylaw failures must never be able to \
         block a commit. See the crate docs."
    );
}

// ---------------------------------------------------------------------------
// Rules are data
// ---------------------------------------------------------------------------

#[test]
fn the_bundled_ruleset_parses_and_declares_its_authority() {
    let r = RuleSet::bbmp_plotted_residential();
    assert_eq!(r.authority.name, "BBMP");
    assert!(!r.authority.effective.is_empty());
    assert!(!r.disclaimer.is_empty());
    assert!(!r.bands.is_empty());
}

#[test]
fn an_unreviewed_ruleset_says_so_wherever_it_is_shown() {
    // The PRD's named risk is bylaw interpretation being wrong. Presenting unreviewed
    // numbers as authoritative is how that risk turns into a bad building.
    let r = RuleSet::bbmp_plotted_residential();
    assert!(
        r.authority.reviewed_by.is_none(),
        "update this test when reviewed"
    );
    assert!(
        r.provenance_line().contains("NOT reviewed"),
        "{}",
        r.provenance_line()
    );
    assert!(r.authority.notes.to_lowercase().contains("placeholder"));
}

#[test]
fn no_bylaw_number_is_hardcoded_in_rust() {
    // Rules are data (PRD 4.6, applied to bylaws). The same mechanical check the layer
    // classifier gets.
    for (name, src) in [
        ("checks.rs", include_str!("../src/checks.rs")),
        ("ruleset.rs", include_str!("../src/ruleset.rs")),
        ("diagnostic.rs", include_str!("../src/diagnostic.rs")),
    ] {
        for forbidden in ["1750", "2000mm", "setback_front_mm =", "0.65", "sq yd"] {
            assert!(
                !src.contains(forbidden),
                "{name} hardcodes {forbidden:?}; bylaw values belong in the ruleset file"
            );
        }
    }
}

#[test]
fn bands_are_selected_by_plot_area() {
    let r = RuleSet::bbmp_plotted_residential();
    let small = r.band_for(80).unwrap();
    let large = r.band_for(500).unwrap();
    assert!(
        large.front_mm > small.front_mm,
        "bigger plots set back further"
    );
    // The top band is open-ended, so no plot can fall off the end of the table.
    assert!(r.band_for(100_000).is_ok());
}

// ---------------------------------------------------------------------------
// Derivation fills tier 2 with sourced values
// ---------------------------------------------------------------------------

#[test]
fn derivation_marks_tier_two_inferred_and_names_the_clause() {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();

    assert!(derived.is_derived());
    for (field, prov, reason) in [
        (
            "far",
            derived.far_permitted_x1000.provenance(),
            derived.far_permitted_x1000.reason(),
        ),
        (
            "front",
            derived.setback_front.provenance(),
            derived.setback_front.reason(),
        ),
        (
            "coverage",
            derived.ground_coverage_permitted_x100.provenance(),
            derived.ground_coverage_permitted_x100.reason(),
        ),
    ] {
        assert_eq!(prov, Provenance::Inferred, "{field} should be inferred");
        assert!(
            reason.contains("BBMP"),
            "{field} does not name its authority: {reason}"
        );
        assert!(
            reason.contains("2024"),
            "{field} does not name its revision date: {reason}"
        );
    }
}

#[test]
fn derivation_leaves_tier_one_and_tier_three_alone() {
    let rules = RuleSet::bbmp_plotted_residential();
    let before = brief();
    let after = derive_parameters(&before, &rules).unwrap();

    assert_eq!(after.plot_width, before.plot_width);
    assert_eq!(after.bedrooms, before.bedrooms);
    assert_eq!(after.external_wall, before.external_wall);
    assert_eq!(after.external_wall.provenance(), Provenance::Assumed);
}

#[test]
fn an_underived_brief_is_flagged_rather_than_silently_checked() {
    let rules = RuleSet::bbmp_plotted_residential();
    let seq = session_with(&brief(), walls(9144, 12192));
    let d = check(seq.document(), &rules);
    assert!(d
        .diagnostics
        .iter()
        .any(|x| x.rule_id == "params.not-derived"));
    // And it must NOT claim the plan passes: unchecked is not the same as compliant.
    assert!(
        !d.diagnostics.is_empty(),
        "an underived brief reported a clean bill of health"
    );
}

#[test]
fn a_document_with_no_brief_produces_no_diagnostics() {
    // An imported DXF has no parameter set and is not expected to.
    let rules = RuleSet::bbmp_plotted_residential();
    let mut seq = Sequencer::default();
    seq.submit(Commit::new(
        seq.head(),
        Author::system("importer"),
        walls(5000, 5000),
        "imported",
    ))
    .unwrap();
    assert!(check(seq.document(), &rules).diagnostics.is_empty());
}

// ---------------------------------------------------------------------------
// Diagnostics are derived, and only frozen on request
// ---------------------------------------------------------------------------

#[test]
fn checking_does_not_change_the_document() {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let seq = session_with(&derived, walls(9144, 12192));
    let before = seq.document().hash();
    let _ = check(seq.document(), &rules);
    assert_eq!(
        seq.document().hash(),
        before,
        "check() mutated the document"
    );
}

#[test]
fn diagnostics_can_be_frozen_into_the_document_on_request() {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let mut seq = session_with(&derived, walls(9144, 12192));

    let found = check(seq.document(), &rules);
    assert!(!found.diagnostics.is_empty());

    let ops = tri_rules::attach(&found);
    seq.submit(Commit::new(
        seq.head(),
        Author::system("compliance"),
        ops,
        "freeze the compliance report",
    ))
    .expect("attaching diagnostics is a valid commit");

    let stored = seq
        .document()
        .iter_with(tri_doc::ComponentKey::Custom(tri_rules::TYPE_NAME.into()))
        .count();
    assert_eq!(stored, found.diagnostics.len());
}

// ---------------------------------------------------------------------------
// The rest of tier 2
// ---------------------------------------------------------------------------

#[test]
fn the_staircase_footprint_comes_from_the_riser_and_tread_in_the_ruleset() {
    let rules = RuleSet::bbmp_plotted_residential();
    let d = derive_parameters(&brief(), &rules).unwrap();

    assert_eq!(d.staircase_footprint_mm2.provenance(), Provenance::Inferred);
    assert!(d.staircase_footprint_mm2.get() > 0, "G+1 needs a staircase");
    let why = d.staircase_footprint_mm2.reason();
    // The reason has to let a reviewer re-do the sum.
    assert!(why.contains("risers"), "{why}");
    assert!(why.contains("165"), "{why}");
    assert!(why.contains("280"), "{why}");
}

#[test]
fn a_single_storey_needs_no_staircase() {
    let rules = RuleSet::bbmp_plotted_residential();
    let mut b = brief();
    b.floors = tri_doc::Tracked::measured(1u8, "single storey");
    let d = derive_parameters(&b, &rules).unwrap();
    assert_eq!(d.staircase_footprint_mm2.get(), 0);
    assert!(d.staircase_footprint_mm2.reason().contains("single storey"));
}

#[test]
fn water_storage_is_sized_from_occupancy_and_says_how() {
    let rules = RuleSet::bbmp_plotted_residential();
    let d = derive_parameters(&brief(), &rules).unwrap();

    // 3 bedrooms x 2 people x 135 l/day = 810 l/day, 40% overhead.
    assert_eq!(d.overhead_tank_litres.get(), 324);
    assert_eq!(d.sump_litres.get(), 486);
    assert_eq!(d.overhead_tank_litres.provenance(), Provenance::Inferred);
    let why = d.overhead_tank_litres.reason();
    assert!(why.contains("6 occupants"), "{why}");
    assert!(why.contains("135"), "{why}");
}

#[test]
fn the_room_programme_floors_every_room_at_the_ruleset_minimum() {
    // A tight plot should produce small-but-legal rooms, never illegal ones.
    let rules = RuleSet::bbmp_plotted_residential();
    let d = derive_parameters(&brief(), &rules).unwrap();
    let program = tri_rules::derive_program(&d, &rules);

    assert_eq!(program.len(), 4, "living, bedrooms, kitchen, toilets");
    for target in &program {
        let Some(min) = rules.minimum_for(&target.kind) else {
            continue;
        };
        assert!(
            target.target_area_mm2 >= min.min_area_mm2,
            "{} target {:.2} m² is below the {:.2} m² minimum",
            target.kind,
            target.target_area_mm2 as f64 / 1_000_000.0,
            min.min_area_mm2 as f64 / 1_000_000.0
        );
        assert!(!target.reason.is_empty());
    }

    let bedrooms = program.iter().find(|t| t.kind == "bedroom").unwrap();
    assert_eq!(bedrooms.count, 3);
}

#[test]
fn a_programme_forced_to_a_minimum_says_so() {
    // The interesting case: the share of a small plot lands under the minimum, so the
    // minimum applies — and the reason has to name both numbers or the architect cannot
    // tell a tight plan from a generous one.
    let rules = RuleSet::bbmp_plotted_residential();
    let small = tri_params::Brief::new(
        tri_params::Units::Feet,
        20.0,
        30.0,
        tri_params::Orientation::North,
        4,
        1,
        0,
    )
    .into_parameters()
    .unwrap();
    let d = derive_parameters(&small, &rules).unwrap();
    let program = tri_rules::derive_program(&d, &rules);

    let floored: Vec<_> = program
        .iter()
        .filter(|t| t.reason.contains("minimum applies"))
        .collect();
    assert!(
        !floored.is_empty(),
        "a 4BHK on 20x30ft should hit a minimum somewhere: {program:#?}"
    );
    assert!(floored[0].reason.contains("below the"));
}

#[test]
fn the_programme_is_not_stored_on_the_document() {
    // It is an intermediate the generator consumes. Storing it as well as the rooms it
    // produced would mean two versions of the same number that can disagree.
    let src = include_str!("../src/checks.rs");
    let program_fn = src.split("pub fn derive_program").nth(1).unwrap();
    let body = program_fn.split("\n/// ").next().unwrap();
    assert!(!body.contains("Op::"), "derive_program must not emit ops");
}

// ---------------------------------------------------------------------------
// F3: the report the panel renders
// ---------------------------------------------------------------------------

fn generated_report() -> tri_rules::ComplianceReport {
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let seq = session_with(&derived, walls_at(2_500, 2_500, 4_000, 5_000));
    tri_rules::report(seq.document(), &rules)
}

#[test]
fn the_panel_shows_what_the_prd_asks_for() {
    let r = generated_report();
    let ids: Vec<&str> = r.metrics.iter().map(|m| m.id.as_str()).collect();
    for required in [
        "far",
        "built_up",
        "built_up_per_floor",
        "ground_coverage",
        "setback_front",
        "setback_rear",
        "setback_left",
        "setback_right",
    ] {
        assert!(ids.contains(&required), "the panel is missing {required}");
    }
}

#[test]
fn every_displayed_number_is_traceable() {
    // The done-when. A number without a reason is a number an architect cannot sign off.
    let r = generated_report();
    assert!(!r.metrics.is_empty());
    for m in &r.metrics {
        assert!(
            !m.reason.trim().is_empty(),
            "{} is shown with no explanation of where it came from",
            m.id
        );
        assert!(!m.label.is_empty());
    }
}

#[test]
fn a_limit_nearly_reached_reads_differently_from_one_comfortably_met() {
    // An architect wants to know a wall is about to put them over *before* they drag it.
    use tri_rules::Standing;
    assert_eq!(
        generated_report()
            .metrics
            .iter()
            .filter(|m| m.standing == Standing::Over)
            .count(),
        0,
        "the compliant fixture reports a breach"
    );

    // And the over case is reachable.
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let over = session_with(&derived, walls(9_144, 12_192));
    let r = tri_rules::report(over.document(), &rules);
    assert!(
        r.metrics.iter().any(|m| m.standing == Standing::Over),
        "building to the plot edge should exceed something"
    );
    assert!(!r.passes_hard_rules());
}

#[test]
fn hard_failures_name_the_geometry_so_the_canvas_can_colour_it() {
    // "Hard failures render on the offending geometry, not in a separate error list."
    // The report has to say which entity, or the canvas cannot.
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let seq = session_with(&derived, walls(9_144, 12_192));
    let r = tri_rules::report(seq.document(), &rules);

    assert!(!r.failing_entities().is_empty(), "nothing to colour red");
    let (hard, _, _) = r.counts();
    assert!(hard > 0);
}

#[test]
fn a_soft_failure_is_separable_from_a_hard_one() {
    // Amber and red are different colours because they mean different things: one is a
    // judgement the architect can overrule, the other is a bylaw.
    use tri_doc::Op;
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let mut seq = session_with(&derived, walls_at(2_500, 2_500, 4_000, 5_000));

    // A legal but unfurnishable room: 13 m² clears the living-room minimum, and 13 x 1 m
    // is a corridor.
    seq.submit(Commit::new(
        seq.head(),
        Author::system("test"),
        vec![
            Op::RegisterType {
                def: tri_rules::room::type_definition(),
            },
            Op::CreateEntity {
                components: vec![tri_doc::Component::Custom {
                    type_name: tri_rules::ROOM_TYPE_NAME.to_string(),
                    data: tri_rules::room::to_data(
                        "Long room",
                        "living",
                        13_000_000,
                        Length::from_mm(13_000),
                        Length::from_mm(1_000),
                        "deliberately awkward, for this test",
                    ),
                }],
            },
        ],
        "an awkward room",
    ))
    .expect("an awkward room is structurally valid and must commit");

    let r = tri_rules::report(seq.document(), &rules);
    let soft: Vec<_> = r
        .diagnostics
        .iter()
        .filter(|d| d.severity == Severity::Soft)
        .collect();
    assert!(
        soft.iter().any(|d| d.rule_id == "proportion.awkward"),
        "a 13:1 room should raise a soft warning: {:#?}",
        r.diagnostics
    );
    assert!(!r.warning_entities().is_empty(), "nothing to colour amber");
}

#[test]
fn the_report_carries_its_authority_and_says_it_is_unverified() {
    let r = generated_report();
    assert!(r.authority.contains("BBMP"));
    assert!(r.effective.starts_with("2024"));
    assert!(r.disclaimer.to_lowercase().contains("indicative"));
    assert!(
        r.disclaimer
            .to_lowercase()
            .contains("sanctioning authority"),
        "{}",
        r.disclaimer
    );
    assert!(
        !r.reviewed,
        "update this when an architect has signed the ruleset off"
    );
}

#[test]
fn far_is_keyed_on_the_road_width() {
    // The PRD says FAR by road width, and it is the parameter most likely to be wrong on
    // a plot the architect has not visited.
    let rules = RuleSet::bbmp_plotted_residential();
    let narrow = tri_params::Brief {
        road_width_m: Some(6.0),
        ..tri_params::Brief::new(
            tri_params::Units::Feet,
            30.0,
            40.0,
            tri_params::Orientation::North,
            3,
            2,
            1,
        )
    }
    .into_parameters()
    .unwrap();
    let wide = tri_params::Brief {
        road_width_m: Some(15.0),
        ..tri_params::Brief::new(
            tri_params::Units::Feet,
            30.0,
            40.0,
            tri_params::Orientation::North,
            3,
            2,
            1,
        )
    }
    .into_parameters()
    .unwrap();

    let n = derive_parameters(&narrow, &rules).unwrap();
    let w = derive_parameters(&wide, &rules).unwrap();
    assert!(
        w.far_permitted_x1000.get() > n.far_permitted_x1000.get(),
        "a wider road should permit more floor area"
    );
    assert!(
        n.far_permitted_x1000.reason().contains("6 m road"),
        "{}",
        n.far_permitted_x1000.reason()
    );
}

#[test]
fn a_corridor_is_not_warned_about_for_being_long_and_thin() {
    // The shape is the room. F4's 3BHK produced a genuine 9021 x 1050 corridor and the
    // proportion check called it hard to furnish — advice with no action behind it, and
    // an amber highlight on a wall that is exactly right. A soft diagnostic an architect
    // learns to ignore costs more than it saves, because the next one gets ignored too.
    use tri_doc::Op;
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief(), &rules).unwrap();
    let mut seq = session_with(&derived, walls_at(2_500, 2_500, 4_000, 5_000));

    seq.submit(Commit::new(
        seq.head(),
        Author::system("test"),
        vec![
            Op::RegisterType {
                def: tri_rules::room::type_definition(),
            },
            Op::CreateEntity {
                components: vec![tri_doc::Component::Custom {
                    type_name: tri_rules::ROOM_TYPE_NAME.to_string(),
                    data: tri_rules::room::to_data(
                        "Corridor",
                        "corridor",
                        9_472_050,
                        Length::from_mm(9_021),
                        Length::from_mm(1_050),
                        "the side corridor of 3bhk.side-corridor.v1",
                    ),
                }],
            },
        ],
        "a corridor",
    ))
    .expect("a corridor is structurally valid");

    let r = tri_rules::report(seq.document(), &rules);
    assert!(
        !r.diagnostics
            .iter()
            .any(|d| d.rule_id == "proportion.awkward"),
        "an 8.6:1 corridor was flagged as awkward: {:#?}",
        r.diagnostics
    );
}
