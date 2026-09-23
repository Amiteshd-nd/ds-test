//! P2's tests: the brief is a document component, versioned by commits, and every value
//! carries where it came from.

use tri_commit::{Author, Commit, Sequencer};
use tri_doc::component::ComponentKey;
use tri_doc::{Length, Op, Provenance};
use tri_params::{component, Orientation, ParameterSet};

fn brief() -> ParameterSet {
    // 30 x 40 ft.
    ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        3,
        2,
        1,
    )
    .expect("a 30x40ft 3BHK G+1 is in scope")
}

fn commit_params(seq: &mut Sequencer, p: &ParameterSet, message: &str) {
    let ops = vec![
        Op::RegisterType {
            def: component::type_definition(),
        },
        Op::CreateEntity {
            components: vec![component::to_component(p)],
        },
    ];
    seq.submit(Commit::new(
        seq.head(),
        Author::Human(tri_commit::UserId("amitesh".into())),
        ops,
        message,
    ))
    .expect("a parameter set is a valid commit");
}

// ---------------------------------------------------------------------------
// Every value knows where it came from
// ---------------------------------------------------------------------------

#[test]
fn every_parameter_carries_a_provenance_and_a_reason() {
    let p = brief();
    for (field, _, reason) in p.all_records() {
        assert!(
            !reason.trim().is_empty(),
            "{field} has no reason for its value"
        );
    }
    // Every field is reported, checked against serde's own view of the struct rather than
    // a magic number — so adding a field without adding it to `all_records` fails here
    // instead of silently dropping out of the provenance panel.
    let json = serde_json::to_value(&p).unwrap();
    let fields = json.as_object().expect("a struct").len();
    assert_eq!(
        p.all_records().len(),
        fields,
        "all_records() reports {} of {fields} fields",
        p.all_records().len()
    );
}

#[test]
fn the_three_tiers_map_onto_the_three_provenances() {
    let p = brief();
    let by: std::collections::BTreeMap<_, _> = p
        .all_records()
        .into_iter()
        .map(|(f, prov, _)| (f, prov))
        .collect();

    // Tier 1 — the architect typed it.
    for f in [
        "plot_width",
        "plot_depth",
        "road_facing",
        "bedrooms",
        "floors",
        "car_parking",
    ] {
        assert_eq!(by[f], Provenance::Measured, "{f} should be tier 1");
    }
    // Tier 3 — a default.
    for f in [
        "external_wall",
        "internal_wall",
        "floor_to_floor",
        "main_door",
    ] {
        assert_eq!(by[f], Provenance::Assumed, "{f} should be a default");
    }
    // A convention is a rule, not a default: it follows from the bedroom count.
    assert_eq!(by["toilets"], Provenance::Inferred);
}

#[test]
fn a_default_says_it_is_a_default() {
    // "Do not let a default become a fact." A 230mm wall must never read as measured.
    let p = brief();
    assert_eq!(p.external_wall.get(), Length::from_mm(230));
    assert_eq!(p.external_wall.provenance(), Provenance::Assumed);
    assert!(p.external_wall.reason().contains("default"));
}

#[test]
fn tier_two_starts_undrived_rather_than_zero() {
    // A setback of zero and a setback we have not computed are different things. Reading
    // the first as the second is how a plan gets laid out against no setback at all.
    let p = brief();
    assert!(!p.is_derived());
    assert!(
        p.setback_front.reason().contains("not derived yet"),
        "{}",
        p.setback_front.reason()
    );
}

#[test]
fn out_of_scope_briefs_are_refused_with_the_bound_that_was_missed() {
    let too_many = ParameterSet::from_brief(
        Length::from_mm(9144),
        Length::from_mm(12192),
        Orientation::North,
        9,
        2,
        1,
    );
    let e = too_many.expect_err("9 bedrooms is outside MVP scope");
    let text = e.to_string();
    assert!(text.contains("bedrooms") && text.contains('4'), "{text}");
}

// ---------------------------------------------------------------------------
// It lives on the document (I2), through commits (I1)
// ---------------------------------------------------------------------------

#[test]
fn the_parameter_set_round_trips_through_a_component() {
    let p = brief();
    let back = component::from_component(&component::to_component(&p)).expect("round trip");
    assert_eq!(p, back);
}

