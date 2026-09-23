//! F1's tests.
//!
//! The PRD's done-when: "a fixed parameter set produces a dimensioned plan rendered in
//! PlanView2d, generated entirely through commits, with a test asserting the count of
//! Assumed values is non-zero and none are silently Measured."

use tri_commit::{Author, Sequencer, UserId};
use tri_doc::{Component, ComponentKey, Length, Provenance};
use tri_gen::{apply, plan, solve, GenError, ROOM_TYPE_NAME};

/// The template a 2BHK brief lands on. F4 turned `TEMPLATE_ID` into a library, so the
/// tests below name the one they are about rather than the only one there was.
const TEMPLATE_ID: &str = "2bhk.front-living.v1";
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

/// A 30 x 40 ft plot, 2BHK, G+1 — the fixed parameter set the phase is defined against.
fn derived_brief() -> ParameterSet {
    let raw = ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        2,
        2,
        1,
    )
    .unwrap();
    derive_parameters(&raw, &RuleSet::bbmp_plotted_residential()).expect("30x40 is in a band")
}

fn generated() -> Sequencer {
    let mut seq = Sequencer::default();
    let p = plan(&derived_brief(), &RuleSet::bbmp_plotted_residential())
        .expect("the template fits a 30x40 plot");
    apply(&mut seq, &p, Author::Human(UserId("amitesh".into())))
        .expect("generation commits cleanly");
    seq
}

