//! F4's tests: the template library and the solver that adapts it to a plot.
//!
//! The PRD's done-when: "ten fixture parameter sets generate valid plans; failures are
//! explicit, not silent". The fixture table below is the first half; the refusal tests
//! are the second, and they matter more. A generator that squeezes a 4BHK onto a 20x30
//! plot and hands back six rooms nobody could stand up in has not failed loudly enough.

use tri_doc::Length;
use tri_gen::template::Width;
use tri_gen::{library, plan, select, solve, GenError, SelectError};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, report, RuleSet, Severity, Standing};

fn rules() -> RuleSet {
    RuleSet::bbmp_plotted_residential()
}

/// Feet to a parameter set with tier 2 derived. `None` if the plot falls outside every
/// band in the ruleset, which is a ruleset limit and not a template one.
fn brief(w_ft: f64, d_ft: f64, bedrooms: u8, floors: u8) -> Option<ParameterSet> {
    let mm = |ft: f64| Length::from_mm((ft * 304.8).round() as i64);
    let raw = ParameterSet::from_brief(mm(w_ft), mm(d_ft), Orientation::North, bedrooms, floors, 1)
        .ok()?;
    derive_parameters(&raw, &rules()).ok()
}

/// The ten fixtures: plot in feet, bedrooms, floors.
///
/// Real Bengaluru plot sizes, and every one was chosen by running
/// `cargo run -p tri-gen --example coverage` and reading what the library actually does,
/// not by picking numbers that make the arithmetic work. Four of the sizes here refuse a
/// higher bedroom count, which is the point of [`REFUSALS`] below.
const FIXTURES: [(f64, f64, u8, u8); 10] = [
    (25.0, 40.0, 1, 2),
    (30.0, 40.0, 1, 1),
    (30.0, 40.0, 2, 2), // the F1 baseline
    (40.0, 40.0, 2, 1),
    (30.0, 50.0, 2, 2),
    (30.0, 50.0, 3, 2),
    (40.0, 60.0, 3, 2),
    (50.0, 60.0, 3, 2),
    (30.0, 60.0, 4, 2),
    (60.0, 80.0, 4, 2),
];

/// Plots the library cannot serve, and the word each refusal must contain.
///
/// These are the more important half of the done-when. A generator that squeezes a 4BHK
/// onto a 20x30 plot and hands back six rooms nobody could stand up in has not failed
/// loudly enough.
const REFUSALS: [(f64, f64, u8, &str); 5] = [
    (20.0, 30.0, 2, "wide"),
    (25.0, 40.0, 4, "wide"),
    (30.0, 40.0, 3, "deep"),
    (40.0, 40.0, 4, "deep"),
    // Wide, and still refused: 60x40 is 223 m², which lands in a deeper setback band and
    // leaves under 7m of buildable depth. Plot area alone does not decide this.
    (60.0, 40.0, 2, "deep"),
];

#[test]
fn ten_fixtures_generate_valid_plans() {
    let r = rules();
    let mut failures = Vec::new();
    for (w, d, beds, floors) in FIXTURES {
        let Some(p) = brief(w, d, beds, floors) else {
            failures.push(format!("{w}x{d} {beds}BHK: no ruleset band"));
            continue;
        };
        match plan(&p, &r) {
            Ok(g) => {
                assert!(g.wall_count() >= 4, "{w}x{d}: {} walls", g.wall_count());
                assert!(
                    g.rooms.len() >= beds as usize + 2,
                    "{w}x{d} {beds}BHK: only {} rooms",
                    g.rooms.len()
                );
                assert_eq!(
                    g.rooms
                        .iter()
                        .filter(|(_, kind, _)| kind == "bedroom")
                        .count(),
                    beds as usize,
                    "{w}x{d}: wrong bedroom count"
                );
            }
            Err(e) => failures.push(format!("{w}x{d} {beds}BHK: {e}")),
        }
    }
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}

