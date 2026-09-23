//! M1's required tests (PRD §6, Prompt 2).
//!
//! These are the tests the milestone is defined by, so they are deliberately written
//! against the public API only — if a test needs privileged access, the API is wrong.

use std::collections::BTreeMap;
use tri_doc::component::{
    CanonicalValue, Component, ComponentKey, Opening, OpeningKind, Polyline2d, Transform, TypeDef,
    WallProfile,
};
use tri_doc::layer::Layer;
use tri_doc::source::{ImportRecord, SourceEntity};
use tri_doc::{
    check, validate_and_apply, ApplyError, Document, Length, Op, Point2, Provenance, Tracked,
    Violation,
};

fn layer(name: &str, parent: Option<tri_doc::LayerId>) -> Layer {
    Layer {
        name: name.to_string(),
        parent,
        visible: true,
        color: [255, 255, 255, 255],
    }
}

fn wall(points: Vec<Point2>) -> Component {
    Component::WallProfile(WallProfile {
        centreline: points,
        thickness: Tracked::inferred(
            Length::from_mm(230),
            "paired parallel polylines 4.2mm apart",
        ),
        height: Tracked::assumed(Length::from_mm(2700), "no DIMENSION found; project default"),
        base_elevation: Tracked::assumed(Length::ZERO, "no level data in drawing"),
    })
}

fn p(x_mm: i64, y_mm: i64) -> Point2 {
    Point2::new(Length::from_mm(x_mm), Length::from_mm(y_mm))
}

// ---------------------------------------------------------------------------
// Required test 1: layer cycles are rejected
// ---------------------------------------------------------------------------

#[test]
fn nested_reparent_that_would_cycle_is_rejected() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[
            Op::CreateLayer {
                layer: layer("A", None),
            },
            Op::CreateLayer {
                layer: layer("B", None),
            },
            Op::CreateLayer {
                layer: layer("C", None),
            },
        ],
    )
    .expect("creating three root layers is valid");
    let (a, b, c) = (m.layers[0], m.layers[1], m.layers[2]);

    // Build A -> B -> C.
    validate_and_apply(
        &mut doc,
        &[
            Op::ReparentLayer {
                id: b,
                new_parent: Some(a),
            },
            Op::ReparentLayer {
                id: c,
                new_parent: Some(b),
            },
        ],
    )
    .expect("a linear chain is valid");

    // Now close the loop: A under C.
    let err = check(
        &doc,
        &[Op::ReparentLayer {
            id: a,
            new_parent: Some(c),
        }],
    )
    .expect_err("A under its own grandchild must be rejected");

    assert!(
        matches!(&err[0], Violation::At(0, inner)
            if matches!(**inner, Violation::LayerCycle { child, parent } if child == a && parent == c)),
        "expected LayerCycle, got {err:?}"
    );
}

#[test]
fn a_layer_cannot_parent_itself() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[Op::CreateLayer {
            layer: layer("A", None),
        }],
    )
    .unwrap();
    let a = m.layers[0];
    assert!(check(
        &doc,
        &[Op::ReparentLayer {
            id: a,
            new_parent: Some(a)
        }]
    )
    .is_err());
}

#[test]
fn a_cycle_created_across_two_ops_in_one_batch_is_rejected() {
    // The interesting case: neither op is individually a cycle. Validation has to model
    // the batch's intermediate state, not just the committed one.
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[
            Op::CreateLayer {
                layer: layer("A", None),
            },
            Op::CreateLayer {
                layer: layer("B", None),
            },
        ],
    )
    .unwrap();
    let (a, b) = (m.layers[0], m.layers[1]);

    let err = check(
        &doc,
        &[
            Op::ReparentLayer {
                id: b,
                new_parent: Some(a),
            },
            Op::ReparentLayer {
                id: a,
                new_parent: Some(b),
            },
        ],
    )
    .expect_err("batch closes a loop on its second op");
    assert!(matches!(&err[0], Violation::At(1, _)), "got {err:?}");
}

