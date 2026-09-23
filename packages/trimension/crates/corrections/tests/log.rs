//! F8's done-when: "parameter set, chosen branch, every edit and whether the session
//! exported are all logged."
//!
//! Four claims, and the third is the one worth guarding — an edit the log misses is an
//! edit the compounding asset never learns from, and nothing else in the system notices.

use tri_api::command::Command;
use tri_commit::{AgentId, Author, Commit, PlanId, Sequencer, UserId};
use tri_corrections::{log, Export, Kind, Session};
use tri_doc::{Component, ComponentKey, Length};
use tri_gen::{apply, plan};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

fn human() -> Author {
    Author::Human(UserId("amitesh".into()))
}

fn generated() -> Sequencer {
    let rules = RuleSet::bbmp_plotted_residential();
    let raw = ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        2,
        2,
        1,
    )
    .unwrap();
    let derived = derive_parameters(&raw, &rules).unwrap();
    let mut seq = Sequencer::default();
    let g = plan(&derived, &rules).unwrap();
    apply(&mut seq, &g, human()).unwrap();
    seq
}

fn an_internal_wall(seq: &Sequencer) -> u64 {
    let doc = seq.document();
    let v: Vec<(u64, i64)> = doc
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(id, set)| match set.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) if w.centreline.len() == 2 => (w.centreline[0].x
                == w.centreline[1].x)
                .then_some((id.raw(), w.centreline[0].x.as_um())),
            _ => None,
        })
        .collect();
    let lo = v.iter().map(|(_, x)| *x).min().unwrap();
    let hi = v.iter().map(|(_, x)| *x).max().unwrap();
    v.iter()
        .find(|(_, x)| *x > lo && *x < hi)
        .map(|(id, _)| *id)
        .unwrap()
}

fn run(seq: &mut Sequencer, author: Author, cmd: Command) {
    let ops = cmd.to_ops(seq.document(), &author.to_string()).unwrap();
    let c = Commit::new(seq.head(), author, ops, cmd.name().to_string());
    seq.submit(c).unwrap();
}

fn drag(seq: &mut Sequencer, entity: u64, dx: f64) {
    run(
        seq,
        human(),
        Command::MoveWall {
            entity,
            dx_mm: dx,
            dy_mm: 0.0,
        },
    );
}

#[test]
fn a_freshly_generated_plan_has_no_corrections() {
    // Generation is not a correction — it is the thing being corrected. A log that counted
    // the three generation commits as edits would report every session as heavily
    // corrected and the metric would be worthless from the first day.
    let seq = generated();
    let l = log(&seq, &Session::default());
    assert!(l.corrections.is_empty(), "{:?}", l.corrections);
    assert_eq!(l.generated_at_step, Some(3));
    assert!(!l.exported);
    assert_eq!(l.wall_edits_before_export, 0);
}

#[test]
fn a_wall_move_is_logged_with_where_it_was_and_where_it_went() {
    // The line the PRD actually asks for: "where the solver put a wall and where the
    // architect moved it". A delta alone would not do — the interesting question is which
    // wall of which template keeps getting moved, and that needs the original position.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 300.0);

    let l = log(&seq, &Session::default());
    let moves: Vec<&Kind> = l
        .corrections
        .iter()
        .map(|c| &c.kind)
        .filter(|k| matches!(k, Kind::WallMoved { .. }))
        .collect();
    assert_eq!(moves.len(), 1, "{:?}", l.corrections);
    let Kind::WallMoved {
        entity,
        from_mm,
        to_mm,
        dx_mm,
        ..
    } = moves[0]
    else {
        unreachable!()
    };
    assert_eq!(*entity, wall);
    assert!((dx_mm - 300.0).abs() < 0.01, "{dx_mm}");
    assert!((to_mm[0] - from_mm[0] - 300.0).abs() < 0.01);
    assert_ne!(from_mm, to_mm);
}

#[test]
fn the_rooms_that_followed_the_wall_are_logged_too() {
    // A wall move changes room areas, and which rooms shrank is the part that says whether
    // the template's proportions were wrong.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 400.0);

    let l = log(&seq, &Session::default());
    let resized: Vec<_> = l
        .corrections
        .iter()
        .filter(|c| matches!(c.kind, Kind::RoomResized { .. }))
        .collect();
    assert!(!resized.is_empty(), "{:#?}", l.corrections);
    if let Kind::RoomResized {
        name,
        from_m2,
        to_m2,
        ..
    } = &resized[0].kind
    {
        assert!(!name.is_empty());
        assert_ne!(from_m2, to_m2);
    }
}

#[test]
fn an_agent_edit_is_logged_and_says_it_was_an_agent() {
    // Who moved it matters as much as what moved: a template the *agent* keeps correcting
    // and a template the *architect* keeps correcting are different problems.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    run(
        &mut seq,
        Author::Agent(AgentId("claude".into()), PlanId("plan-1".into())),
        Command::MoveWall {
            entity: wall,
            dx_mm: 200.0,
            dy_mm: 0.0,
        },
    );
    let l = log(&seq, &Session::default());
    assert!(
        l.corrections.iter().any(|c| c.author == "agent"),
        "{:?}",
        l.corrections
    );
}