/// Source with comments removed.
///
/// The structural tests below grep the source for things that must not appear in it.
/// Grepping raw source catches the prose explaining why they must not appear, so a
/// correct file fails its own test — which is how these two first went red. Naive about
/// `//` inside string literals; there are none in these files.
fn code_only(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut chars = src.chars().peekable();
    let mut in_block = false;
    while let Some(c) = chars.next() {
        if in_block {
            if c == '*' && chars.peek() == Some(&'/') {
                chars.next();
                in_block = false;
            }
            continue;
        }
        match (c, chars.peek()) {
            ('/', Some('/')) => {
                for n in chars.by_ref() {
                    if n == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            ('/', Some('*')) => {
                chars.next();
                in_block = true;
            }
            _ => out.push(c),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// I1 — everything arrives through commits
// ---------------------------------------------------------------------------

#[test]
fn generation_happens_entirely_through_commits() {
    let seq = generated();
    assert_eq!(seq.history().len(), 3, "layers, geometry, extrude");
    for c in seq.history().iter() {
        assert!(c.verify_id(), "a commit failed its integrity check");
        assert!(c.message().contains(TEMPLATE_ID));
    }

    // Replaying from empty reproduces the document exactly, which is only true if nothing
    // reached the document by any other route.
    let mut replay = Sequencer::default();
    for c in seq.history().iter() {
        replay.submit(c.clone()).expect("replay");
    }
    assert_eq!(replay.document().hash(), seq.document().hash());
}

#[test]
fn the_gen_crate_has_no_way_to_mutate_a_document() {
    // I1 made structural: there is no `&mut Document` in this crate, so there is no
    // side channel to take even by accident.
    for (name, src) in [
        ("plan.rs", include_str!("../src/plan.rs")),
        ("template.rs", include_str!("../src/template.rs")),
        ("lib.rs", include_str!("../src/lib.rs")),
    ] {
        let src = code_only(src);
        assert!(
            !src.contains("&mut Document"),
            "{name} takes a &mut Document; generation must emit ops instead"
        );
    }
}

#[test]
fn planning_touches_nothing() {
    // I7: the plan is computed in full before anything is applied, so it can be shown
    // for approval.
    let seq = Sequencer::default();
    let before = seq.document().hash();
    let p = plan(&derived_brief(), &RuleSet::bbmp_plotted_residential()).unwrap();
    assert!(p.wall_count() > 0);
    assert_eq!(seq.document().hash(), before);
    assert_eq!(seq.history().len(), 0);
}

#[test]
fn the_approval_summary_names_the_assumptions() {
    // The architect is being asked to accept the guesses, not the walls, so the guesses
    // are what the card leads with.
    let p = plan(&derived_brief(), &RuleSet::bbmp_plotted_residential()).unwrap();
    let text = p.approval_summary();
    assert!(text.contains("2BHK"), "{text}");
    assert!(text.contains("assumed by the template"), "{text}");
    assert!(text.contains("main_door"), "{text}");
}

// ---------------------------------------------------------------------------
// The done-when: provenance is honest
// ---------------------------------------------------------------------------

#[test]
fn assumed_values_are_present_and_no_derived_value_claims_to_be_measured() {
    // The PRD's done-when, stated precisely.
    //
    // "Nothing is silently Measured" is about *derived* values. The brief itself is a
    // different case: the architect really did type 30 x 40 ft, and recording that as
    // anything other than Measured would be its own lie. So the rule is per-entity — the
    // parameter set may hold Measured tier-1 values; nothing the template produced may.
    let seq = generated();
    let params_key = ComponentKey::Custom(tri_params::TYPE_NAME.to_string());

    let mut assumed = 0;
    let mut inferred = 0;
    let mut brief_measured = 0;
    let mut derived_measured = Vec::new();

    for (id, set) in seq.document().iter_entities() {
        let is_brief = set.has(&params_key);
        for (_, c) in set.iter() {
            for (field, prov, reason) in c.provenance_records() {
                assert!(
                    !reason.trim().is_empty(),
                    "{id:?}.{field} has provenance with no reason"
                );
                match prov {
                    Provenance::Assumed => assumed += 1,
                    Provenance::Inferred => inferred += 1,
                    Provenance::Measured if is_brief => brief_measured += 1,
                    Provenance::Measured => {
                        derived_measured.push(format!("{id:?}.{field}: {reason}"))
                    }
                }
            }
        }
    }

    assert!(assumed > 0, "a generated plan with no assumptions is lying");
    assert!(
        inferred > 0,
        "the setbacks that shaped this plan came from a ruleset and should be Inferred"
    );
    assert!(
        brief_measured > 0,
        "the brief lost the values the architect entered"
    );

    // The only Measured value derived geometry may hold is one that follows by
    // definition rather than by choice — a door sill sits on the floor.
    for m in &derived_measured {
        assert!(
            m.contains("by definition"),
            "a generated value claims to be measured: {m}"
        );
    }
    println!(
        "assumed {assumed}, inferred {inferred}, brief-measured {brief_measured}, \
         derived-measured {}",
        derived_measured.len()
    );
}

#[test]
fn a_room_area_says_it_came_from_the_template() {
    let seq = generated();
    let key = ComponentKey::Custom(ROOM_TYPE_NAME.to_string());
    let rooms: Vec<_> = seq.document().iter_with(key.clone()).collect();
    assert_eq!(rooms.len(), 6, "the 2BHK template lays out six rooms");

    let (_, set) = rooms[0];
    let records = set.get(&key).unwrap().provenance_records();
    let area = records
        .iter()
        .find(|(f, _, _)| f == "area_mm2")
        .expect("room area is tracked");
    assert_eq!(area.1, Provenance::Assumed);
    assert!(area.2.contains(TEMPLATE_ID), "{}", area.2);
}

#[test]
fn wall_thickness_keeps_the_provenance_the_parameter_set_gave_it() {
    // The template does not re-decide a dimension the brief already settled.
    let seq = generated();
    let p = derived_brief();
    for (_, set) in seq.document().iter_with(ComponentKey::WallProfile) {
        let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
            continue;
        };
        assert_eq!(w.thickness.provenance(), p.external_wall.provenance());
        assert!(w.thickness.reason().contains("default"));
    }
}

// ---------------------------------------------------------------------------
// Stages 1-3 are skipped, 4-7 are reused
// ---------------------------------------------------------------------------

#[test]
fn generated_geometry_is_not_healed_or_paired() {
    // Running the messy path over clean input is not just wasted work: `pair_walls`
    // would look at two partitions 300mm apart and call them one 300mm wall.
    let src = code_only(include_str!("../src/plan.rs"));
    assert!(
        !src.contains("heal"),
        "gen must not heal generated geometry"
    );
    assert!(
        !src.contains("pair_walls"),
        "gen must not pair generated geometry"
    );
    assert!(
        src.contains("BuildParams::clean()"),
        "gen should reuse the pipeline with stages 1-3 skipped, not reimplement it"
    );
}

#[test]
fn gen_contains_no_extrusion_code_of_its_own() {
    // "Do NOT write new extrusion code." Stages 4-7 are consumed, not copied.
    for (name, src) in [
        ("plan.rs", include_str!("../src/plan.rs")),
        ("template.rs", include_str!("../src/template.rs")),
    ] {
        let src = code_only(src);
        for forbidden in ["fn extrude", "fn tessellate", "Mesh::", "triangle("] {
            assert!(
                !src.contains(forbidden),
                "{name} reimplements {forbidden:?}; use tri_solid"
            );
        }
    }
}

#[test]
fn the_walls_extrude_to_closed_solids() {
    let seq = generated();
    let solids: Vec<_> = seq
        .document()
        .iter_with(ComponentKey::Solid3d)
        .filter_map(|(_, s)| match s.get(&ComponentKey::Solid3d) {
            Some(Component::Solid3d(s)) => Some(s.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(solids.len(), 9, "four external plus five internal walls");
    assert!(solids.iter().all(|s| !s.indices.is_empty()));
}

#[test]
fn the_main_door_is_cut_out_of_the_front_wall() {
    // Proof that stage 6 consumed the generated opening: the front wall's solid is
    // lighter than an identical wall without one.
    use tri_solid::{wall_with_openings, OpeningCut};
    let p = derived_brief();
    let (_, t) = solve(&p, &RuleSet::bbmp_plotted_residential()).unwrap();
    let front = &t.walls[0];
    let door = p.main_door.get();

    let (plain, _) = wall_with_openings(
        &[front.a, front.b],
        p.external_wall.get(),
        Length::ZERO,
        p.floor_to_floor.get(),
        &[],
    );
    let (with_door, report) = wall_with_openings(
        &[front.a, front.b],
        p.external_wall.get(),
        Length::ZERO,
        p.floor_to_floor.get(),
        &[OpeningCut {
            position: t.entry_offset,
            width: door.width,
            height: door.height,
            sill: Length::ZERO,
        }],
    );
    assert_eq!(report.applied, 1, "{:?}", report.skipped);
    assert!(with_door.is_closed());
    let removed = plain.volume_m3() - with_door.volume_m3();
    let expected = door.width.as_mm_f64() / 1000.0 * door.height.as_mm_f64() / 1000.0
        * p.external_wall.get().as_mm_f64()
        / 1000.0;
    assert!(
        (removed - expected).abs() < 0.001,
        "expected {expected:.4} m3 removed, got {removed:.4}"
    );
}

// ---------------------------------------------------------------------------
// Determinism and refusal
// ---------------------------------------------------------------------------

#[test]
fn the_same_parameters_always_produce_the_same_plan() {
    // "An architect can reproduce and trust a result" — the PRD's justification for a
    // deterministic solver, tested with the hashing machinery M1 already built.
    assert_eq!(generated().document().hash(), generated().document().hash());
}

#[test]
fn generation_refuses_an_underived_brief() {
    let raw = ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        2,
        2,
        1,
    )
    .unwrap();
    let err = plan(&raw, &RuleSet::bbmp_plotted_residential()).expect_err("setbacks are unknown");
    assert!(matches!(err, GenError::NotDerived));
    assert!(err.to_string().contains("not a conservative plan"));
}

// F1's refusal test lived here. It is gone rather than ported, because it carried an
// `Ok(_) => {}` arm that made it pass whether the plot was refused or not — vacuous the
// moment the template changed. `tests/library.rs` refuses five plots by name and asserts
// the shortfall is quoted, with no escape hatch.

#[test]
fn the_generated_wall_faces_sit_on_the_building_line_not_past_it() {
    // A setback limits built form. Putting the centreline on the building line pushes
    // half the wall beyond it, which is what the first version of this template did — in
    // breach of all four setbacks by 115mm, on every plan, unnoticed until the compliance
    // check arrived. The centreline is inset by half the external wall.
    let p = derived_brief();
    let (_, t) = solve(&p, &RuleSet::bbmp_plotted_residential()).unwrap();
    let face = p.external_wall.get().as_um() / 2;

    assert_eq!(
        t.envelope_min.x.as_um(),
        p.setback_left.get().as_um() + face
    );
    assert_eq!(
        t.envelope_min.y.as_um(),
        p.setback_front.get().as_um() + face
    );
    assert_eq!(
        t.envelope_max.x.as_um(),
        p.plot_width.get().as_um() - p.setback_right.get().as_um() - face
    );
    assert_eq!(
        t.envelope_max.y.as_um(),
        p.plot_depth.get().as_um() - p.setback_rear.get().as_um() - face
    );

    // Stated the other way round, which is the way an inspector reads it: no outer face
    // is outside the building line.
    assert_eq!(
        t.envelope_min.x.as_um() - face,
        p.setback_left.get().as_um()
    );
}

// ---------------------------------------------------------------------------
// It renders
// ---------------------------------------------------------------------------

#[test]
fn the_generated_plan_renders_in_plan_view() {
    use tri_render::camera::{Camera, ViewMode};
    use tri_render::scene;

    let seq = generated();
    let doc = seq.document();
    let bounds = scene::document_bounds(doc).expect("the plan has extents");
    let (z0, z1) = scene::document_height(doc);
    let camera = Camera::fit_for(bounds, z0, z1, 900, 600, ViewMode::PlanView2d);

    let s = scene::build(doc, camera, ViewMode::PlanView2d);
    assert!(!s.lines.is_empty(), "nothing to draw");
    assert!(s.drawn.len() >= 9, "only {} entities drawn", s.drawn.len());

    match pollster::block_on(tri_render::Renderer::headless()) {
        Ok(r) => {
            let img = r.render_to_image(&s, 900, 600).expect("render");
            let ink = img.ink_fraction(s.background_srgb(), 4);
            assert!(ink > 0.002, "the plan rendered blank ({ink})");
            assert!(ink < 0.6, "the plan is a solid block ({ink})");
        }
        Err(e) => {
            assert!(
                std::env::var_os("TRIMENSION_REQUIRE_GPU").is_none(),
                "TRIMENSION_REQUIRE_GPU is set but no adapter is available: {e}"
            );
            eprintln!("SKIPPING GPU render: {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// The generated plan is checkable
// ---------------------------------------------------------------------------

#[test]
fn a_generated_plan_passes_the_hard_rules_it_was_generated_against() {
    // The PRD's compliance target is 100% of shown plans passing hard rules. The
    // generator lays out inside the setbacks the ruleset gave it, so the plan it produces
    // should satisfy the same ruleset — if it does not, the generator and the checker
    // disagree about the bylaw, which is worse than either being wrong alone.
    let rules = RuleSet::bbmp_plotted_residential();
    let seq = generated();

    let d = tri_rules::check(seq.document(), &rules);
    assert!(
        d.passes_hard_rules(),
        "the generator produced a plan its own ruleset rejects: {}\n{:#?}",
        d.summary(),
        d.hard()
    );
}

#[test]
fn the_brief_travels_with_the_plan() {
    // Without this the compliance panel finds no parameter set and reports a clean bill
    // of health on a plan it never checked.
    let seq = generated();
    let (_, stored) = tri_params::component::find(seq.document())
        .expect("the document carries the brief it was generated from");
    assert!(stored.is_derived());
    assert_eq!(stored.bedrooms.get(), 2);
    assert_eq!(stored.setback_front, derived_brief().setback_front);
}

#[test]
fn every_generated_room_meets_the_ruleset_minimum() {
    // Directly serves the PRD's compliance target: 100% of shown plans pass hard rules.
    // It is also the guard the template needed — the first version of it produced a
    // 4.9 m² kitchen next to a 6.7 m² bathroom, which no test caught because nothing was
    // checking room sizes against anything.
    let rules = RuleSet::bbmp_plotted_residential();
    let seq = generated();
    let rooms = tri_rules::room::all(seq.document());
    assert_eq!(rooms.len(), 6);

    for room in &rooms {
        let Some(min) = rules.minimum_for(&room.kind) else {
            continue;
        };
        assert!(
            room.area_mm2 >= min.min_area_mm2,
            "{} is {:.2} m², below the {:.2} m² minimum for a {}",
            room.name,
            room.area_mm2 as f64 / 1_000_000.0,
            min.min_area_mm2 as f64 / 1_000_000.0,
            room.kind
        );
        let short = room.width.min(room.depth);
        assert!(
            short.as_um() >= min.min_width_mm * 1_000,
            "{} is {:.0}mm across, below the {}mm minimum",
            room.name,
            short.as_mm_f64(),
            min.min_width_mm
        );
    }
}

#[test]
fn a_room_below_the_minimum_is_reported_rather_than_hidden() {
    // Confirms the check can actually fail — a compliance rule that has never gone red
    // is not known to work.
    use tri_doc::component::Component;
    use tri_doc::Op;

    let rules = RuleSet::bbmp_plotted_residential();
    let mut seq = generated();
    let ops = vec![Op::CreateEntity {
        components: vec![Component::Custom {
            type_name: tri_rules::ROOM_TYPE_NAME.to_string(),
            data: tri_rules::room::to_data(
                "Box room",
                "bedroom",
                2_000_000, // 2 m²
                Length::from_mm(1_400),
                Length::from_mm(1_430),
                "deliberately undersized, for this test",
            ),
        }],
    }];
    seq.submit(tri_commit::Commit::new(
        seq.head(),
        Author::Human(UserId("test".into())),
        ops,
        "add an undersized room",
    ))
    .expect("an undersized room is structurally valid and must still commit");

    let d = tri_rules::check(seq.document(), &rules);
    let hits: Vec<_> = d
        .diagnostics
        .iter()
        .filter(|x| x.rule_id.starts_with("room.min-"))
        .collect();
    assert_eq!(
        hits.len(),
        2,
        "expected both area and width: {:#?}",
        d.diagnostics
    );
    assert!(hits.iter().all(|h| h.severity == tri_rules::Severity::Hard));
    assert!(hits[0].message.contains("Box room"));
    assert!(!d.passes_hard_rules());
}

#[test]
fn rebuilding_a_generated_plan_does_not_replace_its_thicknesses() {
    // The messy preparation heals and pairs, which is right for an imported drawing and
    // destructive for a generated one: each wall has nothing to pair with, falls back to
    // the rule set's 100mm default, and the thickness the brief specified disappears.
    // Nothing errors — the plan just quietly becomes a different building.
    use tri_solid::pipeline::{build_solids, BuildParams};

    let mut seq = generated();
    let before: Vec<i64> = seq
        .document()
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(_, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => Some(w.thickness.get().as_um()),
            _ => None,
        })
        .collect();
    assert!(before.contains(&230_000), "expected 230mm walls");

    let (ops, _) = build_solids(seq.document(), BuildParams::clean());
    seq.submit(tri_commit::Commit::new(
        seq.head(),
        Author::system("rebuild"),
        ops,
        "rebuild the solids",
    ))
    .unwrap();

    let after: Vec<i64> = seq
        .document()
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(_, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => Some(w.thickness.get().as_um()),
            _ => None,
        })
        .collect();
    assert_eq!(
        before, after,
        "a clean rebuild changed the wall thicknesses"
    );
}