#[test]
fn every_fixture_clears_the_room_minimums_it_was_checked_against() {
    // The plans are not merely *produced*; they are produced legal. This is the check
    // that caught the 9.48 m² bedroom in F3, run across the whole fixture table so a new
    // template cannot pass by being drawn on one forgiving plot.
    let r = rules();
    let mut bad = Vec::new();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).expect("fixture is in a band");
        let mut seq = tri_commit::Sequencer::default();
        let g = plan(&p, &r).expect("fixture generates");
        tri_gen::apply(&mut seq, &g, tri_commit::Author::system("fixture")).unwrap();
        let report = report(seq.document(), &r);
        for m in report
            .metrics
            .iter()
            .filter(|m| m.standing == Standing::Over)
        {
            bad.push(format!(
                "{w}x{d} {beds}BHK: {} {} of {:?} {}",
                m.label, m.value, m.limit, m.unit
            ));
        }
        for diag in report
            .diagnostics
            .iter()
            .filter(|x| x.severity == Severity::Hard)
        {
            bad.push(format!("{w}x{d} {beds}BHK: {}", diag.message));
        }
    }
    assert!(bad.is_empty(), "\n{}", bad.join("\n"));
}

#[test]
fn a_plot_too_small_for_the_brief_is_refused_by_name() {
    // A 20x30 plot cannot hold a 4BHK. The refusal has to say which template was tried,
    // what was wrong, and what would have been enough — otherwise the architect's only
    // recourse is to guess.
    let p = brief(20.0, 30.0, 4, 1).expect("20x30 is in a band");
    let err = plan(&p, &rules()).expect_err("a 4BHK does not fit a 20x30 plot");
    let GenError::Select(SelectError::NothingFits { rejections }) = &err else {
        panic!("expected a NothingFits refusal, got {err}");
    };
    assert_eq!(rejections.len(), 1);
    assert_eq!(rejections[0].template_id, "4bhk.central-hall.v1");
    let text = err.to_string();
    assert!(text.contains("4bhk.central-hall.v1"), "{text}");
    assert!(text.contains("at least"), "{text}");
    // The numbers are in there, not just the word "too small".
    assert!(
        text.chars().filter(|c| c.is_ascii_digit()).count() > 8,
        "the refusal quotes no dimensions: {text}"
    );
}

#[test]
fn a_bedroom_count_with_no_template_says_what_the_library_holds() {
    // Not reachable through `Brief` today, which caps bedrooms at 4. It is reachable the
    // moment somebody raises that cap, and the failure should be a sentence rather than
    // an empty candidate list silently producing nothing.
    let err = select(9);
    assert!(err.is_empty());
    let mut p = brief(60.0, 80.0, 4, 2).unwrap();
    p.bedrooms = tri_doc::Tracked::measured(9, "hand-set past the brief's cap");
    let e = solve(&p, &rules()).expect_err("no 9-bedroom template");
    let SelectError::NoTemplate { available, .. } = &e else {
        panic!("expected NoTemplate, got {e}");
    };
    assert_eq!(available.len(), library().len());
    assert!(e.to_string().contains("2bhk.front-living.v1"), "{e}");
}

#[test]
fn the_library_covers_every_bedroom_count_the_brief_accepts() {
    // `Brief` validates bedrooms into 1..=4. A gap in the library would turn a brief the
    // form happily accepts into a refusal, which is a product hole rather than a real
    // constraint.
    for beds in 1..=4u8 {
        assert!(
            !select(beds).is_empty(),
            "the form accepts {beds} bedroom(s) and the library has no template for it"
        );
    }
}

