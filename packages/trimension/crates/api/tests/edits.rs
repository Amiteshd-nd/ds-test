//! P4: direct canvas manipulation.
//!
//! The done-when: "every mouse edit is a commit; undo and history work identically for
//! human and agent edits". The second half is the load-bearing one — a canvas is the
//! easiest place in the product to reach past the command registry and mutate the
//! document, and an undo stack that only knew about mouse edits would be the first sign
//! that somebody had.

use tri_api::command::{Command, CommandError};
use tri_commit::{AgentId, Author, Commit, PlanId, Sequencer, UserId};
use tri_doc::{Component, ComponentKey, Document, Length, Op, Point2, Provenance, Tracked};
use tri_gen::{apply, plan};
use tri_params::{Orientation, ParameterSet};
use tri_rules::{derive_parameters, RuleSet};

fn human() -> Author {
    Author::Human(UserId("amitesh".into()))
}

fn agent() -> Author {
    Author::Agent(AgentId("claude".into()), PlanId("plan-1".into()))
}

/// A generated 2BHK, which is what an architect will actually be dragging.
fn drawn() -> Sequencer {
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

fn run(seq: &mut Sequencer, author: Author, cmd: Command) -> Result<(), String> {
    let ops = cmd
        .to_ops(seq.document(), &author.to_string())
        .map_err(|e| format!("{e:?}"))?;
    let c = Commit::new(seq.head(), author, ops, cmd.name().to_string());
    seq.submit(c).map_err(|e| format!("{e:?}"))?;
    Ok(())
}

/// A vertical wall with a room on each side, which is what a drag actually grabs.
///
/// Strictly inside the envelope: the first version of this took the second vertical wall
/// it found, which is the left *external* one. Moving that grows the rooms outwards
/// instead of trading area between two of them, so the conservation test failed and the
/// collapse test found nothing to collapse — both of them reporting a bad fixture rather
/// than a bad command.
fn an_internal_wall(doc: &Document) -> u64 {
    let verticals: Vec<(u64, i64)> = doc
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(id, set)| match set.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) if w.centreline.len() == 2 => (w.centreline[0].x
                == w.centreline[1].x)
                .then_some((id.raw(), w.centreline[0].x.as_um())),
            _ => None,
        })
        .collect();
    let lo = verticals.iter().map(|(_, x)| *x).min().unwrap();
    let hi = verticals.iter().map(|(_, x)| *x).max().unwrap();
    verticals
        .iter()
        .find(|(_, x)| *x > lo && *x < hi)
        .map(|(id, _)| *id)
        .expect("a generated plan has an internal vertical wall")
}

fn wall_x(doc: &Document, id: u64) -> i64 {
    let Some(Component::WallProfile(w)) =
        doc.component(tri_doc::EntityId::from_raw(id), &ComponentKey::WallProfile)
    else {
        panic!("not a wall")
    };
    w.centreline[0].x.as_um()
}

fn room_areas(doc: &Document) -> Vec<(String, i64)> {
    tri_rules::room::all(doc)
        .into_iter()
        .map(|r| (r.name, r.area_mm2))
        .collect()
}

#[test]
fn a_drag_is_an_ordinary_commit() {
    let mut seq = drawn();
    let before = seq.document().hash().to_hex();
    let commits = seq.history().len();
    let wall = an_internal_wall(seq.document());
    let x0 = wall_x(seq.document(), wall);

    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 300.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();

    assert_eq!(
        seq.history().len(),
        commits + 1,
        "the drag was not a commit"
    );
    assert_ne!(seq.document().hash().to_hex(), before);
    assert_eq!(wall_x(seq.document(), wall), x0 + 300_000);
    // And it went through the ordinary path, so it verifies like any other commit.
    assert!(seq.history().iter().all(|c| c.verify_id()));
}

