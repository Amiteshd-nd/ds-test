//! F2's tests: the intake form, and provenance that says what the architect typed.

use tri_doc::Provenance;
use tri_params::{form_fields, form_schema, Brief, Orientation, Tier, Units};

fn thirty_by_forty() -> Brief {
    Brief::new(Units::Feet, 30.0, 40.0, Orientation::North, 3, 2, 1)
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

#[test]
fn feet_convert_exactly() {
    // 1 ft is 304.8 mm by definition, so 30 ft is 9144 mm with nothing left over.
    let p = thirty_by_forty().into_parameters().unwrap();
    assert_eq!(p.plot_width.get().as_um(), 9_144_000);
    assert_eq!(p.plot_depth.get().as_um(), 12_192_000);
}

#[test]
fn the_reason_records_the_figure_as_typed_not_as_stored() {
    // The point of keeping units at all. "9144 mm" and "entered as 30 ft" store the same
    // number, but only the second tells a reviewer it was a round figure in the unit it
    // was thought in — which is how a unit mistake is spotted later.
    let p = thirty_by_forty().into_parameters().unwrap();
    assert!(
        p.plot_width.reason().contains("30 ft"),
        "{}",
        p.plot_width.reason()
    );
    assert!(
        p.plot_width.reason().contains("9144 mm"),
        "{}",
        p.plot_width.reason()
    );
    assert_eq!(p.plot_width.provenance(), Provenance::Measured);
}

#[test]
fn millimetre_entry_does_not_claim_a_conversion() {
    let p = Brief::new(
        Units::Millimetres,
        9144.0,
        12192.0,
        Orientation::North,
        3,
        2,
        1,
    )
    .into_parameters()
    .unwrap();
    assert_eq!(p.plot_width.reason(), "entered as 9144 mm");
    assert_eq!(p.entry_units.get(), Units::Millimetres);
}

#[test]
fn the_entry_unit_is_remembered() {
    let p = thirty_by_forty().into_parameters().unwrap();
    assert_eq!(p.entry_units.get(), Units::Feet);
    assert_eq!(p.entry_units.provenance(), Provenance::Measured);
}

#[test]
fn unit_names_parse_the_way_people_write_them() {
    for (text, want) in [
        ("ft", Units::Feet),
        ("FEET", Units::Feet),
        (" mm ", Units::Millimetres),
        ("meters", Units::Metres),
    ] {
        assert_eq!(Units::parse(text), Some(want), "{text}");
    }
    assert_eq!(Units::parse("cubits"), None);
}

// ---------------------------------------------------------------------------
// Tier 1
// ---------------------------------------------------------------------------

#[test]
fn an_unanswered_north_angle_is_assumed_and_an_answered_one_is_measured() {
    let skipped = thirty_by_forty().into_parameters().unwrap();
    assert_eq!(skipped.north_angle_mdeg.provenance(), Provenance::Assumed);
    assert!(skipped.north_angle_mdeg.reason().contains("assumed"));

    let mut b = thirty_by_forty();
    b.north_angle_deg = Some(12.5);
    let given = b.into_parameters().unwrap();
    assert_eq!(given.north_angle_mdeg.get(), 12_500);
    assert_eq!(given.north_angle_mdeg.provenance(), Provenance::Measured);
    assert!(given.north_angle_mdeg.reason().contains("12.5"));
}

#[test]
fn the_form_asks_six_questions_plus_a_chip_row() {
    // "Six questions on screen, not thirty."
    let fields = form_fields();
    let asked: Vec<_> = fields
        .iter()
        .filter(|(_, t)| *t == Tier::Ask)
        .map(|(n, _)| n.as_str())
        .collect();
    // units, width, depth, road_facing, north_angle, bedrooms, floors, car_parking,
    // plus five chips. North angle is optional and the unit toggle is sticky, so the
    // visible question count is the six the PRD names.
    for required in [
        "plot_width",
        "plot_depth",
        "road_facing",
        "bedrooms",
        "floors",
        "car_parking",
    ] {
        assert!(asked.contains(&required), "{required} is not asked");
    }
    assert!(
        !fields
            .iter()
            .any(|(n, _)| n == "external_wall" || n == "setback_front"),
        "tier 2 and tier 3 must not appear on the intake form"
    );
}

#[test]
fn the_form_is_a_generated_schema_carrying_its_own_tiers() {
    // The UI renders this rather than a hand-written form, so the two cannot drift.
    let schema = form_schema();
    let props = schema["properties"].as_object().expect("an object schema");
    assert!(props.contains_key("plot_width"));
    assert_eq!(props["plot_width"]["x-tier"], "ask");
    assert_eq!(props["vaastu"]["x-tier"], "chip");
    assert_eq!(props["units"]["x-sticky"], true);
    assert_eq!(props["bedrooms"]["x-max"], 4);
    assert_eq!(props["north_angle_deg"]["x-optional"], true);
}

// ---------------------------------------------------------------------------
// Ambiguity chips
// ---------------------------------------------------------------------------

#[test]
fn a_skipped_chip_and_a_declined_chip_are_different_records() {
    // The distinction the whole chip row exists for: an architect who tapped "no puja
    // room" has told us something; one who skipped has not.
    let skipped = thirty_by_forty().into_parameters().unwrap();
    assert_eq!(skipped.include_puja.provenance(), Provenance::Assumed);
    assert!(skipped.include_puja.reason().contains("not asked"));
    assert!(skipped.include_puja.get());

    let mut b = thirty_by_forty();
    b.puja = Some(false);
    let declined = b.into_parameters().unwrap();
    assert_eq!(declined.include_puja.provenance(), Provenance::Measured);
    assert!(!declined.include_puja.get());
    assert!(declined.include_puja.reason().contains("said no puja"));
}

#[test]
fn every_chip_records_an_answer_either_way() {
    let mut b = thirty_by_forty();
    b.all_bedrooms_attached = Some(true);
    b.puja = Some(true);
    b.balcony = Some(false);
    b.closed_kitchen = Some(false);
    b.vaastu = Some(true);
    let p = b.into_parameters().unwrap();

    for (field, prov) in [
        (
            "all_bedrooms_attached",
            p.all_bedrooms_attached.provenance(),
        ),
        ("include_puja", p.include_puja.provenance()),
        ("include_balcony", p.include_balcony.provenance()),
        ("closed_kitchen", p.closed_kitchen.provenance()),
        ("vaastu", p.vaastu.provenance()),
    ] {
        assert_eq!(
            prov,
            Provenance::Measured,
            "{field} lost the architect's answer"
        );
    }
    assert!(p.vaastu.get());
    assert!(!p.include_balcony.get());
}

#[test]
fn chip_answers_survive_storage() {
    use tri_params::component;
    let mut b = thirty_by_forty();
    b.vaastu = Some(true);
    let p = b.into_parameters().unwrap();
    let back = component::from_component(&component::to_component(&p)).unwrap();
    assert_eq!(back, p);
    assert!(back.vaastu.get());
    assert_eq!(back.vaastu.provenance(), Provenance::Measured);
    assert_eq!(back.entry_units.get(), Units::Feet);
}

#[test]
fn a_brief_round_trips_through_json() {
    // The LLM intake in F6 will hand us exactly this shape.
    let b = thirty_by_forty();
    let text = serde_json::to_string(&b).unwrap();
    let back: Brief = serde_json::from_str(&text).unwrap();
    assert_eq!(b, back);

    // And the minimum a caller has to supply is the six questions.
    let minimal: Brief = serde_json::from_str(
        r#"{"plot_width":30,"plot_depth":40,"road_facing":"north",
            "bedrooms":3,"floors":2,"car_parking":1}"#,
    )
    .expect("chips and north angle default");
    assert_eq!(minimal.units, Units::Feet);
    assert_eq!(minimal.vaastu, None);
}

#[test]
fn an_out_of_scope_brief_is_refused_at_the_form() {
    let b = Brief::new(Units::Feet, 300.0, 400.0, Orientation::North, 3, 2, 1);
    assert!(
        b.into_parameters().is_err(),
        "a 300ft plot is out of MVP scope"
    );
}