#[test]
fn a_cap_never_sits_below_the_rules_minimum() {
    // A capped cell claims the ruleset minimum first and the cap second. A cap under that
    // minimum would be silently ignored, so the template would not do what it says.
    let r = rules();
    for t in library() {
        for b in &t.bands {
            for c in &b.cells {
                if let Width::Capped { max_mm, .. } = c.width {
                    let min = r.minimum_for(c.kind).map(|m| m.min_width_mm).unwrap_or(0);
                    assert!(
                        max_mm >= min,
                        "{}: {} is capped at {max_mm}mm, under the {min}mm minimum",
                        t.id,
                        c.name
                    );
                }
            }
        }
    }
}

#[test]
fn a_capped_room_stops_growing_and_its_neighbour_takes_the_surplus() {
    // The 25.6 m² kitchen. A wider plot should buy a bigger living room, not a longer
    // walk between the hob and the sink.
    let r = rules();
    // The 4BHK's front band is `Living / Dining` beside the kitchen, so the cap has an
    // uncapped neighbour to hand its surplus to. In the 2BHK the kitchen is the only
    // room in its band that can grow at all, so the cap yields there by design.
    let w = |ft: f64, name: &str| {
        let (_, l) = solve(&brief(ft, 60.0, 4, 2).unwrap(), &r).unwrap();
        l.cells
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("no {name}"))
            .width()
            .as_um()
    };
    assert!(w(50.0, "Kitchen") <= 3_300_000, "the cap did not bind");
    assert_eq!(
        w(50.0, "Kitchen"),
        w(60.0, "Kitchen"),
        "a capped kitchen kept growing"
    );
    assert!(
        w(60.0, "Living / Dining") > w(50.0, "Living / Dining"),
        "the surplus the kitchen handed back went nowhere"
    );
}

#[test]
fn every_band_can_stretch() {
    // A band built entirely from Fixed cells cannot fill the plot, and the solver refuses
    // rather than leaving a gap between the last room and the external wall. That refusal
    // is a library authoring bug, so it is caught here rather than in front of a user.
    for t in library() {
        for b in &t.bands {
            // A band of nothing but Fixed cells cannot fill a wide plot and would
            // leave a gap between its last room and the external wall. A Capped cell
            // counts: its cap yields when it is the only thing that can absorb.
            assert!(
                b.cells.iter().any(|c| !matches!(c.width, Width::Fixed(_))),
                "{}: the {} band is all Fixed cells",
                t.id,
                b.name
            );
        }
    }
}

#[test]
fn template_ids_are_unique() {
    let mut ids: Vec<&str> = library().iter().map(|t| t.id).collect();
    ids.sort_unstable();
    let n = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), n, "two templates share an id");
}

#[test]
fn a_wider_plot_grows_the_rooms_and_not_the_fixtures() {
    // The lesson from F1's 6.7 m² bathroom, now enforced across the library rather than
    // remembered about one template. A toilet does not get more useful as the plot gets
    // wider; a kitchen does.
    let r = rules();
    let (_, narrow) = solve(&brief(30.0, 50.0, 2, 2).unwrap(), &r).unwrap();
    let (_, wide) = solve(&brief(50.0, 50.0, 2, 2).unwrap(), &r).unwrap();
    let w = |l: &tri_gen::Layout, name: &str| {
        l.cells
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("no room called {name}"))
            .width()
            .as_um()
    };
    assert_eq!(
        w(&narrow, "Toilet"),
        w(&wide, "Toilet"),
        "the toilet got wider with the plot"
    );
    assert!(
        w(&wide, "Kitchen") > w(&narrow, "Kitchen"),
        "the kitchen did not absorb the extra frontage"
    );
}