#[test]
fn deleting_a_layer_with_children_is_rejected() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[
            Op::CreateLayer {
                layer: layer("parent", None),
            },
            Op::CreateLayer {
                layer: layer("child", None),
            },
        ],
    )
    .unwrap();
    let (parent, child) = (m.layers[0], m.layers[1]);
    validate_and_apply(
        &mut doc,
        &[Op::ReparentLayer {
            id: child,
            new_parent: Some(parent),
        }],
    )
    .unwrap();

    let err = check(&doc, &[Op::DeleteLayer { id: parent }]).unwrap_err();
    assert!(
        matches!(&err[0], Violation::At(0, inner)
            if matches!(**inner, Violation::LayerHasChildren { children: 1, .. })),
        "got {err:?}"
    );
}

// ---------------------------------------------------------------------------
// Required test 2: a rejected commit leaves the document bit-identical
// ---------------------------------------------------------------------------

#[test]
fn a_rejected_commit_leaves_the_document_bit_identical() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[
            Op::CreateLayer {
                layer: layer("A-WALL", None),
            },
            Op::CreateEntity {
                components: vec![wall(vec![p(0, 0), p(5000, 0)])],
            },
        ],
    )
    .unwrap();

    let before_hash = doc.hash();
    let before_bytes = serde_json::to_vec(&doc).unwrap();
    let before_revision = doc.revision();

    // A batch whose first two ops are fine and whose third is not. Nothing may land.
    let bad = vec![
        Op::CreateEntity {
            components: vec![wall(vec![p(0, 0), p(1000, 0)])],
        },
        Op::SetLayerVisible {
            id: m.layers[0],
            visible: false,
        },
        Op::ReparentLayer {
            id: m.layers[0],
            new_parent: Some(tri_doc::LayerId::from_raw(9999)),
        },
    ];

    let err = check(&doc, &bad).expect_err("third op references a nonexistent layer");
    assert!(!err.is_empty());

    assert_eq!(
        doc.hash(),
        before_hash,
        "hash changed after a rejected commit"
    );
    assert_eq!(
        serde_json::to_vec(&doc).unwrap(),
        before_bytes,
        "bytes changed"
    );
    assert_eq!(doc.revision(), before_revision, "revision advanced");
    assert_eq!(
        doc.entity_count(),
        1,
        "a valid op from a rejected batch was applied"
    );
}

// ---------------------------------------------------------------------------
// Required test 3: hashing is deterministic
// ---------------------------------------------------------------------------

fn build_reference_document() -> Document {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[
            Op::CreateLayer {
                layer: layer("A-WALL", None),
            },
            Op::CreateLayer {
                layer: layer("A-DOOR", None),
            },
        ],
    )
    .unwrap();

    let src = validate_and_apply(
        &mut doc,
        &[Op::AddSourceEntity {
            entity: SourceEntity {
                kind: "LWPOLYLINE".into(),
                layer: "A-WALL".into(),
                handle: Some("2F1".into()),
                attributes: BTreeMap::from([
                    ("closed".to_string(), CanonicalValue::Bool(false)),
                    ("vertices".to_string(), CanonicalValue::Int(2)),
                ]),
            },
        }],
    )
    .unwrap();

    let wall_ids = validate_and_apply(
        &mut doc,
        &[Op::CreateEntity {
            components: vec![
                wall(vec![p(0, 0), p(6000, 0)]),
                Component::LayerRef(m.layers[0]),
                Component::SourceRef(vec![src.sources[0]]),
                Component::Transform(Transform::IDENTITY),
                Component::Label("W-01".into()),
                Component::Provenance {
                    provenance: Provenance::Inferred,
                    reason: "layer name matched rule wall.by_layer".into(),
                },
            ],
        }],
    )
    .unwrap();

    validate_and_apply(
        &mut doc,
        &[
            Op::CreateEntity {
                components: vec![
                    Component::Opening(Opening {
                        host: wall_ids.entities[0],
                        kind: OpeningKind::Door,
                        position: Length::from_mm(2000),
                        width: Tracked::measured(Length::from_mm(900), "INSERT block DOOR-900"),
                        height: Tracked::assumed(
                            Length::from_mm(2100),
                            "no height in block; default",
                        ),
                        sill: Tracked::measured(Length::ZERO, "door: sill at floor by definition"),
                    }),
                    Component::LayerRef(m.layers[1]),
                ],
            },
            Op::RecordImport {
                record: ImportRecord {
                    file_name: "plan.dxf".into(),
                    format: "DXF".into(),
                    unit_scale: Tracked::assumed(1000, "$INSUNITS absent; assumed millimetres"),
                    entity_count: 1,
                },
            },
        ],
    )
    .unwrap();

    doc
}

