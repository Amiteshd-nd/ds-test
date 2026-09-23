//! F5's branch semantics: siblings from a shared parent, and switching that loses nothing.

use tri_commit::{Author, Branch, Branches, Commit, Sequencer, UserId};
use tri_doc::layer::Layer;
use tri_doc::{Document, Op};

fn human() -> Author {
    Author::Human(UserId("amitesh".into()))
}

fn layer(name: &str) -> Op {
    Op::CreateLayer {
        layer: Layer {
            name: name.into(),
            parent: None,
            visible: true,
            color: [200, 200, 200, 255],
        },
    }
}

/// A sequencer with one commit already in it, standing in for whatever the document held
/// before generation.
fn base() -> Sequencer {
    let mut seq = Sequencer::new(Document::new());
    seq.submit(Commit::new(
        seq.head(),
        human(),
        vec![layer("A-EXISTING")],
        "something that was already here",
    ))
    .unwrap();
    seq
}

fn fork_with(base: &Sequencer, name: &str) -> Sequencer {
    let mut f = base.clone();
    f.submit(Commit::new(
        f.head(),
        human(),
        vec![layer(name)],
        format!("option {name}"),
    ))
    .unwrap();
    f
}

fn three() -> (Sequencer, Branches) {
    let base = base();
    let mut set = Branches::new();
    for name in ["A", "B", "C"] {
        set.push(Branch::new(
            name.to_string(),
            format!("option {name}"),
            "note".into(),
            fork_with(&base, name),
            base.head(),
        ));
    }
    (base, set)
}

#[test]
fn every_option_grows_from_the_same_parent_commit() {
    // The PRD's claim is that options are "branches from a shared parent". If each branch
    // started from an empty document instead, they would be four unrelated drawings that
    // merely looked alike, and nothing already in the document would survive generation.
    let (base, set) = three();
    assert_eq!(set.len(), 3);
    for b in set.iter() {
        assert_eq!(b.base, base.head(), "{} is not a sibling", b.key);
        assert_eq!(
            b.depth(),
            base.history().len() + 1,
            "{} lost the history it branched from",
            b.key
        );
        assert!(
            b.sequencer()
                .history()
                .iter()
                .any(|c| c.message().contains("already here")),
            "{} discarded what the document already held",
            b.key
        );
    }
}

#[test]
fn options_are_genuinely_different_documents() {
    let (_, set) = three();
    let mut hashes: Vec<String> = set.iter().map(|b| b.document().hash().to_hex()).collect();
    hashes.sort();
    let n = hashes.len();
    hashes.dedup();
    assert_eq!(hashes.len(), n, "two branches hold the same document");
}

#[test]
fn switching_away_and_back_keeps_an_edit_made_on_a_branch() {
    // The done-when: "switching is instant and lossless." Lossless is the hard half, and
    // it is not automatic — the working sequencer has to be written back into the slot it
    // came from before the next one is taken. Without that, editing option A, glancing at
    // B and returning silently discards the edit. Quietly losing work an architect did is
    // worse than never offering options: "losing a version they liked is the fastest way
    // to lose the user."
    let (base, mut set) = three();
    let mut working = set.switch("A", base.clone()).expect("A exists");
    assert_eq!(set.current_key(), Some("A"));

    // Edit A.
    working
        .submit(Commit::new(
            working.head(),
            human(),
            vec![layer("A-EDIT")],
            "the architect moved a wall",
        ))
        .unwrap();
    let edited = working.document().hash().to_hex();
    let depth = working.history().len();

    // Look at B, then come back.
    working = set.switch("B", working).expect("B exists");
    assert_ne!(working.document().hash().to_hex(), edited);
    working = set.switch("A", working).expect("A exists");

    assert_eq!(
        working.document().hash().to_hex(),
        edited,
        "the edit made on A did not survive a trip to B"
    );
    assert_eq!(working.history().len(), depth);
    assert!(working
        .history()
        .iter()
        .any(|c| c.message().contains("moved a wall")));
}

#[test]
fn an_edit_on_one_branch_does_not_reach_its_siblings() {
    let (base, mut set) = three();
    let mut working = set.switch("A", base.clone()).unwrap();
    let b_before = set.get("B").unwrap().document().hash().to_hex();

    working
        .submit(Commit::new(
            working.head(),
            human(),
            vec![layer("A-EDIT")],
            "an edit on A only",
        ))
        .unwrap();
    set.save(working);

    assert_eq!(
        set.get("B").unwrap().document().hash().to_hex(),
        b_before,
        "an edit on A changed B"
    );
}

#[test]
fn switching_to_an_unknown_option_changes_nothing() {
    let (base, mut set) = three();
    let working = set.switch("A", base.clone()).unwrap();
    let before = working.document().hash().to_hex();
    assert!(set.switch("nonexistent", working.clone()).is_none());
    assert_eq!(set.current_key(), Some("A"));
    assert_eq!(working.document().hash().to_hex(), before);
}

#[test]
fn regenerating_replaces_the_options_rather_than_adding_to_them() {
    let (base, mut set) = three();
    set.switch("A", base.clone()).unwrap();
    set.replace(vec![Branch::new(
        "D".into(),
        "option D".into(),
        "note".into(),
        fork_with(&base, "D"),
        base.head(),
    )]);
    assert_eq!(set.len(), 1);
    assert_eq!(set.current_key(), None, "a stale selection survived");
}

#[test]
fn a_second_generation_forks_from_where_the_first_one_did() {
    // A new brief replaces the plan; it does not add a second house to the plot. Forking
    // from the working branch instead left both buildings in the document — 40 entities,
    // duplicated layers, and a compliance panel reporting FAR 5.17 against 1.75.
    let start = base();
    let mut set = Branches::new();

    // First generation.
    let root = set.root(&start);
    assert_eq!(root.head(), start.head());
    set.replace(vec![Branch::new(
        "A".into(),
        "first".into(),
        String::new(),
        fork_with(&root, "A"),
        root.head(),
    )]);
    let working = set.switch("A", start.clone()).unwrap();
    assert_eq!(working.history().len(), start.history().len() + 1);

    // Second generation, from the plan now in front.
    let root2 = set.root(&working);
    assert_eq!(
        root2.head(),
        start.head(),
        "the second generation grew from the first plan instead of from the document"
    );
    let second = fork_with(&root2, "B");
    assert_eq!(
        second.history().len(),
        start.history().len() + 1,
        "the second plan carried the first one along with it"
    );
    assert!(
        !second
            .history()
            .iter()
            .any(|c| c.message().contains("option A")),
        "the replaced plan is still in the new one's history"
    );
    // What was in the document before any generation still is.
    assert!(second
        .history()
        .iter()
        .any(|c| c.message().contains("already here")));
}

#[test]
fn forgetting_the_root_lets_a_replaced_document_be_read_again() {
    let start = base();
    let mut set = Branches::new();
    set.root(&start);

    let mut replaced = Sequencer::new(Document::new());
    replaced
        .submit(Commit::new(
            replaced.head(),
            human(),
            vec![layer("A-IMPORTED")],
            "a drawing loaded over the top",
        ))
        .unwrap();

    assert_eq!(set.root(&replaced).head(), start.head(), "still remembered");
    set.forget_root();
    assert_eq!(set.root(&replaced).head(), replaced.head());
}