#[test]
fn every_refusal_names_a_template_and_quotes_the_shortfall() {
    let r = rules();
    for (w, d, beds, word) in REFUSALS {
        let p = brief(w, d, beds, 1).expect("the plot is in a ruleset band");
        let err = match plan(&p, &r) {
            Err(e) => e,
            Ok(g) => panic!(
                "{w}x{d} {beds}BHK generated {} instead of refusing",
                g.template_id
            ),
        };
        let GenError::Select(SelectError::NothingFits { rejections }) = &err else {
            panic!("{w}x{d} {beds}BHK: expected NothingFits, got {err}");
        };
        assert!(!rejections.is_empty());
        let text = err.to_string();
        for rj in rejections {
            assert!(text.contains(rj.template_id), "{text}");
        }
        assert!(
            text.contains(word),
            "{w}x{d} {beds}BHK should fail on {word}: {text}"
        );
        // The numbers are in there, not just the word "too small".
        assert!(
            text.chars().filter(|c| c.is_ascii_digit()).count() > 8,
            "the refusal quotes no dimensions: {text}"
        );
    }
}

#[test]
fn the_corridor_is_continuous() {
    // A side corridor only works if nothing crosses it. The band dividers stop at its
    // edge; the test is that no wall runs through its interior in the across direction.
    let r = rules();
    let p = brief(40.0, 60.0, 3, 2).unwrap();
    let (t, layout) = solve(&p, &r).unwrap();
    assert_eq!(t.id, "3bhk.side-corridor.v1");
    let corridor = layout
        .cells
        .iter()
        .find(|c| c.kind == "corridor")
        .expect("the 3BHK has a corridor");
    let (lo, hi) = (corridor.min.x.as_um(), corridor.max.x.as_um());
    let (near, far) = (corridor.min.y.as_um(), corridor.max.y.as_um());
    for w in &layout.walls {
        if w.external || w.a.y != w.b.y {
            continue;
        }
        let y = w.a.y.as_um();
        if y <= near || y >= far {
            continue;
        }
        let (wa, wb) = (
            w.a.x.as_um().min(w.b.x.as_um()),
            w.a.x.as_um().max(w.b.x.as_um()),
        );
        assert!(
            wb <= lo || wa >= hi,
            "a divider at y={y} crosses the corridor ({lo}..{hi}): {}",
            w.reason
        );
    }
}

#[test]
fn cells_tile_the_envelope_without_gaps_or_overlaps() {
    // The solver hands every cell its rectangle independently; nothing downstream checks
    // that they add up. A rounding error would show as a room label floating over a sliver
    // of nothing, which is exactly the kind of defect that survives a visual review.
    //
    // Areas are summed in micrometres. `Cell::area_mm2` truncates each side to whole
    // millimetres, which loses about a hundredth of a percent — enough that the first
    // version of this test failed on a plan with no gap in it at all.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let (t, layout) = solve(&p, &r).unwrap();

        let sum: i128 = layout
            .cells
            .iter()
            .map(|c| c.width().as_um() as i128 * c.depth().as_um() as i128)
            .sum();
        let env = layout.envelope_width().as_um() as i128 * layout.envelope_depth().as_um() as i128;
        assert_eq!(
            sum, env,
            "{} on {w}x{d}: cells do not sum to the envelope",
            t.id
        );

        // Equal areas alone would also pass if one cell overlapped another and a third
        // left a hole of the same size, so the overlap is checked directly.
        for (i, a) in layout.cells.iter().enumerate() {
            for b in &layout.cells[i + 1..] {
                let disjoint = a.max.x <= b.min.x
                    || b.max.x <= a.min.x
                    || a.max.y <= b.min.y
                    || b.max.y <= a.min.y;
                assert!(
                    disjoint,
                    "{} on {w}x{d}: {} overlaps {}",
                    t.id, a.name, b.name
                );
            }
        }
    }
}

#[test]
fn mirroring_twice_is_the_identity() {
    // The guard the mirror transform's own doc comment promised and did not have. Its
    // first version carried each cell's `max.y` into `min`, inverting every room's depth;
    // the fixture suite caught a -24 m² living room only because that room then ranked
    // first, a negative short side being no harder to furnish than a positive one.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        for t in select(beds) {
            // Not every template for a bedroom count fits every plot — the split-bedroom
            // 2BHK wants four bands of depth and a 40ft-deep plot has three. Skipping
            // those is the library adapting, which is what it is for.
            let Ok(once) = t.instantiate(&p, &r) else {
                continue;
            };
            let twice = once.clone().mirrored().mirrored();
            assert_eq!(once.cells, twice.cells, "{} on {w}x{d}", t.id);
            assert_eq!(once.entry_offset, twice.entry_offset, "{}", t.id);
        }
    }
}

