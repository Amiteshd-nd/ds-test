//! Tool definitions and dispatch. The five tools of PRD §4.7 — plus the correction to
//! the write tool explained in `command`.

use crate::command::{Command, CommandError};
use crate::query::{self, BoxMm, EntityKind, Measurement, QueryResult, RegionDescription};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tri_commit::{ApprovedPlan, Commit, Sequencer};
use tri_doc::Document;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolKind {
    /// Safe to call without approval (invariant **I7**: only writes need a plan).
    Read,
    Write,
}

#[derive(Clone, Debug)]
pub struct ToolDef {
    pub name: &'static str,
    pub kind: ToolKind,
    pub description: &'static str,
}

/// The tool surface, in one list. `xtask gen-schemas` walks this, and the CI drift test
/// compares it against the generated files — a tool without a schema, or a schema
/// without a tool, fails the build.
pub const TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "query_entities",
        kind: ToolKind::Read,
        description: "Find entities by bounding box, layer or kind. Returns a capped, \
                      summarised list with a truncation flag — never the whole document.",
    },
    ToolDef {
        name: "describe_region",
        kind: ToolKind::Read,
        description: "Summary statistics and layer breakdown for a region. Returns \
                      aggregates, never entity lists.",
    },
    ToolDef {
        name: "measure",
        kind: ToolKind::Read,
        description: "Lengths, areas and volumes for specific entities, each with the \
                      provenance of every value that went into it.",
    },
    ToolDef {
        name: "render_view",
        kind: ToolKind::Read,
        description: "Render the model headlessly to a PNG so the caller can see what it \
                      made. Four views: plan, left elevation, right elevation, and a \
                      two-point perspective.",
    },
    ToolDef {
        name: "apply_commands",
        kind: ToolKind::Write,
        description: "Apply commands from the shared registry — the same commands the UI \
                      dispatches. Requires an approved plan.",
    },
];

pub fn tool(name: &str) -> Option<&'static ToolDef> {
    TOOLS.iter().find(|t| t.name == name)
}