#[test]
fn the_rooms_on_a_dragged_wall_follow_it() {
    // A room is its own entity holding a recorded area. Moving the wall alone would leave
    // every one of those stale, and the compliance panel reads exactly those numbers — it
    // would go on reporting the areas the template produced while the drawing showed
    // something else.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    let before = room_areas(seq.document());

    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 400.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();

    let after = room_areas(seq.document());
    let changed: Vec<&(String, i64)> = after
        .iter()
        .filter(|(n, a)| before.iter().any(|(bn, ba)| bn == n && ba != a))
        .collect();
    assert!(
        !changed.is_empty(),
        "no room area moved with the wall: {before:?}"
    );
    // The total stays put: the envelope did not change, only where the line inside it is.
    let total = |v: &[(String, i64)]| v.iter().map(|(_, a)| *a).sum::<i64>();
    assert!(
        (total(&before) - total(&after)).abs() < 2_000,
        "{} vs {}",
        total(&before),
        total(&after)
    );
}

#[test]
fn a_room_that_moved_says_it_was_measured_rather_than_assumed() {
    // The template's guess and an architect's drag are different kinds of fact, and I4
    // exists so the difference survives into the document.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    assert!(
        tri_rules::room::all(seq.document())
            .iter()
            .all(|r| r.area_provenance == Provenance::Assumed),
        "a freshly generated plan should be all assumptions"
    );

    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 250.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();

    let measured: Vec<_> = tri_rules::room::all(seq.document())
        .into_iter()
        .filter(|r| r.area_provenance == Provenance::Measured)
        .collect();
    assert!(
        !measured.is_empty(),
        "the moved rooms are still assumptions"
    );
}

#[test]
fn a_drag_that_would_collapse_a_room_is_refused() {
    // `commit::validate` checks that a document is structurally possible, not that a plan
    // still makes sense, so nothing further down would catch this.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    let e = run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: -100_000.0,
            dy_mm: 0.0,
        },
    )
    .unwrap_err();
    assert!(e.contains("collapse"), "{e}");
}

#[test]
fn sliding_a_wall_along_itself_is_not_a_commit() {
    // A vertical wall dragged vertically moves nothing. Recording that would put an empty
    // commit in the history and make undo feel broken.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    let e = run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 0.0,
            dy_mm: 500.0,
        },
    )
    .unwrap_err();
    assert!(e.contains("did not move"), "{e}");
}

#[test]
fn undo_and_redo_restore_the_document_exactly() {
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    let before = seq.document().hash().to_hex();
    let depth = seq.history().len();

    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 300.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();
    let after = seq.document().hash().to_hex();

    assert!(seq.undo());
    assert_eq!(
        seq.document().hash().to_hex(),
        before,
        "undo did not restore"
    );
    assert_eq!(seq.applied(), depth);
    assert!(seq.can_redo());

    assert!(seq.redo());
    assert_eq!(
        seq.document().hash().to_hex(),
        after,
        "redo did not reapply"
    );
    assert!(!seq.can_redo());
}

#[test]
fn undo_works_identically_for_a_human_drag_and_an_agent_call() {
    // The done-when, stated as an experiment: run the same command twice, once from each
    // kind of author, and undo each. If the two paths differed at all — a separate mouse
    // path, a bespoke wasm mutation — this is where it would show.
    let wall = an_internal_wall(drawn().document());
    let cmd = || Command::MoveWall {
        entity: wall,
        dx_mm: 300.0,
        dy_mm: 0.0,
    };

    let mut by_human = drawn();
    let mut by_agent = drawn();
    let start = by_human.document().hash().to_hex();

    run(&mut by_human, human(), cmd()).unwrap();
    run(&mut by_agent, agent(), cmd()).unwrap();

    // The same geometry.
    assert_eq!(
        wall_x(by_human.document(), wall),
        wall_x(by_agent.document(), wall)
    );
    assert_eq!(
        room_areas(by_human.document()),
        room_areas(by_agent.document())
    );

    // But *not* the same document, and that is the point rather than a defect. The room's
    // provenance reason names who moved the edge, and provenance is hashed — a deliberate
    // choice from P1, so a measurement and an assumption of the same number are different
    // documents. Two authors making the same edit leave different records of having made
    // it. Asserting hash equality here, as the first version of this test did, would have
    // been asserting that attribution does not survive into the document.
    assert_ne!(
        by_human.document().hash().to_hex(),
        by_agent.document().hash().to_hex(),
        "the two edits are indistinguishable in the document"
    );
    let measured = |s: &Sequencer| {
        tri_rules::room::all(s.document())
            .into_iter()
            .filter(|r| r.area_provenance == Provenance::Measured)
            .count()
    };
    assert!(measured(&by_human) > 0 && measured(&by_agent) > 0);

    assert!(by_human.undo());
    assert!(by_agent.undo());
    assert_eq!(by_human.document().hash().to_hex(), start);
    assert_eq!(by_agent.document().hash().to_hex(), start);
}