#[test]
fn no_option_has_a_room_with_a_negative_side() {
    // Every candidate, not just the default variant. A transform that inverts a rectangle
    // produces geometry that is wrong in a way no area or minimum check can see, because
    // every comparison against a negative number quietly passes.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        for c in tri_gen::candidates(&p, &r).unwrap() {
            for cell in &c.layout.cells {
                assert!(
                    cell.width().as_um() > 0 && cell.depth().as_um() > 0,
                    "{}: {} is {} x {} um",
                    c.key,
                    cell.name,
                    cell.width().as_um(),
                    cell.depth().as_um()
                );
            }
        }
    }
}

#[test]
fn a_generation_offers_between_two_and_four_options() {
    // The PRD asks for three or four. A 1BHK on a tight plot may only support two, which
    // is honest; fewer than two would mean the strip is not a choice at all.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let opts = tri_gen::candidates(&p, &r).unwrap();
        assert!(
            (2..=tri_gen::OPTIONS_PER_GENERATION).contains(&opts.len()),
            "{w}x{d} {beds}BHK produced {} option(s)",
            opts.len()
        );
        let mut keys: Vec<&str> = opts.iter().map(|o| o.key.as_str()).collect();
        keys.sort_unstable();
        let n = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), n, "two options share a key on {w}x{d}");
    }
}

#[test]
fn the_same_brief_always_produces_the_same_options_in_the_same_order() {
    // "Because the solver is deterministic, the same parameter set always yields the same
    // plan, so an architect can reproduce and trust a result." Ranking is a sort, and an
    // unstable one over equal scores would quietly break that.
    let r = rules();
    let p = brief(40.0, 60.0, 3, 2).unwrap();
    let first: Vec<String> = tri_gen::candidates(&p, &r)
        .unwrap()
        .iter()
        .map(|c| c.key.clone())
        .collect();
    for _ in 0..5 {
        let again: Vec<String> = tri_gen::candidates(&p, &r)
            .unwrap()
            .iter()
            .map(|c| c.key.clone())
            .collect();
        assert_eq!(first, again);
    }
}

#[test]
fn options_within_one_template_are_ranked_worst_last() {
    // Across templates the list is filled round-robin, so a genuinely different topology
    // can appear above a better-scoring variant of the one before it — that is the
    // diversity rule doing its job. Within a single template there is no such excuse.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let opts = tri_gen::candidates(&p, &r).unwrap();
        for t in select(beds) {
            let group: Vec<usize> = opts
                .iter()
                .filter(|o| o.template.id == t.id)
                .map(|o| o.awkward)
                .collect();
            assert!(
                group.windows(2).all(|w| w[0] <= w[1]),
                "{w}x{d} {}: {group:?} is not worst-last",
                t.id
            );
        }
    }
}

#[test]
fn no_option_is_offered_twice_under_a_different_name() {
    // The failure the diversity rule exists to prevent, stated as geometry rather than as
    // labels: four options reading 43.1, 43.1, 43.1 and 43.1 m² were four copies of one
    // plan, and a strip of identical thumbnails is worse than a single plan because it
    // implies a choice was weighed.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let opts = tri_gen::candidates(&p, &r).unwrap();
        for (i, a) in opts.iter().enumerate() {
            for b in &opts[i + 1..] {
                assert_ne!(
                    a.layout.cells, b.layout.cells,
                    "{w}x{d}: {} and {} are the same layout",
                    a.key, b.key
                );
            }
        }
    }
}

