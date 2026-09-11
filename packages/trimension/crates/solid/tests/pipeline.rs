//! M4's tests (PRD §6, Prompt 5).
//!
//! "Done when: clean fixture extrudes correctly with openings; messy fixture extrudes
//! with honest provenance; both render in Perspective3d mode."

use tri_commit::{Author, Commit, Sequencer};
use tri_doc::component::{Opening, OpeningKind, Solid3d, WallProfile};
use tri_doc::{
    validate_and_apply, Component, ComponentKey, Document, EntityId, Length, Op, Point2,
    Provenance, Tracked,
};
use tri_geom2d::heal::{self, Chain};
use tri_geom2d::pair::{self, PairParams};
use tri_geom2d::profile;
use tri_import_dxf::{import, DxfImporter, RuleSet};
use tri_solid::extrude::OpeningCut;
use tri_solid::pipeline::{build_solids, BuildParams, BuildReport};
use tri_solid::{wall_with_openings, Mesh};

const CLEAN: &[u8] = include_bytes!("../../../fixtures/dxf/clean-plan.dxf");
const MESSY: &[u8] = include_bytes!("../../../fixtures/dxf/messy-plan.dxf");

fn p(x: i64, y: i64) -> Point2 {
    Point2::new(Length::from_mm(x), Length::from_mm(y))
}

/// Import a fixture, then run the 2D→3D build, committing the result.
fn build(bytes: &[u8], name: &str) -> (Sequencer, BuildReport) {
    let mut seq = Sequencer::default();
    import(
        &mut seq,
        &DxfImporter::default(),
        bytes,
        name,
        &RuleSet::ncs_default(),
    )
    .unwrap();

    let (ops, report) = build_solids(seq.document(), BuildParams::default());
    if !ops.is_empty() {
        seq.submit(Commit::new(
            seq.head(),
            Author::system("2d-to-3d"),
            ops,
            format!("{name}: extrude walls"),
        ))
        .expect("the build must produce a valid commit");
    }
    (seq, report)
}

// ---------------------------------------------------------------------------
// Stage 1: healing
// ---------------------------------------------------------------------------

#[test]
fn healing_snaps_endpoints_within_tolerance_and_reports_the_move() {
    let chains = vec![
        Chain {
            points: vec![p(0, 0), p(5000, 0)],
            closed: false,
            origin: 0,
        },
        // Starts 3mm away from where the first one ended.
        Chain {
            points: vec![p(5003, 0), p(5003, 4000)],
            closed: false,
            origin: 1,
        },
    ];
    let (out, report) = heal::heal(&chains, Length::from_mm(5));

    assert_eq!(report.snapped.len(), 1);
    assert_eq!(report.snapped[0].2, Length::from_mm(3));
    assert_eq!(
        out[1].points[0],
        p(5000, 0),
        "endpoint did not move to the anchor"
    );
    assert!(report.summary().contains("3.000mm"), "{}", report.summary());
}

#[test]
fn healing_refuses_to_close_a_gap_beyond_tolerance_and_says_so() {
    // The defect that matters: a gap we will NOT silently fix must be visible.
    let chains = vec![
        Chain {
            points: vec![p(0, 0), p(5000, 0)],
            closed: false,
            origin: 0,
        },
        Chain {
            points: vec![p(5018, 0), p(5018, 4000)],
            closed: false,
            origin: 1,
        },
    ];
    let (out, report) = heal::heal(&chains, Length::from_mm(5));

    assert!(report.snapped.is_empty(), "an 18mm gap was silently closed");
    assert_eq!(out[1].points[0], p(5018, 0), "geometry was modified anyway");
    assert_eq!(report.gaps_left_open.len(), 1);
    assert!(
        report.summary().contains("LEFT") && report.summary().contains("18.0mm"),
        "the report must name the gap it refused to close: {}",
        report.summary()
    );
}

#[test]
fn healing_removes_exact_duplicates_in_either_direction() {
    let chains = vec![
        Chain {
            points: vec![p(0, 0), p(5000, 0)],
            closed: false,
            origin: 0,
        },
        Chain {
            points: vec![p(0, 0), p(5000, 0)],
            closed: false,
            origin: 1,
        },
        Chain {
            points: vec![p(5000, 0), p(0, 0)],
            closed: false,
            origin: 2,
        },
    ];
    let (out, report) = heal::heal(&chains, Length::from_mm(5));
    assert_eq!(out.len(), 1);
    assert_eq!(report.duplicates, vec![1, 2]);
}