#[test]
fn document_hash_is_stable_for_identical_content() {
    let a = build_reference_document();
    let b = build_reference_document();
    assert_eq!(a.hash(), b.hash());
}

#[test]
fn document_hash_matches_a_committed_golden_value() {
    // Guards determinism *across process runs and targets*: this literal was produced on
    // one target and is asserted on every other. If the canonical encoding in `hash.rs`
    // changes, this fails loudly rather than silently invalidating stored documents.
    let expected = include_str!("../../../fixtures/golden/m1-reference-doc.hash").trim();
    assert_eq!(
        build_reference_document().hash().to_hex(),
        expected,
        "canonical encoding changed; if deliberate, regenerate the golden file"
    );
}

#[test]
fn hash_is_sensitive_to_every_field_that_matters() {
    let base = build_reference_document().hash();

    let mut moved = Document::new();
    validate_and_apply(
        &mut moved,
        &[Op::CreateLayer {
            layer: layer("A-WALL", None),
        }],
    )
    .unwrap();
    assert_ne!(base, moved.hash());

    // One micrometre of difference must change the hash.
    let mut a = Document::new();
    validate_and_apply(
        &mut a,
        &[Op::CreateEntity {
            components: vec![wall(vec![p(0, 0), p(1000, 0)])],
        }],
    )
    .unwrap();
    let mut b = Document::new();
    validate_and_apply(
        &mut b,
        &[Op::CreateEntity {
            components: vec![wall(vec![
                Point2::new(Length::ZERO, Length::ZERO),
                Point2::new(Length::from_um(1_000_001), Length::ZERO),
            ])],
        }],
    )
    .unwrap();
    assert_ne!(a.hash(), b.hash(), "1um difference did not change the hash");
}

#[test]
fn provenance_changes_the_hash_even_when_the_value_does_not() {
    // The whole point of I4: a 2700mm height that is Measured is not the same document
    // as a 2700mm height that is Assumed, even though they render identically.
    let mk = |t: Tracked<Length>| {
        let mut d = Document::new();
        validate_and_apply(
            &mut d,
            &[Op::CreateEntity {
                components: vec![Component::WallProfile(WallProfile {
                    centreline: vec![p(0, 0), p(1000, 0)],
                    thickness: Tracked::measured(Length::from_mm(100), "explicit"),
                    height: t,
                    base_elevation: Tracked::measured(Length::ZERO, "explicit"),
                })],
            }],
        )
        .unwrap();
        d.hash()
    };
    let measured = mk(Tracked::measured(
        Length::from_mm(2700),
        "DIMENSION on section A",
    ));
    let assumed = mk(Tracked::assumed(Length::from_mm(2700), "project default"));
    assert_ne!(measured, assumed);
}

// ---------------------------------------------------------------------------
// Required test 4: replay from empty reproduces the hash
// ---------------------------------------------------------------------------

