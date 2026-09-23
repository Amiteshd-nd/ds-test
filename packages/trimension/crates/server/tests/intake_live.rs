//! The other half of F6's done-when: thirty briefs against a real provider.
//!
//! **This test is `#[ignore]`d and makes real API calls that cost the key's owner money.**
//! It is not part of `cargo xtask test-all` and CI does not run it.
//!
//! ```bash
//! TRIMENSION_INTAKE_KEY=sk-... TRIMENSION_INTAKE_MODEL=claude-haiku-4-5-20251001 \
//!   cargo test -p tri-server --test intake_live -- --ignored --nocapture
//! ```
//!
//! # Why it is written but not run here
//! "Thirty test briefs parse correctly across at least two providers" is a claim about
//! models, and no amount of offline testing establishes it. `tri-intake`'s own suite
//! proves the schema, the coercions, the range checks and the stated-versus-guessed
//! accounting — the parts that are ours. This proves the rest, and somebody with a key
//! has to run it before a model is added to the allowlist. Until then the allowlist is a
//! list of models somebody intends to measure, and saying otherwise would be inventing a
//! result.
//!
//! It prints a per-brief table rather than only passing or failing, because the useful
//! output is *which* briefs a given model gets wrong.

use serde_json::Value;
use tri_api::tri_intake::{allowlist, parse, prompt};

fn fixtures() -> Value {
    let raw = include_str!("../../../fixtures/intake/briefs.json");
    serde_json::from_str(raw).unwrap()
}

#[tokio::test]
#[ignore = "makes paid API calls; needs TRIMENSION_INTAKE_KEY"]
async fn thirty_briefs_against_a_real_provider() {
    let key = std::env::var("TRIMENSION_INTAKE_KEY")
        .expect("set TRIMENSION_INTAKE_KEY to the key you want billed");
    let id = std::env::var("TRIMENSION_INTAKE_MODEL")
        .expect("set TRIMENSION_INTAKE_MODEL to an allowlisted model id");
    let model = allowlist::model(&id).unwrap_or_else(|| panic!("{id} is not allowlisted"));

    let system = prompt::system();
    let client = reqwest::Client::new();
    let f = fixtures();
    let mut failures = Vec::new();
    let mut ran = 0;

    for b in f["briefs"].as_array().unwrap() {
        let text = b["text"].as_str().unwrap();
        let body = allowlist::request_body(model, &system, text);
        let mut call = client.post(model.provider.base_url()).json(&body);
        for (n, v) in allowlist::headers(model, &key) {
            call = call.header(n, v);
        }
        let envelope: Value = call
            .send()
            .await
            .expect("the provider answered")
            .json()
            .await
            .expect("the reply was JSON");
        let reply = allowlist::extract_text(model.provider, &envelope)
            .unwrap_or_else(|| panic!("{text:?}: no text in {envelope}"));
        ran += 1;

        match (b.get("expect"), parse::parse_response(&reply, None)) {
            (Some(expect), Ok(got)) => {
                let brief = serde_json::to_value(&got.brief).unwrap();
                for (k, want) in expect.as_object().unwrap() {
                    let have = brief.get(k).unwrap_or(&Value::Null);
                    let same = match (want.as_f64(), have.as_f64()) {
                        (Some(a), Some(b)) => (a - b).abs() < 0.01,
                        _ => want == have,
                    };
                    if !same {
                        failures.push(format!("{text:?}: {k} = {have}, expected {want}"));
                    }
                }
                // The rule the prompt leans on hardest, and the one a model breaks most
                // readily: filling a field the brief never mentioned.
                for field in got.stated.iter() {
                    if !expect.as_object().unwrap().contains_key(field.as_str()) {
                        failures.push(format!(
                            "{text:?}: invented {} — the brief does not say it",
                            field.as_str()
                        ));
                    }
                }
            }
            (Some(_), Err(e)) => failures.push(format!("{text:?}: refused — {e}")),
            (None, Ok(_)) => failures.push(format!("{text:?}: answered a brief it cannot know")),
            (None, Err(_)) => {}
        }
        println!("{:>3}/30  {text}", ran);
    }

    println!("\n{id}: {} failure(s) over {ran} briefs", failures.len());
    for f in &failures {
        println!("  {f}");
    }
    assert!(failures.is_empty(), "{id} did not parse all thirty");
}