#[test]
fn the_tolerance_is_a_parameter_not_a_constant() {
    let chains = vec![
        Chain {
            points: vec![p(0, 0), p(5000, 0)],
            closed: false,
            origin: 0,
        },
        Chain {
            points: vec![p(5018, 0), p(5018, 4000)],
            closed: false,
            origin: 1,
        },
    ];
    let (_, tight) = heal::heal(&chains, Length::from_mm(5));
    let (_, loose) = heal::heal(&chains, Length::from_mm(25));
    assert!(tight.snapped.is_empty());
    assert_eq!(
        loose.snapped.len(),
        1,
        "a larger tolerance must close the same gap"
    );
}

// ---------------------------------------------------------------------------
// Stage 3: pairing
// ---------------------------------------------------------------------------

#[test]
fn two_parallel_lines_pair_into_a_centreline_and_a_measured_thickness() {
    let lines = vec![
        (0, vec![p(0, 0), p(6000, 0)]),
        (1, vec![p(0, 230), p(6000, 230)]),
    ];
    let runs = pair::pair_walls(&lines, PairParams::default());

    assert_eq!(runs.len(), 1, "the two faces should have become one run");
    let r = &runs[0];
    assert!(r.evidence.is_paired());
    assert_eq!(r.thickness, Length::from_mm(230));
    // Centreline sits halfway between the two faces.
    assert_eq!(r.centreline[0], p(0, 115));
    assert_eq!(r.centreline[1], p(6000, 115));
    assert_eq!(r.sources, vec![0, 1]);
    assert!(
        r.evidence.reason().contains("230.0mm"),
        "{}",
        r.evidence.reason()
    );
}

#[test]
fn lines_too_far_apart_to_be_one_wall_do_not_pair() {
    // 2m apart is a corridor, not a wall.
    let lines = vec![
        (0, vec![p(0, 0), p(6000, 0)]),
        (1, vec![p(0, 2000), p(6000, 2000)]),
    ];
    let runs = pair::pair_walls(&lines, PairParams::default());
    assert_eq!(
        runs.len(),
        2,
        "a corridor was collapsed into a single 2m-thick wall"
    );
    assert!(runs.iter().all(|r| !r.evidence.is_paired()));
}

#[test]
fn lines_that_do_not_overlap_do_not_pair() {
    let lines = vec![
        (0, vec![p(0, 0), p(2000, 0)]),
        (1, vec![p(8000, 230), p(10000, 230)]),
    ];
    let runs = pair::pair_walls(&lines, PairParams::default());
    assert_eq!(runs.len(), 2);
}

#[test]
fn an_unpaired_line_says_exactly_why_and_what_it_defaulted_to() {
    let lines = vec![(0, vec![p(0, 0), p(6000, 0)])];
    let runs = pair::pair_walls(&lines, PairParams::default());
    assert_eq!(runs.len(), 1);
    let why = runs[0].evidence.reason();
    assert!(why.contains("no parallel polyline found"), "{why}");
    assert!(why.contains("default"), "{why}");
    assert!(
        why.contains("not a true centre"),
        "the reader must know the centreline is the drawn line: {why}"
    );
}

// ---------------------------------------------------------------------------
// Stage 4: profiles
// ---------------------------------------------------------------------------

#[test]
fn a_straight_run_produces_a_rectangle_of_the_right_area() {
    let prof = profile::build(&[p(0, 0), p(6000, 0)], Length::from_mm(230)).unwrap();
    assert!(prof.is_valid());
    assert!(prof.is_counter_clockwise());
    // 6000mm x 230mm = 1_380_000 mm²
    assert!(
        (prof.area_mm2() - 1_380_000.0).abs() < 1.0,
        "area was {}",
        prof.area_mm2()
    );
}

#[test]
fn a_degenerate_run_produces_no_profile() {
    assert!(profile::build(&[p(0, 0)], Length::from_mm(230)).is_none());
    assert!(profile::build(&[p(0, 0), p(6000, 0)], Length::ZERO).is_none());
}

// ---------------------------------------------------------------------------
// Stages 5-6: extrusion and openings
// ---------------------------------------------------------------------------

