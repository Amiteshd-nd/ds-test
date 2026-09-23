//! The bring-your-own-key proxy.
//!
//! # Why a proxy at all
//! The key could go straight from the browser to the provider and skip this hop. It does
//! not, for two reasons. A browser call needs the provider to allow this origin by CORS,
//! and neither does. And a key in browser code is a key in the page, exposed to every
//! extension and every future script tag on the domain.
//!
//! # What this endpoint will and will not do
//! - The **URL is not in the request.** It comes from the allowlisted model's provider.
//!   Without that, a crafted request could make the server post a user's key anywhere.
//! - A model that is not on the allowlist is refused **by name**. The PRD answers
//!   "BYO-LLM produces inconsistent quality" with an allowlist plus an eval per model, and
//!   passing an unknown model through would make that promise empty.
//! - The key is read from the request, used once, and dropped. It is never stored, never
//!   logged, and never put in a URL. Neither is the brief: it is the user's project.
//! - The reply is parsed into a `Brief` here rather than forwarded raw, so a provider
//!   cannot hand the browser arbitrary JSON to render.

use axum::response::IntoResponse;
use axum::{http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tri_api::tri_intake::{allowlist, parse, prompt};

#[derive(Deserialize)]
pub struct IntakeRequest {
    pub model: String,
    /// The user's own key. Used for this one call.
    pub key: String,
    /// What the architect typed.
    pub prompt: String,
}

#[derive(Serialize)]
pub struct IntakeResponse {
    pub brief: tri_api::tri_params::Brief,
    /// Fields the brief itself supplied. Everything else on the card is a proposal.
    pub stated: Vec<&'static str>,
    pub guessed: Vec<&'static str>,
    pub chips: Vec<Chip>,
    pub repairs: Vec<String>,
    pub source: String,
}

#[derive(Serialize)]
pub struct Chip {
    pub field: &'static str,
    pub question: &'static str,
}

/// The allowlist, for the settings panel.
pub async fn models() -> Json<Vec<serde_json::Value>> {
    Json(
        allowlist::ALLOWED
            .iter()
            .map(|m| {
                serde_json::json!({
                    "id": m.id,
                    "label": m.label,
                    "provider": m.provider.as_str(),
                })
            })
            .collect(),
    )
}

pub async fn intake(Json(req): Json<IntakeRequest>) -> Result<Json<IntakeResponse>, ApiError> {
    let model = allowlist::model(&req.model).ok_or_else(|| {
        ApiError(
            StatusCode::BAD_REQUEST,
            format!(
                "{} is not an allowlisted model. Allowed: {}",
                req.model,
                allowlist::ALLOWED
                    .iter()
                    .map(|m| m.id)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        )
    })?;
    if req.key.trim().is_empty() {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "no key. This endpoint forwards your own key and stores nothing.".into(),
        ));
    }

    let body = allowlist::request_body(model, &prompt::system(), &req.prompt);
    let client = reqwest::Client::new();
    let mut call = client.post(model.provider.base_url()).json(&body);
    for (name, value) in allowlist::headers(model, &req.key) {
        call = call.header(name, value);
    }

    let resp = call.send().await.map_err(|e| {
        // `reqwest`'s Display can include the URL but never a header, so the key cannot
        // reach this string. Said out loud because it is the kind of thing that changes
        // quietly under a dependency bump.
        ApiError(
            StatusCode::BAD_GATEWAY,
            format!("{} did not answer: {e}", model.provider.as_str()),
        )
    })?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // The provider's own message, which is usually the useful one ("invalid api key",
        // "credit balance too low"), passed through rather than flattened to "failed".
        return Err(ApiError(
            StatusCode::BAD_GATEWAY,
            format!(
                "{} returned {status}: {}",
                model.provider.as_str(),
                first_line(&text)
            ),
        ));
    }

    let envelope: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| ApiError(StatusCode::BAD_GATEWAY, format!("unreadable reply: {e}")))?;
    let reply = allowlist::extract_text(model.provider, &envelope).ok_or_else(|| {
        ApiError(
            StatusCode::BAD_GATEWAY,
            "the reply had no text in it".to_string(),
        )
    })?;

    let got = parse::parse_response(&reply, None)
        .map_err(|e| ApiError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string()))?;

    Ok(Json(IntakeResponse {
        stated: got.stated.iter().map(|f| f.as_str()).collect(),
        guessed: got.guessed().iter().map(|f| f.as_str()).collect(),
        chips: got
            .open_chips()
            .into_iter()
            .map(|(field, question)| Chip { field, question })
            .collect(),
        repairs: got.repairs.clone(),
        source: format!("{}/{}", model.provider.as_str(), model.id),
        brief: got.brief,
    }))
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or("").chars().take(200).collect()
}

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}