#[test]
fn undo_reaches_back_through_a_generation_as_readily_as_through_a_drag() {
    // Generation is three commits and a drag is one, and undo does not know the
    // difference: it replays a prefix. A stack that only recorded "user actions" would
    // need an opinion about how many commits an action is worth.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 200.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();

    let steps = seq.history().len();
    for _ in 0..steps {
        assert!(seq.undo());
    }
    assert!(!seq.can_undo());
    assert_eq!(seq.document().entity_count(), 0, "an empty document");

    for _ in 0..steps {
        assert!(seq.redo());
    }
    assert_eq!(seq.applied(), steps);
}

#[test]
fn committing_after_an_undo_abandons_what_was_undone() {
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: wall,
            dx_mm: 300.0,
            dy_mm: 0.0,
        },
    )
    .unwrap();
    let n = seq.history().len();

    seq.undo();
    run(
        &mut seq,
        human(),
        Command::SetLabel {
            entity: wall,
            label: "a different edit".into(),
        },
    )
    .unwrap();

    assert_eq!(
        seq.history().len(),
        n,
        "the abandoned commit is still logged"
    );
    assert!(!seq.can_redo(), "redo survived a new edit");
    assert_eq!(
        wall_x(seq.document(), wall),
        wall_x(drawn().document(), wall)
    );
}

#[test]
fn a_replayed_history_reaches_the_same_document() {
    // Undo is rebuild-and-replay rather than inverse ops, which is only sound if replay is
    // exact. This is that assumption, tested directly.
    let mut seq = drawn();
    let wall = an_internal_wall(seq.document());
    for dx in [300.0, -100.0, 50.0] {
        run(
            &mut seq,
            human(),
            Command::MoveWall {
                entity: wall,
                dx_mm: dx,
                dy_mm: 0.0,
            },
        )
        .unwrap();
    }
    let expected = seq.document().hash().to_hex();

    let mut replay = Sequencer::new(Document::new());
    for c in seq.history().iter() {
        replay.submit(c.clone()).expect("replay");
    }
    assert_eq!(replay.document().hash().to_hex(), expected);
}

#[test]
fn moving_something_that_is_not_a_wall_is_refused() {
    let mut seq = drawn();
    let room = tri_rules::room::all(seq.document())[0].entity.raw();
    let e = run(
        &mut seq,
        human(),
        Command::MoveWall {
            entity: room,
            dx_mm: 100.0,
            dy_mm: 0.0,
        },
    )
    .unwrap_err();
    assert!(e.contains("not a wall"), "{e}");

    let missing = Command::MoveWall {
        entity: 99_999,
        dx_mm: 100.0,
        dy_mm: 0.0,
    }
    .to_ops(seq.document(), "test");
    assert!(matches!(missing, Err(CommandError::UnknownEntity(99_999))));
}

/// Silence the unused-import warning for helpers a future test will want.
#[allow(dead_code)]
fn _unused(_: Op, _: Point2, _: Tracked<Length>) {}