#[test]
fn mirroring_is_not_offered_as_an_option() {
    // It changes handedness and nothing else. Until the north angle is an input (F7),
    // presenting it as a choice is a coin flip dressed as a decision.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        for c in tri_gen::candidates(&p, &r).unwrap() {
            assert!(!c.variant.mirrored, "{w}x{d}: {} is a mirror", c.key);
            assert!(!c.layout.mirrored);
        }
    }
}

// ---------------------------------------------------------------------------
// F7 — Vaastu as an optional constraint layer.
//
// The done-when is three claims: "toggling it changes ranking, never blocks generation,
// and the cost is visible". Each gets a test, and the middle one is the important one.
// ---------------------------------------------------------------------------

fn with_vaastu(mut p: ParameterSet) -> ParameterSet {
    p.vaastu = tri_doc::Tracked::measured(true, "the architect asked for Vaastu");
    p
}

#[test]
fn vaastu_is_off_unless_the_brief_asks() {
    // "Off by default." A directional preference nobody requested silently reordering the
    // options would be the tool having an opinion it was not asked for.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        assert!(!p.vaastu.get(), "{w}x{d}: Vaastu defaulted on");
        for c in tri_gen::candidates(&p, &r).unwrap() {
            assert!(c.vaastu.is_none(), "{}: scored with Vaastu off", c.key);
            assert!(c.cost_note().is_empty(), "{}", c.key);
        }
    }
}

#[test]
fn turning_vaastu_on_changes_the_ranking() {
    // The first clause of the done-when. A toggle that reorders nothing is a toggle that
    // does nothing, however much machinery sits behind it.
    let r = rules();
    let mut moved = 0;
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let off: Vec<String> = tri_gen::candidates(&p, &r)
            .unwrap()
            .iter()
            .map(|c| c.key.clone())
            .collect();
        let on: Vec<String> = tri_gen::candidates(&with_vaastu(p), &r)
            .unwrap()
            .iter()
            .map(|c| c.key.clone())
            .collect();
        if off != on {
            moved += 1;
        }
    }
    assert!(
        moved >= FIXTURES.len() / 2,
        "Vaastu changed the ranking on only {moved} of {} fixtures",
        FIXTURES.len()
    );
}

#[test]
fn vaastu_never_blocks_a_plan_that_would_otherwise_generate() {
    // The second clause, and the one worth the crate boundary. `tri-vaastu` cannot name a
    // refusal type, so this cannot fail by accident — it fails only if somebody wires a
    // score into a filter here.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = brief(w, d, beds, floors).unwrap();
        let off = tri_gen::candidates(&p, &r).unwrap();
        let on = tri_gen::candidates(&with_vaastu(p), &r).unwrap();
        assert!(!on.is_empty(), "{w}x{d}: Vaastu left no options");
        assert!(
            on.len() >= off.len(),
            "{w}x{d}: Vaastu removed options ({} → {})",
            off.len(),
            on.len()
        );
    }
    // And a plot nothing fits is refused for the same reason with Vaastu on as off: the
    // envelope, not the compass.
    let tiny = with_vaastu(brief(20.0, 30.0, 4, 1).unwrap());
    let err = tri_gen::candidates(&tiny, &r).unwrap_err();
    assert!(!err.to_string().to_lowercase().contains("vaastu"), "{err}");
}

#[test]
fn a_vaastu_ranked_option_says_what_it_cost() {
    // The third clause. A score with no cost beside it is a number an architect cannot
    // argue with, and the whole point of showing the influence is that it can be rejected.
    let r = rules();
    let p = with_vaastu(brief(40.0, 60.0, 3, 2).unwrap());
    let opts = tri_gen::candidates(&p, &r).unwrap();
    for c in &opts {
        assert!(c.vaastu.is_some(), "{}", c.key);
        assert!(c.rank_without_vaastu >= 1, "{}", c.key);
        let note = c.cost_note();
        assert!(!note.is_empty(), "{} says nothing about its cost", c.key);
        // Either it names a rank it moved from, or it says there was no cost.
        assert!(
            note.contains("without Vaastu") || note.contains("Vaastu-off") || note.contains("m²"),
            "{}: {note}",
            c.key
        );
    }
    assert!(
        opts.iter().any(|c| c.rank_without_vaastu != 1),
        "no option moved, so nothing was traded"
    );
}

