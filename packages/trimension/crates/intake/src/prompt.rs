//! The system prompt, built from the schema rather than written beside it.
//!
//! Invariant I3 says agent tool schemas are generated from the Rust types and never
//! hand-written, "so the two cannot drift". The same argument applies with more force
//! here: a hand-written prompt listing the fields would be a second declaration of
//! [`Brief`](tri_params::Brief), and the failure mode is not a compile error — it is a
//! model confidently filling a field that no longer exists, six months after somebody
//! renamed it.
//!
//! So the field list comes from `Brief::form_schema()`, which carries the `x-tier` and
//! `x-label` metadata the intake form already uses. Only the *instructions* are prose.

use tri_params::brief;

/// Instructions that are genuinely about behaviour rather than about the fields.
const RULES: &str = "\
You turn an architect's one-line brief into a JSON object.

Rules:
- Reply with the JSON object and nothing else. No prose, no code fence.
- Include a key ONLY if the brief states or clearly implies its value. Omit everything
  else. Do not guess, do not fill a field with a typical value, and do not include a key
  with a null just to be complete. A missing key means 'not said', which is information;
  a guessed value is a mistake that looks like an answer.
- '30x40' means plot_width 30, plot_depth 40, in whatever unit the brief uses. Indian
  plot sizes are conventionally in feet unless the brief says metres.
- '3BHK' means bedrooms 3. 'G+1' means floors 2, 'G+2' means floors 3, 'duplex' means
  floors 2, 'ground floor only' means floors 1.
- 'north facing' sets road_facing to north: it names the side the road is on.
- The five chip fields are true only if the brief asks for the thing, false only if it
  refuses it. Omit them otherwise.
- You never describe rooms, walls or layout. A solver does that. Your only job is the
  form.";

/// The full system prompt: the rules, then the fields, then the schema.
pub fn system() -> String {
    let mut s = String::from(RULES);
    s.push_str("\n\nFields:\n");
    for (name, tier) in brief::form_fields() {
        s.push_str(&format!("- {name} ({})\n", tier.label()));
    }
    s.push_str("\nJSON Schema:\n");
    s.push_str(
        &serde_json::to_string_pretty(&brief::form_schema()).unwrap_or_else(|_| "{}".to_string()),
    );
    s
}