/// The full op log of the reference document, as a replayable script.
fn reference_script() -> Vec<Vec<Op>> {
    // Ids are minted deterministically, so a replay can name them up front.
    let wall_layer = tri_doc::LayerId::from_raw(1);
    let door_layer = tri_doc::LayerId::from_raw(2);
    let source = tri_doc::SourceId::from_raw(1);
    let wall_entity = tri_doc::EntityId::from_raw(1);

    vec![
        vec![
            Op::CreateLayer {
                layer: layer("A-WALL", None),
            },
            Op::CreateLayer {
                layer: layer("A-DOOR", None),
            },
        ],
        vec![Op::AddSourceEntity {
            entity: SourceEntity {
                kind: "LWPOLYLINE".into(),
                layer: "A-WALL".into(),
                handle: Some("2F1".into()),
                attributes: BTreeMap::from([
                    ("closed".to_string(), CanonicalValue::Bool(false)),
                    ("vertices".to_string(), CanonicalValue::Int(2)),
                ]),
            },
        }],
        vec![Op::CreateEntity {
            components: vec![
                wall(vec![p(0, 0), p(6000, 0)]),
                Component::LayerRef(wall_layer),
                Component::SourceRef(vec![source]),
                Component::Transform(Transform::IDENTITY),
                Component::Label("W-01".into()),
                Component::Provenance {
                    provenance: Provenance::Inferred,
                    reason: "layer name matched rule wall.by_layer".into(),
                },
            ],
        }],
        vec![
            Op::CreateEntity {
                components: vec![
                    Component::Opening(Opening {
                        host: wall_entity,
                        kind: OpeningKind::Door,
                        position: Length::from_mm(2000),
                        width: Tracked::measured(Length::from_mm(900), "INSERT block DOOR-900"),
                        height: Tracked::assumed(
                            Length::from_mm(2100),
                            "no height in block; default",
                        ),
                        sill: Tracked::measured(Length::ZERO, "door: sill at floor by definition"),
                    }),
                    Component::LayerRef(door_layer),
                ],
            },
            Op::RecordImport {
                record: ImportRecord {
                    file_name: "plan.dxf".into(),
                    format: "DXF".into(),
                    unit_scale: Tracked::assumed(1000, "$INSUNITS absent; assumed millimetres"),
                    entity_count: 1,
                },
            },
        ],
    ]
}

#[test]
fn replaying_the_commit_sequence_from_empty_reproduces_the_hash() {
    let original = build_reference_document();

    let mut replayed = Document::new();
    for batch in reference_script() {
        validate_and_apply(&mut replayed, &batch).expect("replay must validate");
    }

    assert_eq!(original.hash(), replayed.hash());
    assert_eq!(original, replayed, "replay diverged structurally");
}

#[test]
fn ids_are_a_pure_function_of_the_commit_sequence() {
    let mut a = Document::new();
    let mut b = Document::new();
    for batch in reference_script() {
        let ma = validate_and_apply(&mut a, &batch).unwrap();
        let mb = validate_and_apply(&mut b, &batch).unwrap();
        assert_eq!(
            ma, mb,
            "id allocation diverged between two identical replays"
        );
    }
}

// ---------------------------------------------------------------------------
// Required test 5: provenance survives every op
// ---------------------------------------------------------------------------

#[test]
fn provenance_survives_every_op() {
    let mut doc = build_reference_document();

    // Exercise each op variant that can touch an entity, then assert no tracked value
    // anywhere lost its record.
    let ids: Vec<_> = doc.iter_entities().map(|(id, _)| id).collect();
    let target = ids[0];

    validate_and_apply(
        &mut doc,
        &[
            Op::SetComponent {
                id: target,
                component: Component::Label("W-01-rev-B".into()),
            },
            Op::RemoveComponent {
                id: target,
                key: ComponentKey::Transform,
            },
            Op::SetComponent {
                id: target,
                component: Component::Transform(Transform {
                    translation: p(10, 10),
                    ..Transform::IDENTITY
                }),
            },
            Op::RenameLayer {
                id: tri_doc::LayerId::from_raw(1),
                name: "A-WALL-EXTG".into(),
            },
            Op::SetLayerVisible {
                id: tri_doc::LayerId::from_raw(2),
                visible: false,
            },
            Op::SetFormatVersion { version: 2 },
        ],
    )
    .unwrap();

    let mut records = 0;
    let mut assumed = 0;
    for (_, set) in doc.iter_entities() {
        for (_, comp) in set.iter() {
            for (field, prov, reason) in comp.provenance_records() {
                records += 1;
                assert!(
                    !reason.trim().is_empty(),
                    "field '{field}' lost its provenance reason"
                );
                if prov == Provenance::Assumed {
                    assumed += 1;
                }
            }
        }
    }
    assert!(
        records >= 6,
        "expected tracked values to survive, found {records}"
    );
    assert!(assumed >= 2, "assumed values were silently upgraded");
}