#[test]
fn buildability_outranks_a_directional_preference() {
    // Vaastu decides among options that are equally furnishable and never promotes one
    // that is not. A 2.6:1 kitchen is a room nobody can cook in whichever way it faces.
    let r = rules();
    for (w, d, beds, floors) in FIXTURES {
        let p = with_vaastu(brief(w, d, beds, floors).unwrap());
        let opts = tri_gen::candidates(&p, &r).unwrap();
        for t in select(beds) {
            let group: Vec<usize> = opts
                .iter()
                .filter(|o| o.template.id == t.id)
                .map(|o| o.awkward)
                .collect();
            assert!(
                group.windows(2).all(|w| w[0] <= w[1]),
                "{w}x{d} {}: Vaastu promoted a less buildable option {group:?}",
                t.id
            );
        }
    }
}

#[test]
fn mirrored_plans_appear_only_once_there_is_a_direction_to_mirror_against() {
    // The promise F5 made when it withheld them: "without knowing which side the
    // neighbour, the gate or the sun is on, presenting a mirror as one of four choices is
    // a coin flip dressed as a decision."
    let r = rules();
    let p = brief(30.0, 40.0, 2, 2).unwrap();
    assert!(tri_gen::candidates(&p, &r)
        .unwrap()
        .iter()
        .all(|c| !c.variant.mirrored));
    assert!(
        tri_gen::candidates(&with_vaastu(p), &r)
            .unwrap()
            .iter()
            .any(|c| c.variant.mirrored),
        "Vaastu is on and handedness is still not offered"
    );
}

#[test]
fn mirroring_actually_changes_the_vaastu_score() {
    // If it did not, offering it would still be a coin flip — just a better-dressed one.
    let r = rules();
    let p = with_vaastu(brief(40.0, 60.0, 3, 2).unwrap());
    let opts = tri_gen::candidates(&p, &r).unwrap();
    let scored: Vec<(bool, u8)> = opts
        .iter()
        .filter_map(|c| c.vaastu.as_ref().map(|v| (c.variant.mirrored, v.score)))
        .collect();
    let handed: Vec<u8> = scored.iter().filter(|(m, _)| *m).map(|(_, s)| *s).collect();
    let plain: Vec<u8> = scored
        .iter()
        .filter(|(m, _)| !*m)
        .map(|(_, s)| *s)
        .collect();
    assert!(!handed.is_empty() && !plain.is_empty(), "{scored:?}");
    assert_ne!(handed, plain, "handedness made no difference to the score");
}

#[test]
fn the_road_orientation_changes_what_scores_well() {
    // The compass is doing work rather than being decoration: the same plan on a
    // north-facing and a south-facing plot puts its kitchen in opposite sectors.
    let r = rules();
    let mm = |ft: f64| tri_doc::Length::from_mm((ft * 304.8).round() as i64);
    let for_side = |side: tri_params::Orientation| {
        let raw = ParameterSet::from_brief(mm(30.0), mm(50.0), side, 3, 2, 1).unwrap();
        let p = with_vaastu(derive_parameters(&raw, &r).unwrap());
        tri_gen::candidates(&p, &r).unwrap()[0]
            .vaastu
            .as_ref()
            .unwrap()
            .score
    };
    assert_ne!(
        for_side(tri_params::Orientation::North),
        for_side(tri_params::Orientation::South),
        "the road orientation made no difference"
    );
}
