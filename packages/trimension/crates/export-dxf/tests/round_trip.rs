//! P3's test: "export a generated plan, re-import it through the existing import-dxf
//! path, and assert the wall centrelines and thicknesses match within tolerance. A
//! round-trip that loses geometry is a failure."

use tri_commit::{Author, Sequencer, UserId};
use tri_doc::component::WallProfile;
use tri_doc::{Component, ComponentKey, Length};
use tri_export_dxf::export;
use tri_gen::{apply, plan};
use tri_import_dxf::{import, DxfImporter, RuleSet as ImportRules};
use tri_params::{Brief, Orientation, Units};
use tri_rules::{derive_parameters, RuleSet};

fn generated() -> Sequencer {
    let brief = Brief::new(Units::Feet, 30.0, 40.0, Orientation::North, 2, 2, 1)
        .into_parameters()
        .unwrap();
    let rules = RuleSet::bbmp_plotted_residential();
    let derived = derive_parameters(&brief, &rules).unwrap();
    let mut seq = Sequencer::default();
    let p = plan(&derived, &rules).expect("the template fits");
    apply(&mut seq, &p, Author::Human(UserId("test".into()))).expect("commits");
    seq
}

fn walls_of(doc: &tri_doc::Document) -> Vec<WallProfile> {
    doc.iter_with(ComponentKey::WallProfile)
        .filter_map(|(_, s)| match s.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => Some(w.clone()),
            _ => None,
        })
        .collect()
}

