//! Commit-level M1 tests: round-tripping, authorship, and the reject/replay path that
//! PRD §4.4 covers in one sentence.

use tri_commit::{
    AgentId, Author, Commit, CommitError, CommitId, LocalSession, Plan, PlanId, PlanStep,
    Sequencer, UserId,
};
use tri_doc::component::WallProfile;
use tri_doc::layer::Layer;
use tri_doc::{Component, Document, EntityId, Length, Op, Point2, Tracked};

fn human() -> Author {
    Author::Human(UserId("amitesh".into()))
}

fn layer_op(name: &str) -> Op {
    Op::CreateLayer {
        layer: Layer {
            name: name.into(),
            parent: None,
            visible: true,
            color: [0, 0, 0, 255],
        },
    }
}

fn wall_op(len_mm: i64) -> Op {
    Op::CreateEntity {
        components: vec![Component::WallProfile(WallProfile {
            centreline: vec![
                Point2::new(Length::ZERO, Length::ZERO),
                Point2::new(Length::from_mm(len_mm), Length::ZERO),
            ],
            thickness: Tracked::inferred(Length::from_mm(230), "paired polylines"),
            height: Tracked::assumed(Length::from_mm(2700), "project default"),
            base_elevation: Tracked::assumed(Length::ZERO, "no level data"),
        })],
    }
}

// ---------------------------------------------------------------------------
// Commit identity
// ---------------------------------------------------------------------------

#[test]
fn commit_ids_are_content_addressed_and_reproducible() {
    let a = Commit::new(
        CommitId::ROOT,
        human(),
        vec![layer_op("A-WALL")],
        "add layer",
    );
    let b = Commit::new(
        CommitId::ROOT,
        human(),
        vec![layer_op("A-WALL")],
        "add layer",
    );
    assert_eq!(a.id(), b.id(), "same content must give the same id");
    assert!(a.verify_id());

    let different_message = Commit::new(
        CommitId::ROOT,
        human(),
        vec![layer_op("A-WALL")],
        "add layer.",
    );
    assert_ne!(a.id(), different_message.id());

    let different_parent = Commit::new(a.id(), human(), vec![layer_op("A-WALL")], "add layer");
    assert_ne!(a.id(), different_parent.id());

    let different_author = Commit::new(
        CommitId::ROOT,
        Author::Agent(AgentId("claude".into()), PlanId("p1".into())),
        vec![layer_op("A-WALL")],
        "add layer",
    );
    assert_ne!(a.id(), different_author.id());
}

#[test]
fn a_tampered_commit_is_refused() {
    let good = Commit::new(CommitId::ROOT, human(), vec![layer_op("A")], "m");
    let json = serde_json::to_value(&good).unwrap();
    let mut tampered = json.clone();
    tampered["message"] = serde_json::Value::String("something else".into());
    let tampered: Commit = serde_json::from_value(tampered).unwrap();

    assert!(!tampered.verify_id());
    let mut seq = Sequencer::default();
    assert!(matches!(
        seq.submit(tampered),
        Err(CommitError::Tampered(_))
    ));
}

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

#[test]
fn commit_round_trips_through_the_sequencer() {
    let mut seq = Sequencer::default();
    let c1 = seq
        .submit(Commit::new(
            CommitId::ROOT,
            human(),
            vec![layer_op("A-WALL")],
            "layer",
        ))
        .unwrap();
    let c2 = seq
        .submit(Commit::new(c1.id(), human(), vec![wall_op(6000)], "wall"))
        .unwrap();

    assert_eq!(seq.head(), c2.id());
    assert_eq!(seq.history().len(), 2);
    assert_eq!(seq.document().entity_count(), 1);
    assert_eq!(seq.document().layers().len(), 1);

    // Replaying the same commits from empty reproduces the document exactly.
    let mut replay = Sequencer::default();
    for c in seq.history().iter() {
        replay.submit(c.clone()).unwrap();
    }
    assert_eq!(replay.document().hash(), seq.document().hash());
}

#[test]
fn a_rejected_commit_does_not_enter_history_or_change_the_document() {
    let mut seq = Sequencer::default();
    seq.submit(Commit::new(
        CommitId::ROOT,
        human(),
        vec![layer_op("A")],
        "ok",
    ))
    .unwrap();
    let before = seq.document().hash();

    let bad = Commit::new(
        seq.head(),
        human(),
        vec![Op::DeleteEntity {
            id: EntityId::from_raw(999),
        }],
        "delete a thing that isn't there",
    );
    assert!(matches!(seq.submit(bad), Err(CommitError::Rejected { .. })));

    assert_eq!(seq.document().hash(), before);
    assert_eq!(seq.history().len(), 1);
}