#[test]
fn a_provenance_record_without_a_reason_is_rejected() {
    let mut doc = Document::new();
    let err = check(
        &doc,
        &[Op::CreateEntity {
            components: vec![Component::WallProfile(WallProfile {
                centreline: vec![p(0, 0), p(1000, 0)],
                thickness: Tracked::inferred(Length::from_mm(100), "ok"),
                height: Tracked::assumed(Length::from_mm(2700), "   "),
                base_elevation: Tracked::measured(Length::ZERO, "ok"),
            })],
        }],
    )
    .expect_err("empty reason must be rejected");
    assert!(
        format!("{:?}", err).contains("EmptyProvenanceReason"),
        "got {err:?}"
    );
    let _ = &mut doc;
}

// ---------------------------------------------------------------------------
// I1 structural enforcement
// ---------------------------------------------------------------------------

#[test]
fn a_proof_cannot_be_applied_to_a_moved_on_document() {
    let mut doc = Document::new();
    let ops = [Op::CreateLayer {
        layer: layer("A", None),
    }];

    // Validate against revision 0...
    let proof = check(&doc, &ops).unwrap();
    // ...then move the document on behind the proof's back.
    validate_and_apply(
        &mut doc,
        &[Op::CreateLayer {
            layer: layer("B", None),
        }],
    )
    .unwrap();

    let err = doc.apply(proof).expect_err("stale proof must be refused");
    assert_eq!(err.validated_against, 0);
    assert_eq!(err.current, 1);
}

// ---------------------------------------------------------------------------
// Other invariants
// ---------------------------------------------------------------------------

#[test]
fn an_opening_that_does_not_fit_its_wall_is_rejected() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[Op::CreateEntity {
            components: vec![wall(vec![p(0, 0), p(3000, 0)])],
        }],
    )
    .unwrap();
    let host = m.entities[0];

    // A 900mm door centred 200mm along a 3000mm wall runs off the near end.
    let err = check(
        &doc,
        &[Op::CreateEntity {
            components: vec![Component::Opening(Opening {
                host,
                kind: OpeningKind::Door,
                position: Length::from_mm(200),
                width: Tracked::measured(Length::from_mm(900), "block DOOR-900"),
                height: Tracked::assumed(Length::from_mm(2100), "default"),
                sill: Tracked::measured(Length::ZERO, "door"),
            })],
        }],
    )
    .unwrap_err();
    assert!(
        format!("{err:?}").contains("OpeningNotContained"),
        "got {err:?}"
    );
}

#[test]
fn an_opening_hosted_by_a_non_wall_is_rejected() {
    let mut doc = Document::new();
    let m = validate_and_apply(
        &mut doc,
        &[Op::CreateEntity {
            components: vec![Component::Label("not a wall".into())],
        }],
    )
    .unwrap();
    let err = check(
        &doc,
        &[Op::CreateEntity {
            components: vec![Component::Opening(Opening {
                host: m.entities[0],
                kind: OpeningKind::Window,
                position: Length::from_mm(500),
                width: Tracked::measured(Length::from_mm(900), "x"),
                height: Tracked::measured(Length::from_mm(1200), "x"),
                sill: Tracked::measured(Length::from_mm(900), "x"),
            })],
        }],
    )
    .unwrap_err();
    assert!(
        format!("{err:?}").contains("host is not a wall"),
        "got {err:?}"
    );
}

