//! Tool JSON Schema, **generated** from the Rust types (invariant **I3**).
//!
//! PRD Prompt 7: "Hand-written tool schemas are an I3 violation — if generation can't
//! express something, change the Rust type, don't hand-write the schema."
//!
//! `cargo xtask gen-schemas` writes these to `crates/api/schemas/`, and CI fails if the
//! committed files differ from what this produces or if the registry and the schema set
//! disagree about which tools exist.

use crate::registry::{self, ToolKind, TOOLS};
use schemars::schema_for;
use serde_json::{json, Value};

/// The JSON Schema for one tool's arguments.
pub fn schema_for_tool(name: &str) -> Option<Value> {
    let schema = match name {
        "query_entities" => schema_for!(registry::QueryEntitiesArgs),
        "describe_region" => schema_for!(registry::DescribeRegionArgs),
        "measure" => schema_for!(registry::MeasureArgs),
        "render_view" => schema_for!(registry::RenderViewArgs),
        "apply_commands" => schema_for!(registry::ApplyCommandsArgs),
        _ => return None,
    };
    serde_json::to_value(schema).ok()
}

/// A tool definition in the shape an LLM tool API expects.
pub fn tool_definition(name: &str) -> Option<Value> {
    let def = registry::tool(name)?;
    Some(json!({
        "name": def.name,
        "description": def.description,
        "input_schema": schema_for_tool(name)?,
        // Read tools need no approval; writes do (I7). Emitted so the host cannot get
        // the classification wrong by hand.
        "requires_approval": def.kind == ToolKind::Write,
    }))
}

/// Every tool, ready to hand to an AI SDK.
pub fn all_tool_definitions() -> Vec<Value> {
    TOOLS
        .iter()
        .filter_map(|t| tool_definition(t.name))
        .collect()
}

/// The command registry's own schema. The UI generates its command palette from this,
/// which is how a human and an agent stay on the same command set.
pub fn command_schema() -> Value {
    serde_json::to_value(schema_for!(crate::command::Command)).unwrap_or(Value::Null)
}

/// Canonical, stable JSON text for a schema, so a byte comparison in CI is meaningful.
pub fn to_pretty(v: &Value) -> String {
    let mut s = serde_json::to_string_pretty(v).unwrap_or_default();
    s.push('\n');
    s
}