#[test]
fn a_stale_parent_is_rebased_rather_than_refused() {
    // Two clients branch from the same head. PRD §4.4: arrival order wins, both land.
    let mut seq = Sequencer::default();
    let base = seq
        .submit(Commit::new(
            CommitId::ROOT,
            human(),
            vec![layer_op("base")],
            "base",
        ))
        .unwrap();

    let from_alice = Commit::new(base.id(), human(), vec![layer_op("alice")], "alice");
    let from_bob = Commit::new(base.id(), human(), vec![layer_op("bob")], "bob");

    seq.submit(from_alice).unwrap();
    let bob_sequenced = seq.submit(from_bob.clone()).unwrap();

    assert_ne!(
        bob_sequenced.id(),
        from_bob.id(),
        "a rebased commit is a different commit and must get a new id"
    );
    assert_eq!(seq.document().layers().len(), 3);
}

// ---------------------------------------------------------------------------
// Authorship / I7 audit trail
// ---------------------------------------------------------------------------

#[test]
fn agent_commits_are_traceable_to_the_plan_that_authorised_them() {
    let plan = Plan {
        id: PlanId("plan-7".into()),
        agent: AgentId("claude".into()),
        summary: "Extrude the north wall run to 2700mm".into(),
        // The plan carries commands, not ops — see the note on PlanStep. `commit` does
        // not interpret them, so the test uses an opaque value here on purpose.
        steps: vec![PlanStep {
            message: "create wall".into(),
            commands: vec![serde_json::json!({ "command": "create_wall" })],
        }],
    };
    assert_eq!(plan.command_count(), 1);

    let approved = plan.approve(UserId("amitesh".into()));
    let mut seq = Sequencer::default();
    for step in approved.steps() {
        seq.submit(Commit::new(
            seq.head(),
            approved.author(),
            // The agent host translates commands into ops through the registry; this
            // test stands in for that step with the wall op directly.
            vec![wall_op(4000)],
            step.message.clone(),
        ))
        .unwrap();
    }

    let by_plan = seq.history().by_plan(&PlanId("plan-7".into()));
    assert_eq!(by_plan.len(), 1);
    assert!(by_plan[0].author().is_agent());
    assert_eq!(approved.approver().0, "amitesh");
}

// ---------------------------------------------------------------------------
// Optimistic apply / reject / replay — the sentence PRD §4.4 skips over
// ---------------------------------------------------------------------------

#[test]
fn rejecting_the_first_of_three_pending_commits_replays_the_rest() {
    let mut session = LocalSession::default();
    let c1 = session
        .propose(human(), vec![layer_op("one")], "one")
        .unwrap();
    let _c2 = session
        .propose(human(), vec![layer_op("two")], "two")
        .unwrap();
    let _c3 = session
        .propose(human(), vec![layer_op("three")], "three")
        .unwrap();

    assert_eq!(session.document().layers().len(), 3);
    assert_eq!(session.pending().len(), 3);

    // Server rejects the first. The other two are independent, so both survive.
    let repair = session.on_rejected(c1.id());

    assert!(
        repair.is_clean(),
        "nothing should have been dropped: {repair:?}"
    );
    assert_eq!(repair.replayed.len(), 2);
    assert_eq!(session.pending().len(), 2);
    assert_eq!(
        session.document().layers().len(),
        2,
        "the rejected commit's effect must be gone"
    );
    let names: Vec<_> = session
        .document()
        .layers()
        .iter()
        .map(|(_, l)| l.name.clone())
        .collect();
    assert_eq!(names, vec!["two".to_string(), "three".to_string()]);
}

