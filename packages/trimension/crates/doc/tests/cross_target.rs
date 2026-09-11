//! The cross-target half of M1's determinism requirement.
//!
//! The same assertions run on host native and on `wasm32-unknown-unknown`. If the two
//! targets ever disagree on a document hash, the whole commit model breaks: the server
//! could not validate what the client sent, and PRD §4.2's "same crates compile for
//! client and server" would be a claim rather than a guarantee.
//!
//! Run the wasm side with:
//!   cargo xtask test-wasm

#![cfg(test)]

use tri_doc::component::{Opening, OpeningKind, WallProfile};
use tri_doc::layer::Layer;
use tri_doc::{check, validate_and_apply, Component, Document, Length, Op, Point2, Tracked};

#[cfg(not(target_arch = "wasm32"))]
use std::prelude::v1::test as test_case;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen_test::wasm_bindgen_test as test_case;

/// The golden hash, produced on host native and asserted on every target.
const GOLDEN: &str = include_str!("../../../fixtures/golden/m1-cross-target.hash");

fn p(x: i64, y: i64) -> Point2 {
    Point2::new(Length::from_mm(x), Length::from_mm(y))
}

/// Deliberately exercises every value type that could plausibly differ between targets:
/// large integers near the i64 range, negative coordinates, integer square roots via the
/// opening-containment check, unicode text, and deep provenance nesting.
fn build() -> Document {
    let mut doc = Document::new();
    let l = validate_and_apply(
        &mut doc,
        &[Op::CreateLayer {
            layer: Layer {
                // Non-Latin text: a real risk area, and the one MSDF atlases break on.
                name: "பகுதி-சுவர்".into(),
                parent: None,
                visible: true,
                color: [12, 200, 7, 255],
            },
        }],
    )
    .unwrap();

    let w = validate_and_apply(
        &mut doc,
        &[Op::CreateEntity {
            components: vec![
                Component::WallProfile(WallProfile {
                    centreline: vec![p(-123_456, -7_890), p(1_234_567, 987_654)],
                    thickness: Tracked::inferred(
                        Length::from_um(230_017),
                        "paired polylines, gap 230.017mm",
                    ),
                    height: Tracked::assumed(Length::from_mm(2700), "no DIMENSION; default"),
                    base_elevation: Tracked::measured(
                        Length::from_um(-1_500_999),
                        "level datum -1500.999mm",
                    ),
                }),
                Component::LayerRef(l.layers[0]),
            ],
        }],
    )
    .unwrap();

    // Containment runs the integer sqrt path — the one place a float would have crept in.
    validate_and_apply(
        &mut doc,
        &[Op::CreateEntity {
            components: vec![Component::Opening(Opening {
                host: w.entities[0],
                kind: OpeningKind::Window,
                position: Length::from_mm(900_000),
                width: Tracked::measured(Length::from_mm(1200), "block WIN-1200"),
                height: Tracked::measured(Length::from_mm(1500), "block WIN-1200"),
                sill: Tracked::assumed(Length::from_mm(900), "typical sill height"),
            })],
        }],
    )
    .unwrap();

    doc
}

#[test_case]
fn document_hash_is_identical_on_this_target() {
    assert_eq!(build().hash().to_hex(), GOLDEN.trim());
}

#[test_case]
fn integer_sqrt_agrees_across_targets() {
    // Values chosen around powers of two and the i64/i128 boundary, where a float-based
    // sqrt would round differently on different targets.
    let cases: [i128; 9] = [
        0,
        1,
        2,
        999_999_999,
        1_000_000_000_000,
        (1i128 << 62) - 1,
        1i128 << 62,
        (1i128 << 100) + 7,
        i64::MAX as i128 * i64::MAX as i128 / 3,
    ];
    let got: Vec<i128> = cases
        .iter()
        .map(|n| tri_doc::validate::isqrt_i128(*n))
        .collect();
    for (n, r) in cases.iter().zip(&got) {
        assert!(r * r <= *n, "isqrt({n}) = {r} too large");
        assert!((r + 1) * (r + 1) > *n, "isqrt({n}) = {r} too small");
    }
}

#[test_case]
fn validation_agrees_across_targets() {
    let doc = build();
    // Same rejection, same violation, on both targets.
    let err = check(
        &doc,
        &[Op::ReparentLayer {
            id: tri_doc::LayerId::from_raw(1),
            new_parent: Some(tri_doc::LayerId::from_raw(1)),
        }],
    )
    .unwrap_err();
    assert_eq!(err.len(), 1);
    assert!(format!("{err:?}").contains("LayerCycle"));
}

#[test_case]
fn serde_round_trip_is_lossless_on_this_target() {
    let doc = build();
    let json = serde_json::to_string(&doc).unwrap();
    let back: Document = serde_json::from_str(&json).unwrap();
    assert_eq!(doc.hash(), back.hash());
    assert_eq!(doc, back);
}
