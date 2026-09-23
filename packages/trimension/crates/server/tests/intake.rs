//! The proxy's refusals. Nothing here makes a network call.
//!
//! What is worth testing without a key is the boundary: which models are accepted, where
//! the request would be sent, and that the key never leaves the one place it is used.

use tri_api::tri_intake::allowlist::{self, Provider};

#[test]
fn only_allowlisted_models_resolve() {
    assert!(allowlist::model("claude-sonnet-5").is_some());
    assert!(allowlist::model("gpt-4.1").is_some());
    // The shapes an attacker or a typo produces.
    for bad in [
        "gpt-5-turbo",
        "claude-sonnet-5 ",
        "CLAUDE-SONNET-5",
        "../../etc/passwd",
        "",
    ] {
        assert!(allowlist::model(bad).is_none(), "{bad:?} resolved");
    }
}

#[test]
fn the_allowlist_covers_at_least_two_providers() {
    // The done-when says "at least two providers", and one provider's outage should not
    // be the product's outage.
    let mut kinds: Vec<&str> = allowlist::ALLOWED
        .iter()
        .map(|m| m.provider.as_str())
        .collect();
    kinds.sort_unstable();
    kinds.dedup();
    assert!(kinds.len() >= 2, "{kinds:?}");
}

#[test]
fn a_destination_can_only_come_from_the_allowlist() {
    // The request names a model, never a URL. If it could name a URL, a crafted request
    // would make the server post the user's own key to an attacker's host.
    for m in allowlist::ALLOWED {
        let url = m.provider.base_url();
        assert!(url.starts_with("https://"), "{url}");
        let host = url
            .trim_start_matches("https://")
            .split('/')
            .next()
            .unwrap();
        assert!(
            matches!(host, "api.anthropic.com" | "api.openai.com"),
            "unexpected host {host}"
        );
    }
}

#[test]
fn the_key_goes_in_a_header_and_never_in_the_body_or_the_url() {
    // A key in a URL ends up in access logs, proxies and error strings. A key in the body
    // ends up wherever the body is logged. This is the check that both stay true.
    const KEY: &str = "sk-test-do-not-log-me";
    for m in allowlist::ALLOWED {
        let body = allowlist::request_body(m, "system prompt", "3BHK on 30x40");
        let rendered = body.to_string();
        assert!(!rendered.contains(KEY));
        assert!(!m.provider.base_url().contains(KEY));

        let headers = allowlist::headers(m, KEY);
        let carrying: Vec<&str> = headers
            .iter()
            .filter(|(_, v)| v.contains(KEY))
            .map(|(n, _)| *n)
            .collect();
        assert_eq!(carrying.len(), 1, "{:?} carries the key {carrying:?}", m.id);
        assert!(
            matches!(carrying[0], "x-api-key" | "authorization"),
            "{:?}",
            carrying[0]
        );
    }
}

#[test]
fn each_provider_is_asked_for_json_and_given_the_generated_prompt() {
    let system = tri_api::tri_intake::prompt::system();
    // The prompt is built from the schema, so the field names must be in it.
    for field in ["plot_width", "plot_depth", "bedrooms", "road_facing"] {
        assert!(system.contains(field), "the prompt never mentions {field}");
    }
    for m in allowlist::ALLOWED {
        let body = allowlist::request_body(m, &system, "3BHK on 30x40");
        assert_eq!(body["model"], m.id);
        match m.provider {
            Provider::Anthropic => {
                assert_eq!(body["system"], system);
                assert_eq!(body["messages"][1]["content"], "{");
            }
            Provider::Openai => {
                assert_eq!(body["response_format"]["type"], "json_object");
                assert_eq!(body["messages"][0]["content"], system);
            }
        }
    }
}

#[test]
fn a_reply_from_either_provider_reaches_the_same_brief() {
    // The two wire formats differ; everything after them must not. A brief that parsed on
    // one provider and not the other would make the allowlist a lie.
    let json = r#"{"plot_width":30,"plot_depth":40,"bedrooms":3,"road_facing":"north"}"#;
    let anthropic = serde_json::json!({
        // The opening brace was prefilled, so the reply does not repeat it.
        "content": [{ "type": "text", "text": &json[1..] }]
    });
    let openai = serde_json::json!({
        "choices": [{ "message": { "role": "assistant", "content": json } }]
    });
    let a = allowlist::extract_text(Provider::Anthropic, &anthropic).unwrap();
    let o = allowlist::extract_text(Provider::Openai, &openai).unwrap();
    let pa = tri_api::tri_intake::parse::parse_response(&a, None).unwrap();
    let po = tri_api::tri_intake::parse::parse_response(&o, None).unwrap();
    assert_eq!(pa.brief, po.brief);
    assert_eq!(pa.brief.bedrooms, 3);
}
