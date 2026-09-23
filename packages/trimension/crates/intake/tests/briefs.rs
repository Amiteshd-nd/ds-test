//! F6's done-when: thirty test briefs parse correctly.
//!
//! # What this can and cannot prove
//! The PRD asks for thirty briefs "across at least two providers". Half of that is
//! verifiable here and half is not, and it is worth being exact about which.
//!
//! Verifiable offline: that the schema, the coercions, the range checks and the
//! stated-versus-guessed accounting are right, by running every brief through the local
//! parser and through the model-response path with a recorded reply. That is the part
//! that is ours to get wrong.
//!
//! Not verifiable here: whether Claude or GPT fills the form correctly. That needs keys
//! and real calls, which is `cargo xtask eval-intake --provider ...`, run deliberately by
//! somebody who has one. The allowlist exists precisely because that number has to be
//! measured per model rather than assumed.

use serde_json::Value;
use std::collections::BTreeMap;
use tri_intake::{local, parse};

fn fixtures() -> Value {
    let raw = include_str!("../../../fixtures/intake/briefs.json");
    serde_json::from_str(raw).expect("the brief fixtures are valid JSON")
}

/// Compare a parsed brief against the fields a fixture says it must contain.
fn check(text: &str, expect: &Value, got: &tri_intake::Intake) -> Vec<String> {
    let brief = serde_json::to_value(&got.brief).expect("a brief serialises");
    let mut wrong = Vec::new();
    for (key, want) in expect.as_object().unwrap() {
        let have = brief.get(key).unwrap_or(&Value::Null);
        let same = match (want.as_f64(), have.as_f64()) {
            // Feet-to-metre road widths do not land on a round number.
            (Some(a), Some(b)) => (a - b).abs() < 0.01,
            _ => want == have,
        };
        if !same {
            wrong.push(format!("{text:?}: {key} is {have}, expected {want}"));
        }
    }
    wrong
}

#[test]
fn thirty_briefs_parse_with_no_model_at_all() {
    let f = fixtures();
    let briefs = f["briefs"].as_array().unwrap();
    assert_eq!(briefs.len(), 30, "the done-when says thirty");

    let mut wrong = Vec::new();
    for b in briefs {
        let text = b["text"].as_str().unwrap();
        match (&b.get("expect"), local::parse(text)) {
            (Some(expect), Ok(got)) => wrong.extend(check(text, expect, &got)),
            (Some(_), Err(e)) => wrong.push(format!("{text:?}: refused — {e}")),
            (None, Ok(_)) => wrong.push(format!("{text:?}: answered a brief it cannot know")),
            (None, Err(_)) => {}
        }
    }
    assert!(wrong.is_empty(), "\n{}", wrong.join("\n"));
}

#[test]
fn an_underspecified_brief_asks_rather_than_guesses() {
    // The three fixtures with `fails` instead of `expect`. A generator that answered
    // "I want a nice house" with a 30x40 2BHK would be inventing the site.
    let f = fixtures();
    for b in f["briefs"].as_array().unwrap() {
        let Some(fails) = b.get("fails").and_then(|v| v.as_array()) else {
            continue;
        };
        let text = b["text"].as_str().unwrap();
        let err = local::parse(text).expect_err(&format!("{text:?} should be refused"));
        let parse::IntakeError::Missing(missing) = &err else {
            panic!("{text:?}: expected Missing, got {err}");
        };
        let named: Vec<&str> = missing.iter().map(|f| f.as_str()).collect();
        for want in fails {
            let want = want.as_str().unwrap();
            assert!(
                named.contains(&want),
                "{text:?}: the refusal does not mention {want}: {named:?}"
            );
        }
        // And it is a question, not a code.
        assert!(err.to_string().contains('?'), "{text:?}: {err}");
    }
}

#[test]
fn nothing_the_brief_did_not_say_is_reported_as_stated() {
    // The invariant the whole crate turns on. `ParameterSet::from_brief` marks tier-1
    // values `Measured` — "the architect typed this" — so a field the brief never
    // mentioned arriving in `stated` would turn a guess into a measurement at the very
    // first step, before any geometry exists to check it against.
    let f = fixtures();
    for b in f["briefs"].as_array().unwrap() {
        let Some(expect) = b.get("expect") else {
            continue;
        };
        let text = b["text"].as_str().unwrap();
        let got = local::parse(text).unwrap();
        let said: Vec<&str> = expect
            .as_object()
            .unwrap()
            .keys()
            .map(|s| s.as_str())
            .collect();
        for field in &got.stated {
            assert!(
                said.contains(&field.as_str()),
                "{text:?}: claims {} was stated, but the brief does not say it",
                field.as_str()
            );
        }
    }
}