#[test]
fn unregistered_custom_component_types_are_rejected_and_registration_fixes_it() {
    let mut doc = Document::new();
    let custom = Component::Custom {
        type_name: "FireRating".into(),
        data: BTreeMap::from([("minutes".to_string(), CanonicalValue::Int(60))]),
    };

    assert!(check(
        &doc,
        &[Op::CreateEntity {
            components: vec![custom.clone()]
        }]
    )
    .is_err());

    validate_and_apply(
        &mut doc,
        &[
            Op::RegisterType {
                def: TypeDef {
                    name: "FireRating".into(),
                    fields: BTreeMap::from([("minutes".to_string(), true)]),
                },
            },
            Op::CreateEntity {
                components: vec![custom],
            },
        ],
    )
    .expect("registering in the same batch must work");
}

#[test]
fn a_registered_type_missing_a_required_field_is_rejected() {
    let mut doc = Document::new();
    validate_and_apply(
        &mut doc,
        &[Op::RegisterType {
            def: TypeDef {
                name: "FireRating".into(),
                fields: BTreeMap::from([("minutes".to_string(), true)]),
            },
        }],
    )
    .unwrap();

    let err = check(
        &doc,
        &[Op::CreateEntity {
            components: vec![Component::Custom {
                type_name: "FireRating".into(),
                data: BTreeMap::new(),
            }],
        }],
    )
    .unwrap_err();
    assert!(
        format!("{err:?}").contains("MissingRequiredField"),
        "got {err:?}"
    );
}

#[test]
fn format_version_cannot_regress() {
    let mut doc = Document::new();
    validate_and_apply(&mut doc, &[Op::SetFormatVersion { version: 5 }]).unwrap();
    assert!(check(&doc, &[Op::SetFormatVersion { version: 4 }]).is_err());
}

#[test]
fn validation_reports_every_violation_not_just_the_first() {
    let doc = Document::new();
    let err = check(
        &doc,
        &[
            Op::DeleteEntity {
                id: tri_doc::EntityId::from_raw(1),
            },
            Op::DeleteLayer {
                id: tri_doc::LayerId::from_raw(1),
            },
            Op::CreateEntity { components: vec![] },
        ],
    )
    .unwrap_err();
    assert_eq!(err.len(), 3, "expected all three reported, got {err:?}");
}

#[test]
fn a_degenerate_closed_polyline_is_rejected() {
    let doc = Document::new();
    assert!(check(
        &doc,
        &[Op::CreateEntity {
            components: vec![Component::Polyline2d(Polyline2d {
                points: vec![p(0, 0), p(1000, 0)],
                closed: true,
            })],
        }],
    )
    .is_err());
}

#[test]
fn errors_are_readable_by_a_human_and_an_agent() {
    let doc = Document::new();
    let e = validate_and_apply(
        &mut doc.clone(),
        &[Op::DeleteEntity {
            id: tri_doc::EntityId::from_raw(42),
        }],
    )
    .unwrap_err();
    let text = e.to_string();
    assert!(text.contains("op[0]"), "no op index in {text:?}");
    assert!(text.contains("e42"), "no entity id in {text:?}");
    assert!(matches!(e, ApplyError::Rejected(_)));
}

// ---------------------------------------------------------------------------
// I4 reaches runtime-registered components
// ---------------------------------------------------------------------------

fn register(name: &str, required: &[&str]) -> Op {
    Op::RegisterType {
        def: TypeDef {
            name: name.to_string(),
            fields: required.iter().map(|f| (f.to_string(), true)).collect(),
        },
    }
}