#[test]
fn a_pending_commit_that_depends_on_a_rejected_one_is_dropped_not_silently_kept() {
    // This is the case that makes rejection hard: C2 only validates because C1 ran.
    let mut session = LocalSession::default();
    let c1 = session
        .propose(human(), vec![layer_op("parent")], "parent")
        .unwrap();
    let c2 = session
        .propose(
            human(),
            vec![Op::RenameLayer {
                id: tri_doc::LayerId::from_raw(1),
                name: "renamed".into(),
            }],
            "rename it",
        )
        .unwrap();

    let repair = session.on_rejected(c1.id());

    assert_eq!(repair.dropped.len(), 1, "C2 must not survive: {repair:?}");
    assert_eq!(repair.dropped[0].0, c2.id());
    assert!(
        repair.dropped[0].1.contains("no such layer"),
        "the user needs to know why: {:?}",
        repair.dropped[0].1
    );
    assert_eq!(session.document().layers().len(), 0);
    assert!(session.pending().is_empty());
}

#[test]
fn a_remote_commit_rebases_pending_work_and_converges() {
    // Alice has unacknowledged local work. Bob's commit arrives from the server.
    // Both must end up in the document, and Alice's client must agree with the server.
    let mut server = Sequencer::default();
    let mut alice = LocalSession::default();

    let alice_local = alice
        .propose(human(), vec![layer_op("alice")], "alice")
        .unwrap();

    let bob = server
        .submit(Commit::new(
            CommitId::ROOT,
            human(),
            vec![layer_op("bob")],
            "bob",
        ))
        .unwrap();
    let repair = alice.on_remote(&bob);
    assert!(repair.is_clean());

    // Alice's commit now reaches the server, which rebases it onto Bob's.
    let alice_sequenced = server
        .submit(Commit::new(
            alice_local.parent(),
            human(),
            alice_local.ops().to_vec(),
            alice_local.message(),
        ))
        .unwrap();
    alice.on_accepted(alice.pending()[0].id());

    assert_eq!(
        alice.document().hash(),
        server.document().hash(),
        "client and server diverged"
    );
    assert_eq!(server.document().layers().len(), 2);
    assert_eq!(alice_sequenced.parent(), bob.id());
}

#[test]
fn accepting_a_commit_advances_the_base_and_leaves_later_work_pending() {
    let mut session = LocalSession::default();
    let c1 = session
        .propose(human(), vec![layer_op("one")], "one")
        .unwrap();
    let _c2 = session
        .propose(human(), vec![layer_op("two")], "two")
        .unwrap();

    let repair = session.on_accepted(c1.id());
    assert!(repair.is_clean());
    assert_eq!(session.pending().len(), 1);
    assert_eq!(session.document().layers().len(), 2);
}

#[test]
fn the_client_catches_an_invalid_edit_without_a_round_trip() {
    // Same validation code on both sides (PRD §4.2), so the client's answer is the
    // server's answer.
    let mut session = LocalSession::default();
    let client = session.propose(
        human(),
        vec![Op::DeleteLayer {
            id: tri_doc::LayerId::from_raw(1),
        }],
        "delete nothing",
    );
    assert!(matches!(client, Err(CommitError::Rejected { .. })));

    let mut server = Sequencer::default();
    let server_answer = server.submit(Commit::new(
        CommitId::ROOT,
        human(),
        vec![Op::DeleteLayer {
            id: tri_doc::LayerId::from_raw(1),
        }],
        "delete nothing",
    ));
    assert!(matches!(server_answer, Err(CommitError::Rejected { .. })));
}

#[test]
fn history_is_append_only_and_unbounded() {
    let mut seq = Sequencer::default();
    for i in 0..200 {
        seq.submit(Commit::new(
            seq.head(),
            human(),
            vec![layer_op(&format!("L{i}"))],
            format!("commit {i}"),
        ))
        .unwrap();
    }
    assert_eq!(seq.history().len(), 200);
    // Parent chain is intact end to end.
    let ids: Vec<_> = seq.history().iter().map(|c| (c.parent(), c.id())).collect();
    for w in ids.windows(2) {
        assert_eq!(w[0].1, w[1].0, "history chain broken");
    }
}

#[test]
fn a_document_with_prior_state_can_seed_a_session() {
    let mut seq = Sequencer::default();
    seq.submit(Commit::new(
        CommitId::ROOT,
        human(),
        vec![layer_op("existing")],
        "seed",
    ))
    .unwrap();

    let mut session = LocalSession::new(seq.document().clone(), seq.head());
    assert_eq!(session.document().layers().len(), 1);
    session
        .propose(human(), vec![layer_op("new")], "new")
        .unwrap();
    assert_eq!(session.document().layers().len(), 2);
    let _ = Document::new();
}