#[test]
fn a_guessed_field_is_offered_for_confirmation() {
    // "3BHK on a 30x40 site" says nothing about floors or parking. Those come back
    // filled, because the form has to show something, and listed in `guessed()`, because
    // the architect has to be the one who agrees to them.
    let got = local::parse("3BHK on a 30x40 site, north facing").unwrap();
    let guessed: Vec<&str> = got.guessed().iter().map(|f| f.as_str()).collect();
    assert!(guessed.contains(&"floors"), "{guessed:?}");
    assert!(guessed.contains(&"car_parking"), "{guessed:?}");
    assert!(guessed.contains(&"units"), "{guessed:?}");
    assert!(!guessed.contains(&"bedrooms"), "{guessed:?}");
    assert!(!guessed.contains(&"plot_width"), "{guessed:?}");
}

#[test]
fn chips_are_only_raised_for_what_the_brief_left_open() {
    let quiet = local::parse("3BHK on a 30x40 site").unwrap();
    assert_eq!(quiet.open_chips().len(), 5, "nothing was said, so all five");

    let said = local::parse("3bhk 30x40 with pooja, balcony and vastu").unwrap();
    let open: Vec<&str> = said.open_chips().iter().map(|(k, _)| *k).collect();
    assert!(!open.contains(&"puja"), "{open:?}");
    assert!(!open.contains(&"balcony"), "{open:?}");
    assert!(!open.contains(&"vaastu"), "{open:?}");
    assert_eq!(open.len(), 2);
}

#[test]
fn a_model_reply_wrapped_in_prose_or_a_fence_still_parses() {
    // Every provider does this occasionally, and refusing over it would mean intake
    // working on one provider and not another.
    let bare = r#"{"plot_width":30,"plot_depth":40,"bedrooms":3}"#;
    let shapes = [
        bare.to_string(),
        format!("```json\n{bare}\n```"),
        format!("Here is the brief:\n{bare}\nLet me know if that looks right."),
        format!("```\n{bare}\n```"),
    ];
    for s in shapes {
        let got =
            parse::parse_response(&s, None).unwrap_or_else(|e| panic!("{s:?} did not parse: {e}"));
        assert_eq!(got.brief.bedrooms, 3);
    }
}

#[test]
fn the_repairs_models_need_are_applied_and_recorded() {
    // A silent repair is a lie about what the model did. Each one is named so a bad model
    // shows up in the log rather than being quietly carried.
    let reply = r#"{
        "plot_width": "30", "plot_depth": "40", "bedrooms": "3",
        "road_facing": "North", "units": "ft", "puja": "yes"
    }"#;
    let got = parse::parse_response(reply, None).unwrap();
    assert_eq!(got.brief.plot_width, 30.0);
    assert_eq!(got.brief.bedrooms, 3);
    assert_eq!(got.brief.road_facing, tri_params::Orientation::North);
    assert_eq!(got.brief.units, tri_params::Units::Feet);
    assert_eq!(got.brief.puja, Some(true));
    assert!(got.repairs.len() >= 6, "{:?}", got.repairs);
}

#[test]
fn a_reply_that_is_wrong_rather_than_malformed_is_refused() {
    for (reply, why) in [
        (
            r#"{"plot_width":3,"plot_depth":4,"bedrooms":3}"#,
            "tiny plot",
        ),
        (
            r#"{"plot_width":30,"plot_depth":40,"bedrooms":9}"#,
            "no template",
        ),
        (
            r#"{"plot_width":30,"plot_depth":40,"bedrooms":3,"floors":12}"#,
            "twelve floors",
        ),
    ] {
        let e = parse::parse_response(reply, None).expect_err(&format!("{why} should be refused"));
        assert!(
            matches!(e, parse::IntakeError::OutOfRange { .. }),
            "{why}: {e}"
        );
    }
}

#[test]
fn every_brief_that_parses_can_actually_be_generated() {
    // Parsing is only worth anything if the far end works. This is the seam where a
    // plausible-looking brief meets the library, and the place a unit mix-up would
    // otherwise survive all the way to a refusal in front of a user.
    let f = fixtures();
    let rules = tri_rules::RuleSet::bbmp_plotted_residential();
    let mut report: BTreeMap<&str, String> = BTreeMap::new();
    for b in f["briefs"].as_array().unwrap() {
        if b.get("expect").is_none() {
            continue;
        }
        let text = b["text"].as_str().unwrap();
        let got = local::parse(text).unwrap();
        let params = match got.brief.clone().into_parameters() {
            Ok(p) => p,
            Err(e) => {
                report.insert(text, format!("parameters: {e}"));
                continue;
            }
        };
        let derived = match tri_rules::derive_parameters(&params, &rules) {
            Ok(d) => d,
            Err(e) => {
                report.insert(text, format!("ruleset: {e}"));
                continue;
            }
        };
        if let Err(e) = tri_gen::candidates(&derived, &rules) {
            report.insert(
                text,
                format!("generation: {}", e.to_string().lines().next().unwrap_or("")),
            );
        }
    }
    // Some briefs legitimately do not fit — a 1BHK on 20x30 is refused by the library,
    // for reasons F4 recorded. What must not happen is intake producing a brief the rest
    // of the system cannot even interpret.
    let broken: Vec<&&str> = report
        .iter()
        .filter(|(_, why)| !why.starts_with("generation:"))
        .map(|(t, _)| t)
        .collect();
    assert!(broken.is_empty(), "{report:#?}");
}