#[test]
fn a_custom_component_can_carry_provenance() {
    // The hole this closes: `Component::Custom` is the sanctioned way to extend the
    // document without touching `doc`, but it used to report no provenance at all. Every
    // runtime-registered component was invisible to I4 — a defaulted dimension could be
    // stored with no record that it was defaulted, which is the exact failure the
    // invariant exists to prevent.
    let mut doc = Document::new();
    validate_and_apply(
        &mut doc,
        &[
            register("ParameterSet", &["external_wall"]),
            Op::CreateEntity {
                components: vec![Component::Custom {
                    type_name: "ParameterSet".into(),
                    data: BTreeMap::from([
                        (
                            "external_wall".to_string(),
                            CanonicalValue::assumed(
                                CanonicalValue::Length(Length::from_mm(230)),
                                "default, not specified by the architect",
                            ),
                        ),
                        (
                            "plot_width".to_string(),
                            CanonicalValue::measured(
                                CanonicalValue::Length(Length::from_mm(9144)),
                                "entered as 30ft",
                            ),
                        ),
                    ]),
                }],
            },
        ],
    )
    .expect("a registered custom component is valid");

    let (_, set) = doc.iter_entities().next().unwrap();
    let records = set
        .get(&ComponentKey::Custom("ParameterSet".into()))
        .unwrap()
        .provenance_records();

    assert_eq!(
        records.len(),
        2,
        "custom provenance not reported: {records:?}"
    );
    let by_field: BTreeMap<_, _> = records
        .iter()
        .map(|(f, p, r)| (f.as_str(), (*p, r.as_str())))
        .collect();
    assert_eq!(by_field["external_wall"].0, Provenance::Assumed);
    assert!(by_field["external_wall"].1.contains("default"));
    assert_eq!(by_field["plot_width"].0, Provenance::Measured);
}

#[test]
fn nested_custom_values_report_a_dotted_path() {
    // A parameter group must not report a bare `front` that collides with three other
    // fields called `front`.
    let v = CanonicalValue::Map(BTreeMap::from([(
        "setbacks".to_string(),
        CanonicalValue::Map(BTreeMap::from([
            (
                "front".to_string(),
                CanonicalValue::inferred(
                    CanonicalValue::Length(Length::from_mm(1500)),
                    "BBMP table, plot area band 150-300 sqm",
                ),
            ),
            (
                "rear".to_string(),
                CanonicalValue::inferred(
                    CanonicalValue::Length(Length::from_mm(1200)),
                    "same band",
                ),
            ),
        ])),
    )]));

    let mut out = Vec::new();
    v.collect_provenance("", &mut out);
    let paths: Vec<_> = out.iter().map(|(p, _, _)| p.as_str()).collect();
    assert_eq!(paths, vec!["setbacks.front", "setbacks.rear"]);
}

#[test]
fn a_custom_component_with_an_empty_reason_is_rejected() {
    // The same I4 gate the built-in components get.
    let mut doc = Document::new();
    validate_and_apply(&mut doc, &[register("ParameterSet", &[])]).unwrap();

    let ops = [Op::CreateEntity {
        components: vec![Component::Custom {
            type_name: "ParameterSet".into(),
            data: BTreeMap::from([(
                "floor_to_floor".to_string(),
                CanonicalValue::assumed(CanonicalValue::Length(Length::from_mm(3000)), "   "),
            )]),
        }],
    }];
    let err = check(&doc, &ops).expect_err("an empty reason must be rejected");
    assert!(
        format!("{err:?}").contains("EmptyProvenanceReason"),
        "got {err:?}"
    );
}

#[test]
fn provenance_is_part_of_the_document_hash_for_custom_components() {
    // Two documents whose only difference is "this 230mm was measured" versus "this
    // 230mm was assumed" are different documents. A reviewer who signed one has not
    // signed the other.
    let build = |p: Provenance| {
        let mut d = Document::new();
        validate_and_apply(
            &mut d,
            &[
                register("ParameterSet", &[]),
                Op::CreateEntity {
                    components: vec![Component::Custom {
                        type_name: "ParameterSet".into(),
                        data: BTreeMap::from([(
                            "external_wall".to_string(),
                            CanonicalValue::tracked(
                                CanonicalValue::Length(Length::from_mm(230)),
                                p,
                                "same reason text",
                            ),
                        )]),
                    }],
                },
            ],
        )
        .unwrap();
        d.hash()
    };
    assert_ne!(build(Provenance::Measured), build(Provenance::Assumed));
}