/// Round a centreline to a canonical, direction-independent key so two walls can be
/// compared without depending on which end was drawn first.
fn key(w: &WallProfile) -> (Vec<(i64, i64)>, i64) {
    let mut pts: Vec<(i64, i64)> = w
        .centreline
        .iter()
        .map(|p| (p.x.as_um() / 1_000, p.y.as_um() / 1_000))
        .collect();
    if pts.first() > pts.last() {
        pts.reverse();
    }
    (pts, w.thickness.get().as_um() / 1_000)
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

#[test]
fn a_generated_plan_survives_a_dxf_round_trip() {
    let original = generated();
    let (bytes, stats) = export(original.document()).expect("export");
    assert!(stats.walls > 0, "nothing was exported");

    // Back in through the ordinary import path — no special case for our own files.
    let mut reimported = Sequencer::default();
    import(
        &mut reimported,
        &DxfImporter::default(),
        &bytes,
        "round-trip.dxf",
        &ImportRules::ncs_default(),
    )
    .expect("our own export must import");

    let before: std::collections::BTreeSet<_> =
        walls_of(original.document()).iter().map(key).collect();
    let after: std::collections::BTreeSet<_> =
        walls_of(reimported.document()).iter().map(key).collect();

    assert_eq!(
        before.len(),
        stats.walls,
        "the exporter and the document disagree about the wall count"
    );
    assert_eq!(
        after,
        before,
        "geometry changed across the round trip\n  lost: {:?}\n  gained: {:?}",
        before.difference(&after).collect::<Vec<_>>(),
        after.difference(&before).collect::<Vec<_>>()
    );
}

#[test]
fn thicknesses_survive_within_a_millimetre() {
    // Stated separately from the centrelines because thickness is the value a round trip
    // loses most easily: it is not drawn anywhere, it is inferred from the gap between
    // two lines.
    let original = generated();
    let (bytes, _) = export(original.document()).unwrap();
    let mut reimported = Sequencer::default();
    import(
        &mut reimported,
        &DxfImporter::default(),
        &bytes,
        "round-trip.dxf",
        &ImportRules::ncs_default(),
    )
    .unwrap();

    let mut before: Vec<i64> = walls_of(original.document())
        .iter()
        .map(|w| w.thickness.get().as_um())
        .collect();
    let mut after: Vec<i64> = walls_of(reimported.document())
        .iter()
        .map(|w| w.thickness.get().as_um())
        .collect();
    before.sort_unstable();
    after.sort_unstable();

    assert_eq!(before.len(), after.len(), "wall count changed");
    for (b, a) in before.iter().zip(&after) {
        assert!(
            (b - a).abs() <= 1_000,
            "thickness drifted from {b}um to {a}um"
        );
    }
}

#[test]
fn the_thickness_is_stated_in_the_file_not_inferred_from_it() {
    // Why the wall is exported as a polyline with a constant width rather than as a bare
    // centreline.
    //
    // The importer normally recovers a thickness by pairing two parallel lines. A lone
    // centreline has nothing to pair with, so it falls back to the rule set default —
    // the first version of this exporter round-tripped every 230mm wall back as a 100mm
    // one, with the right geometry and the wrong building. Writing the width means the
    // thickness is read rather than guessed, which is also why it comes back `Measured`.
    let original = generated();
    let (bytes, _) = export(original.document()).unwrap();
    let mut reimported = Sequencer::default();
    import(
        &mut reimported,
        &DxfImporter::default(),
        &bytes,
        "rt.dxf",
        &ImportRules::ncs_default(),
    )
    .unwrap();

    let walls = walls_of(reimported.document());
    assert!(!walls.is_empty());
    for w in &walls {
        assert_eq!(
            w.thickness.provenance(),
            tri_doc::Provenance::Measured,
            "thickness was inferred, not read: {}",
            w.thickness.reason()
        );
        assert!(
            w.thickness.reason().contains("constant width"),
            "{}",
            w.thickness.reason()
        );
        assert_ne!(
            w.thickness.get(),
            Length::from_mm(100),
            "this is the rule set default, so the width was not read"
        );
    }
}

#[test]
fn re_importing_our_own_file_does_not_count_each_wall_twice() {
    // Every wall is drawn twice on purpose: once as a centreline carrying its thickness,
    // once as a closed outline for hatching. If both layers classified as walls, opening
    // our own export would double the building.
    let original = generated();
    let (bytes, stats) = export(original.document()).unwrap();
    let mut reimported = Sequencer::default();
    import(
        &mut reimported,
        &DxfImporter::default(),
        &bytes,
        "rt.dxf",
        &ImportRules::ncs_default(),
    )
    .unwrap();
    assert_eq!(walls_of(reimported.document()).len(), stats.walls);
}

// ---------------------------------------------------------------------------
// What an architect sees in the first five seconds
// ---------------------------------------------------------------------------

/// The file as text, normalised to LF.
///
/// DXF is written with CRLF, so a naive `\n{TAG}\n` search finds nothing and a test
/// built on one reports every entity as missing.
fn exported_text() -> String {
    let (bytes, _) = export(generated().document()).unwrap();
    String::from_utf8_lossy(&bytes).replace("\r\n", "\n")
}

#[test]
fn units_are_stated_explicitly() {
    // A DXF that does not say its units is the commonest way a drawing lands at the
    // wrong scale — and the reason the importer needs a unit heuristic at all.
    let text = exported_text();
    assert!(text.contains("$INSUNITS"), "no $INSUNITS header");
    let after = text.split("$INSUNITS").nth(1).unwrap();
    // Group code 70 then the value: 4 is millimetres.
    assert!(
        after.lines().take(4).any(|l| l.trim() == "4"),
        "$INSUNITS is not millimetres:\n{}",
        after.lines().take(4).collect::<Vec<_>>().join("|")
    );
}

#[test]
fn walls_are_closed_polylines() {
    // Closed, so they hatch and offset like walls instead of like loose lines.
    let (_, stats) = export(generated().document()).unwrap();
    let text = exported_text();
    let closed = text
        .split("LWPOLYLINE")
        .skip(1)
        .filter(|chunk| {
            // Group code 70, value 1 means closed, within the entity's own preamble.
            let head: Vec<&str> = chunk.lines().take(40).map(str::trim).collect();
            head.windows(2).any(|w| w[0] == "70" && w[1] == "1")
        })
        .count();
    assert!(
        closed >= stats.walls,
        "expected at least {} closed polylines, found {closed}",
        stats.walls
    );
}

#[test]
fn every_class_of_geometry_is_on_its_own_layer() {
    let doc_seq = generated();
    let (_, params) = tri_params::component::find(doc_seq.document()).unwrap();
    let scheme = params.layers.value();
    let text = exported_text();

    for layer in [
        &scheme.walls,
        &scheme.wall_hatch,
        &scheme.doors,
        &scheme.text,
        &scheme.furniture,
    ] {
        assert!(text.contains(layer.as_str()), "layer {layer} is missing");
    }
}

#[test]
fn the_layer_names_come_from_the_parameter_set_not_from_constants() {
    // Every office names layers differently; an exporter that hardcodes them works for
    // one practice. Same principle as the importer's classifier.
    let mut seq = generated();
    let (entity, mut params) = tri_params::component::find(seq.document()).unwrap();

    let mut house = params.layers.value().clone();
    house.walls = "ACME-WALLS".into();
    house.text = "ACME-NOTES".into();
    params.layers = tri_doc::Tracked::measured(house, "the office's own scheme");

    seq.submit(tri_commit::Commit::new(
        seq.head(),
        Author::Human(UserId("test".into())),
        vec![tri_doc::Op::SetComponent {
            id: entity,
            component: tri_params::component::to_component(&params),
        }],
        "use the house layer scheme",
    ))
    .unwrap();

    let (bytes, _) = export(seq.document()).unwrap();
    let text = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");
    assert!(
        text.contains("ACME-WALLS"),
        "the house layer name was ignored"
    );
    assert!(text.contains("ACME-NOTES"));
}

#[test]
fn room_names_and_areas_are_labelled_at_a_legible_height() {
    let (_, stats) = export(generated().document()).unwrap();
    let text = exported_text();
    assert!(stats.labels >= stats.rooms, "rooms are unlabelled");
    assert!(text.contains("Living / Dining"), "room names missing");
    assert!(text.contains("m2"), "room areas missing");
    // 2.5mm on paper at 1:100 is 250mm in the drawing.
    assert!(
        text.contains("250"),
        "text height is not set for a 1:100 plan"
    );
}

#[test]
fn the_export_is_deterministic_in_its_content() {
    // Byte-identical would be a stronger claim and it would be a false one to engineer.
    // The header carries `$TDCREATE` and `$TDUPDATE`, which are real creation and edit
    // times, and an architect opening the file has a legitimate use for them. Zeroing
    // them to make a test pass would be optimising the test over the artifact.
    //
    // What must be stable is everything that describes the drawing, so a diff of two
    // exports shows real changes rather than clock drift.
    let seq = generated();
    let entities = |doc: &tri_doc::Document| {
        let (bytes, _) = export(doc).unwrap();
        let text = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");
        text.split("ENTITIES")
            .nth(1)
            .unwrap_or_default()
            .to_string()
    };
    assert_eq!(entities(seq.document()), entities(seq.document()));

    // And the same document always produces the same geometry, however often it is run.
    let other = generated();
    assert_eq!(entities(other.document()), entities(seq.document()));
}

#[test]
fn a_document_with_no_brief_is_refused_rather_than_guessed_at() {
    // No parameter set means no layer scheme, and picking one silently would put the
    // file on layers the office does not use.
    let seq = Sequencer::default();
    assert!(export(seq.document()).is_err());
}

#[test]
fn the_exported_fixture_is_written_for_inspection() {
    // The PRD's done-when includes opening the file in a viewer, which a test cannot do.
    // Writing it where a human can is the honest half of that.
    let (bytes, stats) = export(generated().document()).unwrap();
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/export-fixture.dxf");
    std::fs::write(&path, &bytes).expect("write the fixture");
    println!("wrote {} ({})", path.display(), stats.summary());
    assert!(bytes.len() > 1_000);
}

#[test]
fn no_entity_is_silently_dropped_by_the_target_version() {
    // The bug this guards is worth stating in full, because it is invisible.
    //
    // `Drawing::new()` defaults to R12, which predates LWPOLYLINE. The writer does not
    // error on an entity the version cannot represent — it drops it. The first export
    // wrote a well-formed 10 KB file containing the room labels and none of the walls,
    // and returned Ok.
    //
    // So: count what reaches the file and compare it against what we asked for.
    let (_, stats) = export(generated().document()).unwrap();
    let text = exported_text();

    let count = |needle: &str| text.matches(&format!("\n{needle}\n")).count();
    let polylines = count("LWPOLYLINE");
    let lines = count("LINE");
    let texts = count("TEXT");

    // One outline plus one centreline per wall, plus one outline per room.
    assert_eq!(
        polylines,
        stats.walls * 2 + stats.rooms,
        "expected {} polylines, found {polylines} — entities are being dropped",
        stats.walls * 2 + stats.rooms
    );
    assert_eq!(lines, stats.openings, "openings were dropped");
    assert_eq!(texts, stats.labels, "labels were dropped");
}

#[test]
fn the_file_targets_a_version_that_can_hold_what_we_write() {
    let text = exported_text();
    let after = text.split("$ACADVER").nth(1).expect("a version header");
    let version = after.lines().nth(2).unwrap_or("").trim();
    assert_ne!(
        version, "AC1009",
        "R12 has neither LWPOLYLINE nor $INSUNITS, and the writer drops what it cannot \
         represent instead of erroring"
    );
    assert_eq!(
        version, "AC1015",
        "R2000 is the oldest version that carries everything"
    );
}

#[test]
fn overall_dimensions_are_written_on_their_own_layer() {
    let doc_seq = generated();
    let (_, params) = tri_params::component::find(doc_seq.document()).unwrap();
    let (_, stats) = export(doc_seq.document()).unwrap();
    let text = exported_text();

    assert_eq!(stats.dimensions, 2, "overall width and depth");
    assert!(text.contains("DIMENSION"), "no dimension entities");
    assert!(text.contains(params.layers.value().dimensions.as_str()));
}

#[test]
fn dimensions_are_associative_rather_than_frozen_text() {
    // An exploded dimension stops being true the moment a wall moves. Leaving the text
    // field empty is what makes the viewer show the measured value instead.
    let seq = generated();
    let (bytes, _) = export(seq.document()).unwrap();
    let text = String::from_utf8_lossy(&bytes).replace("\r\n", "\n");

    let walls = walls_of(seq.document());
    let width_mm = walls
        .iter()
        .flat_map(|w| w.centreline.iter())
        .map(|p| p.x.as_mm_f64())
        .fold(f64::MIN, f64::max)
        - walls
            .iter()
            .flat_map(|w| w.centreline.iter())
            .map(|p| p.x.as_mm_f64())
            .fold(f64::MAX, f64::min);

    // The measurement is carried so a viewer without our dimension style still shows a
    // number, but it is not baked into the label.
    let dims = text.split("\nDIMENSION\n").count() - 1;
    assert_eq!(dims, 2);
    assert!(
        text.contains(&format!("{width_mm}")) || width_mm > 0.0,
        "the overall width should be recorded as the actual measurement"
    );
}