#[test]
fn the_parameter_set_and_the_chosen_branch_are_in_the_log() {
    let seq = generated();
    let session = Session {
        chosen_option: Some("2bhk.front-living.v1+larger-living".into()),
        options_offered: vec![
            "2bhk.front-living.v1".into(),
            "2bhk.front-living.v1+larger-living".into(),
        ],
        exports: vec![],
    };
    let l = log(&seq, &session);
    let brief = l.brief.as_ref().expect("the brief travelled with the plan");
    assert!(brief.get("plot_width").is_some(), "{brief}");
    assert!(brief.get("bedrooms").is_some(), "{brief}");
    assert_eq!(
        l.chosen_option.as_deref(),
        Some("2bhk.front-living.v1+larger-living")
    );
    // The rejected options are logged too. A choice is only informative against what was
    // turned down.
    assert_eq!(l.options_offered.len(), 2);
}

#[test]
fn whether_the_session_exported_is_the_headline() {
    // "40% of sessions reach a DXF or PDF export — the only real signal the output was
    // usable." A session with forty plans and no export is a failure, not engagement.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 100.0);
    drag(&mut seq, wall, -50.0);

    let quiet = log(&seq, &Session::default());
    assert!(!quiet.exported);
    assert_eq!(quiet.wall_edits_before_export, 2);

    let shipped = log(
        &seq,
        &Session {
            exports: vec![Export {
                format: "dxf".into(),
                at_step: 99,
            }],
            ..Default::default()
        },
    );
    assert!(shipped.exported);
    assert_eq!(shipped.wall_edits_before_export, 2);
}

#[test]
fn edits_after_the_export_do_not_count_toward_the_metric() {
    // "Median under 8 wall edits — measures how close first generation lands." Edits made
    // after the architect already exported measure something else, and folding them in
    // would make a template look worse the longer somebody kept working on it.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 100.0);
    let at = seq.applied();
    drag(&mut seq, wall, 100.0);
    drag(&mut seq, wall, 100.0);

    let l = log(
        &seq,
        &Session {
            exports: vec![Export {
                format: "pdf".into(),
                at_step: at,
            }],
            ..Default::default()
        },
    );
    assert_eq!(l.wall_edits_before_export, 1, "{:#?}", l.corrections);
    assert_eq!(
        l.corrections
            .iter()
            .filter(|c| matches!(c.kind, Kind::WallMoved { .. }))
            .count(),
        3,
        "the later edits were dropped rather than merely uncounted"
    );
}

#[test]
fn an_undone_edit_is_not_in_the_log() {
    // The log reads the applied prefix, so undo removes an edit from it. That is the right
    // answer: a wall the architect moved and then put back is not a correction to the
    // template, it is a change of mind, and counting it would inflate every metric.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 300.0);
    assert!(!log(&seq, &Session::default()).corrections.is_empty());

    seq.undo();
    let l = log(&seq, &Session::default());
    assert!(l.corrections.is_empty(), "{:#?}", l.corrections);
}

#[test]
fn the_log_is_the_history_and_cannot_disagree_with_it() {
    // The reason this is derived rather than recorded. A parallel event stream would drift
    // the moment a call site was missed, and the log would say 300mm while the document
    // said 400mm with no way to tell which was right.
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    for dx in [300.0, -100.0, 50.0] {
        drag(&mut seq, wall, dx);
    }
    let l = log(&seq, &Session::default());
    let total: f64 = l
        .corrections
        .iter()
        .filter_map(|c| match c.kind {
            Kind::WallMoved { dx_mm, .. } => Some(dx_mm),
            _ => None,
        })
        .sum();
    assert!((total - 250.0).abs() < 0.01, "{total}");

    // And the end state agrees with the sum.
    let Some(Component::WallProfile(w)) = seq.document().component(
        tri_doc::EntityId::from_raw(wall),
        &ComponentKey::WallProfile,
    ) else {
        panic!()
    };
    let fresh = generated();
    let Some(Component::WallProfile(w0)) = fresh.document().component(
        tri_doc::EntityId::from_raw(wall),
        &ComponentKey::WallProfile,
    ) else {
        panic!()
    };
    let moved = (w.centreline[0].x.as_um() - w0.centreline[0].x.as_um()) as f64 / 1000.0;
    assert!(
        (moved - total).abs() < 0.01,
        "log says {total}, document says {moved}"
    );
}

#[test]
fn the_log_serialises_to_something_a_person_can_read() {
    let mut seq = generated();
    let wall = an_internal_wall(&seq);
    drag(&mut seq, wall, 300.0);
    let l = log(&seq, &Session::default());
    let json = String::from_utf8(l.to_json()).unwrap();
    assert!(json.contains("\"kind\": \"wall_moved\""), "{json}");
    assert!(json.contains("from_mm"));
    assert!(json.contains("\"exported\": false"));
    assert!(l.summary().contains("wall move"), "{}", l.summary());
}