// ---- tool arguments, from which the JSON Schemas are generated ----------------

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct QueryEntitiesArgs {
    /// Restrict to entities touching this box, in millimetres.
    #[serde(default)]
    pub bbox: Option<BoxMm>,
    #[serde(default)]
    pub layer: Option<String>,
    #[serde(default)]
    pub kind: Option<EntityKind>,
    /// Capped at 200 regardless of what is asked for.
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct DescribeRegionArgs {
    #[serde(default)]
    pub bbox: Option<BoxMm>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct MeasureArgs {
    pub ids: Vec<u64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ViewModeArg {
    PlanView2d,
    ElevationLeft,
    ElevationRight,
    TwoPointPerspective,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RenderViewArgs {
    #[serde(default)]
    pub mode: Option<ViewModeArg>,
    #[serde(default)]
    pub width_px: Option<u32>,
    #[serde(default)]
    pub height_px: Option<u32>,
    /// Frame this region. Omit to fit the whole model.
    #[serde(default)]
    pub bbox: Option<BoxMm>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApplyCommandsArgs {
    /// The plan a human approved. Without it the call is refused (invariant I7).
    pub plan_id: String,
    pub commands: Vec<Command>,
    pub message: String,
}

// ---- results -----------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct RenderResult {
    pub width: u32,
    pub height: u32,
    /// PNG, base64. The point of this tool is that the caller can *see* the model
    /// (PRD §4.7) — a description of the render would defeat it.
    pub png_base64: String,
    /// How much of the frame is not background. A near-zero value means the camera is
    /// pointed at nothing, which is the most common way this tool wastes a turn.
    pub ink_fraction: f32,
    pub entities_drawn: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
pub struct ApplyResult {
    pub commit_id: String,
    pub ops_applied: usize,
    pub document_hash: String,
}

#[derive(Debug)]
pub enum ToolError {
    /// I7: a write without an approved plan.
    ApprovalRequired {
        expected: Option<String>,
        got: String,
    },
    Command(CommandError),
    Rejected(Vec<String>),
    Render(String),
    Unknown(String),
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolError::ApprovalRequired { expected, got } => match expected {
                Some(e) => write!(
                    f,
                    "this write cites plan {got:?} but the approved plan is {e:?}"
                ),
                None => write!(
                    f,
                    "refusing to write: no approved plan (cited {got:?}). A human must \
                     approve the plan before any commit is applied."
                ),
            },
            ToolError::Command(e) => write!(f, "{e}"),
            ToolError::Rejected(v) => write!(f, "commit rejected: {}", v.join("; ")),
            ToolError::Render(m) => write!(f, "render failed: {m}"),
            ToolError::Unknown(t) => write!(f, "no such tool: {t}"),
        }
    }
}

impl std::error::Error for ToolError {}

// ---- dispatch ----------------------------------------------------------------

pub fn query_entities(doc: &Document, a: QueryEntitiesArgs) -> QueryResult {
    query::query_entities(doc, a.bbox, a.layer.as_deref(), a.kind, a.limit)
}

pub fn describe_region(doc: &Document, a: DescribeRegionArgs) -> RegionDescription {
    query::describe_region(doc, a.bbox)
}

pub fn measure(doc: &Document, a: MeasureArgs) -> Vec<Measurement> {
    query::measure(doc, &a.ids)
}

/// Headless render. Calls the same `tri_render::view` the browser calls (invariant I6).
pub fn render_view(doc: &Document, a: RenderViewArgs) -> Result<RenderResult, ToolError> {
    use tri_render::camera::{Camera, ViewMode};

    let (w, h) = (
        a.width_px.unwrap_or(800).clamp(64, 2048),
        a.height_px.unwrap_or(600).clamp(64, 2048),
    );
    let mode = match a.mode.unwrap_or(ViewModeArg::PlanView2d) {
        ViewModeArg::PlanView2d => ViewMode::PlanView2d,
        ViewModeArg::ElevationLeft => ViewMode::ElevationLeft,
        ViewModeArg::ElevationRight => ViewMode::ElevationRight,
        ViewModeArg::TwoPointPerspective => ViewMode::TwoPointPerspective,
    };

    let bounds = match a.bbox {
        Some(b) => Some(tri_render::camera::Bounds {
            min: tri_doc::Point2::new(
                tri_doc::Length::from_mm_f64(b.min_x),
                tri_doc::Length::from_mm_f64(b.min_y),
            ),
            max: tri_doc::Point2::new(
                tri_doc::Length::from_mm_f64(b.max_x),
                tri_doc::Length::from_mm_f64(b.max_y),
            ),
        }),
        None => tri_render::scene::document_bounds(doc),
    };
    let (z_min, z_max) = tri_render::scene::document_height(doc);
    let camera = match bounds {
        Some(b) => Camera::fit_for(b, z_min, z_max, w, h, mode),
        None => Camera {
            width_px: w,
            height_px: h,
            ..Camera::default()
        },
    };

    let scene = tri_render::scene::build(doc, camera, mode);
    let image =
        tri_render::view(doc, camera, mode).map_err(|e| ToolError::Render(e.to_string()))?;

    Ok(RenderResult {
        width: image.width,
        height: image.height,
        // The scene knows its own clear colour, sRGB-encoded to match the readback.
        // Hardcoding the linear value here is how this metric reported 100% ink for
        // every render, including ones that framed nothing at all.
        ink_fraction: image.ink_fraction(scene.background_srgb(), 4),
        entities_drawn: scene.drawn.len(),
        png_base64: base64(&image.to_png()),
    })
}

/// The write tool. **Refuses without an approved plan** (invariant I7).
///
/// The `ApprovedPlan` argument is the enforcement: it has a private constructor and can
/// only be produced by `Plan::approve`, so an unapproved write is not merely rejected —
/// it cannot be expressed.
pub fn apply_commands(
    seq: &mut Sequencer,
    approved: Option<&ApprovedPlan>,
    a: ApplyCommandsArgs,
) -> Result<ApplyResult, ToolError> {
    let approved = match approved {
        Some(p) if p.id().0 == a.plan_id => p,
        Some(p) => {
            return Err(ToolError::ApprovalRequired {
                expected: Some(p.id().0.clone()),
                got: a.plan_id,
            })
        }
        None => {
            return Err(ToolError::ApprovalRequired {
                expected: None,
                got: a.plan_id,
            })
        }
    };

    let author = approved.author();
    let mut ops = Vec::new();
    // Commands are translated against the document as it stands. A command that depends
    // on an earlier command in the same batch is a real limitation and is rejected by
    // validation rather than silently mis-resolved.
    for c in &a.commands {
        ops.extend(
            c.to_ops(seq.document(), &author.to_string())
                .map_err(ToolError::Command)?,
        );
    }

    let ops_applied = ops.len();
    let commit = Commit::new(seq.head(), author, ops, a.message);
    let sequenced = seq.submit(commit).map_err(|e| match e {
        tri_commit::CommitError::Rejected { violations, .. } => {
            ToolError::Rejected(violations.iter().map(|v| v.to_string()).collect())
        }
        other => ToolError::Rejected(vec![other.to_string()]),
    })?;

    Ok(ApplyResult {
        commit_id: sequenced.id().to_hex(),
        ops_applied,
        document_hash: seq.document().hash().to_hex(),
    })
}

/// Minimal base64. A dependency for 30 lines of table lookup is not worth the supply
/// chain.
fn base64(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(A[(n >> 18 & 63) as usize] as char);
        out.push(A[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            A[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            A[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
