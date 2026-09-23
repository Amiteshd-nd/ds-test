//! Which models may be called, and how each provider's wire format differs.
//!
//! # Why an allowlist and not a free text field
//! The PRD names "BYO-LLM produces inconsistent quality" as a live risk and answers it
//! with "an allowlist, plus an eval set of thirty test briefs run against every supported
//! model". A model nobody has run the eval against is a model nobody can vouch for, so the
//! proxy refuses it by name rather than passing it through and hoping.
//!
//! The allowlist is also a safety boundary. The proxy forwards a key the user supplied to
//! a host this table names; without it, a crafted request could make the server post that
//! key to any URL. The base URL comes from the provider, never from the request.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    Openai,
}

impl Provider {
    /// The only host this provider's traffic may go to. Not overridable from a request.
    pub fn base_url(self) -> &'static str {
        match self {
            Provider::Anthropic => "https://api.anthropic.com/v1/messages",
            Provider::Openai => "https://api.openai.com/v1/chat/completions",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Provider::Anthropic => "anthropic",
            Provider::Openai => "openai",
        }
    }
}

/// One allowlisted model.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Model {
    pub provider: Provider,
    pub id: &'static str,
    /// Shown in the settings panel.
    pub label: &'static str,
}

/// The models the eval has been run against.
///
/// Two providers, which is what the done-when asks for. Mid-tier entries are deliberate
/// rather than a cost saving: if intake only works on the largest model available, the
/// typed-JSON split is not doing its job and the architecture is wrong.
pub const ALLOWED: &[Model] = &[
    Model {
        provider: Provider::Anthropic,
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
    },
    Model {
        provider: Provider::Anthropic,
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
    },
    Model {
        provider: Provider::Openai,
        id: "gpt-4.1",
        label: "GPT-4.1",
    },
    Model {
        provider: Provider::Openai,
        id: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
    },
];

/// Look a model up by id. `None` means "not allowlisted", which the proxy refuses.
pub fn model(id: &str) -> Option<&'static Model> {
    ALLOWED.iter().find(|m| m.id == id)
}

/// The request body for a provider, given the system prompt and the user's sentence.
///
/// Both providers are asked for JSON and nothing else. Neither is given a tool: a tool
/// call is a heavier contract for the same result, and `response_format` / a prefilled
/// assistant turn are better supported across the mid-tier models this has to work on.
pub fn request_body(model: &Model, system: &str, user: &str) -> serde_json::Value {
    match model.provider {
        Provider::Anthropic => serde_json::json!({
            "model": model.id,
            "max_tokens": 1024,
            "system": system,
            "messages": [
                { "role": "user", "content": user },
                // Prefilling the opening brace is the cheapest way to stop a model
                // wrapping its JSON in prose or a fenced code block. `parse` copes with
                // both anyway, but not needing to cope is better.
                { "role": "assistant", "content": "{" }
            ]
        }),
        Provider::Openai => serde_json::json!({
            "model": model.id,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ]
        }),
    }
}

/// The headers a provider needs, given the user's key.
///
/// Returned rather than applied so that the one place a key is touched is visible in a
/// single function and can be read in full.
pub fn headers(model: &Model, key: &str) -> Vec<(&'static str, String)> {
    match model.provider {
        Provider::Anthropic => vec![
            ("x-api-key", key.to_string()),
            ("anthropic-version", "2023-06-01".to_string()),
            ("content-type", "application/json".to_string()),
        ],
        Provider::Openai => vec![
            ("authorization", format!("Bearer {key}")),
            ("content-type", "application/json".to_string()),
        ],
    }
}

/// Pull the model's text out of a provider response.
///
/// The two wire formats differ and neither is worth a dependency. Anthropic's assistant
/// prefill is not echoed back, so the opening brace is put back here.
pub fn extract_text(provider: Provider, body: &serde_json::Value) -> Option<String> {
    match provider {
        Provider::Anthropic => {
            let text = body
                .get("content")?
                .as_array()?
                .iter()
                .find_map(|b| b.get("text")?.as_str())?;
            Some(format!("{{{text}"))
        }
        Provider::Openai => Some(
            body.get("choices")?
                .as_array()?
                .first()?
                .get("message")?
                .get("content")?
                .as_str()?
                .to_string(),
        ),
    }
}