#[test]
fn provenance_survives_storage() {
    // The point of the whole exercise: a value stored and read back still knows it was
    // a default.
    let p = brief();
    let back = component::from_component(&component::to_component(&p)).unwrap();
    assert_eq!(back.external_wall.provenance(), Provenance::Assumed);
    assert_eq!(back.external_wall.reason(), p.external_wall.reason());
    assert_eq!(back.plot_width.provenance(), Provenance::Measured);
}

#[test]
fn a_field_stored_without_provenance_is_an_error_not_a_guess() {
    use std::collections::BTreeMap;
    use tri_doc::component::{CanonicalValue, Component};

    // Calling an unprovenanced value "assumed" would invent a record nobody wrote.
    let Component::Custom { type_name, data } = component::to_component(&brief()) else {
        unreachable!()
    };
    let mut stripped: BTreeMap<_, _> = data;
    stripped.insert(
        "external_wall".to_string(),
        CanonicalValue::Length(Length::from_mm(230)),
    );
    let err = component::from_component(&Component::Custom {
        type_name,
        data: stripped,
    })
    .expect_err("a bare value must be rejected");
    assert!(err.to_string().contains("without provenance"), "{err}");
}

#[test]
fn changing_a_parameter_is_a_commit_and_history_replays_to_the_same_hash() {
    let mut seq = Sequencer::default();
    commit_params(&mut seq, &brief(), "the brief");

    // The architect corrects the bedroom count.
    let mut revised = brief();
    revised.bedrooms = tri_doc::Tracked::measured(4u8, "corrected by the architect");
    let (entity, _) = component::find(seq.document()).expect("a set is on the document");
    seq.submit(Commit::new(
        seq.head(),
        Author::Human(tri_commit::UserId("amitesh".into())),
        vec![Op::SetComponent {
            id: entity,
            component: component::to_component(&revised),
        }],
        "4 bedrooms, not 3",
    ))
    .expect("a parameter change is a valid commit");

    assert_eq!(seq.history().len(), 2);
    let (_, stored) = component::find(seq.document()).unwrap();
    assert_eq!(stored.bedrooms.get(), 4);

    // Replaying the commits from empty reproduces the document exactly — which is only
    // true if the parameter set lives in the document rather than beside it.
    let mut replay = Sequencer::default();
    for c in seq.history().iter() {
        replay.submit(c.clone()).expect("replay");
    }
    assert_eq!(replay.document().hash(), seq.document().hash());
}

#[test]
fn the_same_brief_always_hashes_the_same() {
    let build = || {
        let mut s = Sequencer::default();
        commit_params(&mut s, &brief(), "the brief");
        s.document().hash()
    };
    assert_eq!(build(), build());
}

#[test]
fn changing_only_a_reason_changes_the_document() {
    // Two plans with the same numbers but different justifications are different
    // documents. A reviewer who signed one has not signed the other.
    let mut a = Sequencer::default();
    commit_params(&mut a, &brief(), "x");

    let mut altered = brief();
    altered.external_wall = tri_doc::Tracked::measured(Length::from_mm(230), "measured on site");
    let mut b = Sequencer::default();
    commit_params(&mut b, &altered, "x");

    assert_ne!(a.document().hash(), b.document().hash());
}

#[test]
fn the_parameter_set_is_visible_to_the_generic_provenance_path() {
    // The compliance panel and the agent's query layer read provenance generically. If
    // the parameter set were invisible to them it would need its own bespoke panel.
    let mut seq = Sequencer::default();
    commit_params(&mut seq, &brief(), "x");

    let (id, _) = component::find(seq.document()).unwrap();
    let records = seq
        .document()
        .component(id, &ComponentKey::Custom(component::TYPE_NAME.into()))
        .unwrap()
        .provenance_records();

    let expected = serde_json::to_value(brief())
        .unwrap()
        .as_object()
        .unwrap()
        .len();
    assert_eq!(records.len(), expected, "not all fields reported");
    assert!(records
        .iter()
        .any(|(f, p, _)| f == "external_wall" && *p == Provenance::Assumed));
    // Nested door sizes report a dotted path rather than a bare "width".
    assert!(
        records.iter().any(|(f, _, _)| f == "main_door"),
        "door fields missing: {:?}",
        records.iter().map(|(f, _, _)| f).collect::<Vec<_>>()
    );
}