fn plain_wall() -> (Mesh, tri_solid::CutReport) {
    wall_with_openings(
        &[p(0, 0), p(6000, 0)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &[],
    )
}

#[test]
fn a_wall_extrudes_to_a_closed_solid_of_the_right_volume() {
    let (mesh, _) = plain_wall();
    assert!(!mesh.is_empty());
    assert!(mesh.is_closed(), "the extruded wall is not a closed solid");
    // 6.0 x 0.23 x 2.7 = 3.726 m³
    assert!(
        (mesh.volume_m3() - 3.726).abs() < 0.001,
        "volume was {}",
        mesh.volume_m3()
    );
}

#[test]
fn subtracting_a_door_removes_exactly_its_volume() {
    let (solid, _) = plain_wall();
    let (with_door, report) = wall_with_openings(
        &[p(0, 0), p(6000, 0)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &[OpeningCut {
            position: Length::from_mm(3000),
            width: Length::from_mm(900),
            height: Length::from_mm(2100),
            sill: Length::ZERO,
        }],
    );

    assert_eq!(report.applied, 1);
    assert!(
        with_door.is_closed(),
        "the wall is not closed after the cut"
    );

    // 0.9 x 0.23 x 2.1 = 0.43470 m³ removed.
    let removed = solid.volume_m3() - with_door.volume_m3();
    assert!(
        (removed - 0.4347).abs() < 0.001,
        "expected 0.4347 m3 removed, got {removed}"
    );
}

#[test]
fn a_window_leaves_a_sill_below_and_a_lintel_above() {
    let (mesh, report) = wall_with_openings(
        &[p(0, 0), p(6000, 0)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &[OpeningCut {
            position: Length::from_mm(3000),
            width: Length::from_mm(1200),
            height: Length::from_mm(1500),
            sill: Length::from_mm(900),
        }],
    );
    assert_eq!(report.applied, 1);
    assert!(mesh.is_closed());

    // Material must exist both below the sill and above the head.
    let zs: Vec<i64> = mesh.positions.iter().map(|v| v[2]).collect();
    assert!(zs.contains(&900_000), "no sill line at 900mm: {zs:?}");
    assert!(zs.contains(&2_400_000), "no head line at 2400mm");
    // 1.2 x 0.23 x 1.5 = 0.414 m³
    let (plain, _) = plain_wall();
    assert!((plain.volume_m3() - mesh.volume_m3() - 0.414).abs() < 0.001);
}

#[test]
fn several_openings_in_one_wall_all_cut() {
    let cuts: Vec<OpeningCut> = [1000, 3000, 5000]
        .iter()
        .map(|s| OpeningCut {
            position: Length::from_mm(*s),
            width: Length::from_mm(900),
            height: Length::from_mm(2100),
            sill: Length::ZERO,
        })
        .collect();
    let (mesh, report) = wall_with_openings(
        &[p(0, 0), p(6000, 0)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &cuts,
    );
    assert_eq!(report.applied, 3);
    assert!(mesh.is_closed());
    let (plain, _) = plain_wall();
    let removed = plain.volume_m3() - mesh.volume_m3();
    assert!((removed - 3.0 * 0.4347).abs() < 0.002, "removed {removed}");
}

#[test]
fn an_opening_outside_the_wall_is_skipped_with_an_explanation() {
    let (mesh, report) = wall_with_openings(
        &[p(0, 0), p(3000, 0)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &[OpeningCut {
            position: Length::from_mm(9000),
            width: Length::from_mm(900),
            height: Length::from_mm(2100),
            sill: Length::ZERO,
        }],
    );
    assert_eq!(report.applied, 0);
    assert_eq!(report.skipped.len(), 1);
    assert!(
        report.skipped[0].contains("outside"),
        "{}",
        report.skipped[0]
    );
    assert!(
        mesh.is_closed(),
        "skipping an opening must still leave a valid wall"
    );
}

#[test]
fn a_multi_segment_wall_extrudes_closed() {
    let (mesh, _) = wall_with_openings(
        &[p(0, 0), p(4000, 0), p(4000, 3000)],
        Length::from_mm(230),
        Length::ZERO,
        Length::from_mm(2700),
        &[],
    );
    assert!(!mesh.is_empty());
    assert!(mesh.is_closed(), "an L-shaped run did not close");
}

// ---------------------------------------------------------------------------
// End to end: the clean fixture
// ---------------------------------------------------------------------------

#[test]
fn the_clean_fixture_extrudes_with_openings() {
    let (seq, report) = build(CLEAN, "clean-plan.dxf");

    assert!(report.walls_built > 0, "no walls were built");
    assert!(
        report.openings_cut > 0,
        "no openings were cut: {}",
        report.summary()
    );
    assert!(
        report.open_meshes.is_empty(),
        "some walls are not closed solids: {:?}",
        report.open_meshes
    );

    let solids: Vec<Solid3d> = seq
        .document()
        .iter_with(ComponentKey::Solid3d)
        .filter_map(|(_, s)| match s.get(&ComponentKey::Solid3d) {
            Some(Component::Solid3d(s)) => Some(s.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(solids.len(), report.walls_built);
    assert!(solids.iter().all(|s| !s.indices.is_empty()));
    println!("clean: {}", report.summary());
}

#[test]
fn the_pipeline_runs_entirely_through_validated_commits() {
    let (seq, _) = build(CLEAN, "clean-plan.dxf");
    // Three import commits plus one build commit.
    assert_eq!(seq.history().len(), 4);
    let build_commit = seq.history().iter().last().unwrap();
    assert!(matches!(
        build_commit.author(),
        Author::System(s) if s == "2d-to-3d"
    ));

    // Replay from empty reproduces it exactly — only true if nothing bypassed commit.
    let mut replay = Sequencer::default();
    for c in seq.history().iter() {
        replay.submit(c.clone()).unwrap();
    }
    assert_eq!(replay.document().hash(), seq.document().hash());
}

#[test]
fn build_solids_never_mutates_the_document() {
    let mut seq = Sequencer::default();
    import(
        &mut seq,
        &DxfImporter::default(),
        CLEAN,
        "clean.dxf",
        &RuleSet::ncs_default(),
    )
    .unwrap();
    let before = seq.document().hash();
    let (_ops, _report) = build_solids(seq.document(), BuildParams::default());
    assert_eq!(
        seq.document().hash(),
        before,
        "build_solids mutated the document"
    );
}

// ---------------------------------------------------------------------------
// End to end: the messy fixture must be honest
// ---------------------------------------------------------------------------

#[test]
fn the_messy_fixture_extrudes_with_honest_provenance() {
    let (seq, report) = build(MESSY, "messy-plan.dxf");
    assert!(report.walls_built > 0, "nothing was built at all");

    // PRD Prompt 5: "Assert the count of Assumed values is non-zero and that none are
    // silently Measured."
    let mut assumed = 0;
    let mut inferred = 0;
    let mut measured = 0;
    for (id, set) in seq.document().iter_entities() {
        for (_, c) in set.iter() {
            for (field, prov, reason) in c.provenance_records() {
                assert!(
                    !reason.trim().is_empty(),
                    "{id:?}.{field} has provenance with no reason"
                );
                match prov {
                    Provenance::Assumed => assumed += 1,
                    Provenance::Inferred => inferred += 1,
                    Provenance::Measured => measured += 1,
                }
            }
        }
    }

    assert!(assumed > 0, "a drawing this bad produced no assumptions");
    assert_eq!(
        measured, 0,
        "{measured} value(s) in a drawing with no dimensions claim to be Measured"
    );
    println!(
        "messy: {assumed} assumed, {inferred} inferred, {measured} measured\n{}",
        report.summary()
    );
}

#[test]
fn every_questionable_value_in_the_messy_build_is_traceable() {
    let (_, report) = build(MESSY, "messy-plan.dxf");
    assert!(!report.assumptions.is_empty());
    for (id, field, reason) in &report.assumptions {
        assert!(
            reason.len() > 20,
            "{id:?}.{field} has a reason too short to be useful: {reason:?}"
        );
    }
    // The healing report names the gaps it would not close.
    assert!(
        report.heal_summary.contains("LEFT") || report.heal_summary.contains("snapped"),
        "healing found nothing in a drawing full of gaps: {}",
        report.heal_summary
    );
}

#[test]
fn a_defaulted_thickness_is_assumed_and_a_paired_one_is_inferred() {
    let mut doc = Document::new();
    // Two parallel faces plus one lonely line.
    validate_and_apply(
        &mut doc,
        &[
            wall_op(vec![p(0, 0), p(6000, 0)]),
            wall_op(vec![p(0, 230), p(6000, 230)]),
            wall_op(vec![p(0, 5000), p(6000, 5000)]),
        ],
    )
    .unwrap();

    let (ops, report) = build_solids(&doc, BuildParams::default());
    validate_and_apply(&mut doc, &ops).unwrap();

    assert_eq!(report.paired, 1);
    assert_eq!(report.unpaired, 1);

    let mut provs = Vec::new();
    for (_, set) in doc.iter_entities() {
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            provs.push((w.thickness.provenance(), w.thickness.get()));
        }
    }
    assert!(
        provs.contains(&(Provenance::Inferred, Length::from_mm(230))),
        "the paired wall's thickness should be Inferred at 230mm: {provs:?}"
    );
    assert!(
        provs.iter().any(|(p, _)| *p == Provenance::Assumed),
        "the unpaired wall's thickness should be Assumed: {provs:?}"
    );
}

fn wall_op(points: Vec<Point2>) -> Op {
    Op::CreateEntity {
        components: vec![Component::WallProfile(WallProfile {
            centreline: points,
            thickness: Tracked::assumed(Length::from_mm(100), "not yet paired"),
            height: Tracked::assumed(Length::from_mm(2700), "project default 2700mm"),
            base_elevation: Tracked::assumed(Length::ZERO, "no level data"),
        })],
    }
}

// ---------------------------------------------------------------------------
// Determinism and rendering
// ---------------------------------------------------------------------------

#[test]
fn the_built_document_hashes_identically_across_runs() {
    let a = build(CLEAN, "clean-plan.dxf").0.document().hash();
    let b = build(CLEAN, "clean-plan.dxf").0.document().hash();
    assert_eq!(a, b, "the 2D->3D build is not deterministic");
}

#[test]
fn both_fixtures_render_in_perspective_3d() {
    use tri_render::camera::{Camera, ViewMode};
    use tri_render::scene;

    for (bytes, name) in [(CLEAN, "clean"), (MESSY, "messy")] {
        let (seq, _) = build(bytes, name);
        let doc = seq.document();
        let camera = match scene::document_bounds(doc) {
            Some(b) => Camera::fit(b, 640, 480),
            None => panic!("{name}: no bounds"),
        };

        let s = scene::build(doc, camera, ViewMode::TwoPointPerspective);
        assert!(
            !s.mesh.is_empty(),
            "{name}: nothing to draw in Perspective3d - the solids did not reach the renderer"
        );
        assert!(s.mesh.len().is_multiple_of(3));

        match pollster::block_on(tri_render::Renderer::headless()) {
            Ok(r) => {
                let img = r.render_to_image(&s, 640, 480).expect("3d render");
                let ink = img.ink_fraction(s.background_srgb(), 4);
                assert!(ink > 0.001, "{name}: the 3D render is blank ({ink})");
            }
            Err(e) => eprintln!("SKIPPING GPU render for {name}: {e}"),
        }
    }
}

#[test]
fn an_opening_that_would_not_fit_is_rejected_by_validation_not_silently_cut() {
    // The document-level invariant still applies to anything the pipeline emits.
    let mut doc = Document::new();
    let m = validate_and_apply(&mut doc, &[wall_op(vec![p(0, 0), p(3000, 0)])]).unwrap();
    let host = m.entities[0];

    let ops = [Op::CreateEntity {
        components: vec![Component::Opening(Opening {
            host,
            kind: OpeningKind::Door,
            position: Length::from_mm(2900),
            width: Tracked::measured(Length::from_mm(900), "block"),
            height: Tracked::assumed(Length::from_mm(2100), "default"),
            sill: Tracked::measured(Length::ZERO, "door"),
        })],
    }];
    let err = tri_doc::check(&doc, &ops);
    assert!(
        err.is_err(),
        "an opening running off the end of a wall was accepted"
    );
    let _ = EntityId::from_raw(1);
}

// ---------------------------------------------------------------------------
// End to end: pairing, on a drawing that actually has two-faced walls
// ---------------------------------------------------------------------------

const PAIRED: &[u8] = include_bytes!("../../../fixtures/dxf/paired-plan.dxf");

#[test]
fn a_two_faced_drawing_pairs_end_to_end_and_infers_real_thicknesses() {
    // The other fixtures draw one line per wall, so pairing never fires on them and the
    // pipeline's most consequential inference goes untested end to end. This one draws
    // every wall as two faces 230mm apart.
    let (seq, report) = build(PAIRED, "paired-plan.dxf");

    assert!(
        report.paired >= 4,
        "expected the envelope walls to pair; got {} paired / {} unpaired\n{}",
        report.paired,
        report.unpaired,
        report.summary()
    );
    assert!(report.open_meshes.is_empty(), "{:?}", report.open_meshes);

    // Paired thicknesses are Inferred at the real 230mm, not Assumed at a default.
    let mut inferred_230 = 0;
    for (_, set) in seq.document().iter_entities() {
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            if w.thickness.provenance() == Provenance::Inferred {
                assert_eq!(
                    w.thickness.get(),
                    Length::from_mm(230),
                    "paired thickness should be the drawn separation"
                );
                assert!(
                    w.thickness
                        .reason()
                        .contains("paired with a parallel polyline"),
                    "{}",
                    w.thickness.reason()
                );
                inferred_230 += 1;
            }
        }
    }
    assert!(
        inferred_230 >= 4,
        "only {inferred_230} walls got an inferred thickness"
    );

    // Height is still Assumed — pairing tells us nothing about how tall a wall is, and
    // it must not launder that into confidence.
    for (_, set) in seq.document().iter_entities() {
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            assert_eq!(
                w.height.provenance(),
                Provenance::Assumed,
                "pairing must not upgrade the confidence of an unrelated value"
            );
        }
    }
    println!("paired: {}", report.summary());
}
