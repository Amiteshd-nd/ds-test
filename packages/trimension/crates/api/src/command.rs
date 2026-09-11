//! The command registry — invariant **I3**'s single source of truth.
//!
//! A human clicking "extrude wall" and an agent calling `extrude_wall` dispatch through
//! the *same* enum variant here and produce the same ops, which become the same commit.
//! There is no second path.
//!
//! # Resolving a contradiction in the PRD
//! PRD §4.7 lists the agent's write tool as `apply_commit(ops)` — a raw op list. That
//! contradicts I3, which says the agent and the UI use the same commands: a raw op list
//! is a *lower*-level write path than any human has, so the agent would end up with more
//! privilege than the UI. That is precisely the trap §2 warns about via Motif ("an MCP
//! server layered on an app API cannot give the model deeper access than that API
//! permits") — inverted.
//!
//! Invariants outrank architecture notes (PRD §3 is explicit), so the write tool is
//! `apply_commands`, taking [`Command`]s from this registry. `Op` is an internal
//! representation and is not reachable from the tool surface at all.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tri_doc::component::{Opening, OpeningKind, Polyline2d, WallProfile};
use tri_doc::layer::Layer;
use tri_doc::{Component, ComponentKey, Document, EntityId, LayerId, Length, Op, Point2, Tracked};

/// A point in millimetres, as the tool surface talks about them. Converted to exact
/// internal micrometres on the way in — millimetres are what a drafter says and what an
/// LLM will produce, and the conversion belongs at the boundary rather than everywhere.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct PointMm {
    pub x: f64,
    pub y: f64,
}

impl From<PointMm> for Point2 {
    fn from(p: PointMm) -> Point2 {
        Point2::new(Length::from_mm_f64(p.x), Length::from_mm_f64(p.y))
    }
}

impl From<Point2> for PointMm {
    fn from(p: Point2) -> PointMm {
        PointMm {
            x: p.x.as_mm_f64(),
            y: p.y.as_mm_f64(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum OpeningKindArg {
    Door,
    Window,
    Passage,
}

impl From<OpeningKindArg> for OpeningKind {
    fn from(k: OpeningKindArg) -> OpeningKind {
        match k {
            OpeningKindArg::Door => OpeningKind::Door,
            OpeningKindArg::Window => OpeningKind::Window,
            OpeningKindArg::Passage => OpeningKind::Passage,
        }
    }
}

/// Every mutation the product supports, from either kind of client.
///
/// Adding a variant here adds it to the UI's dispatch *and* to the agent's tool schema
/// simultaneously, because both are generated from this type. That is the mechanism that
/// keeps I3 true without anyone having to remember it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum Command {
    /// Create a layer.
    CreateLayer {
        name: String,
        /// Parent layer, for a nested layer tree. Cycles are rejected by validation.
        #[serde(default)]
        parent: Option<u64>,
    },

    /// Show or hide a layer.
    SetLayerVisible { layer: u64, visible: bool },

    /// Create a wall from a centreline.
    ///
    /// `height_mm` is optional on purpose: omitting it records an explicitly `Assumed`
    /// height naming the default, which is the honest outcome. Supplying it records a
    /// `Measured` height attributed to whoever issued the command.
    CreateWall {
        centreline_mm: Vec<PointMm>,
        thickness_mm: f64,
        #[serde(default)]
        height_mm: Option<f64>,
        #[serde(default)]
        layer: Option<u64>,
    },

    /// Change a wall's height. Recorded as `Measured` with the reason given, because a
    /// human or an agent stating a height is evidence — but only if it says why.
    SetWallHeight {
        entity: u64,
        height_mm: f64,
        /// Why this height. Required: a height with no justification is exactly what
        /// invariant I4 exists to prevent.
        reason: String,
    },

    /// Cut a door or window into a wall.
    CreateOpening {
        host: u64,
        kind: OpeningKindArg,
        /// Distance along the host wall's centreline to the opening's centre.
        position_mm: f64,
        width_mm: f64,
        height_mm: f64,
        #[serde(default)]
        sill_mm: Option<f64>,
    },

    /// Draw a plain polyline.
    CreatePolyline {
        points_mm: Vec<PointMm>,
        #[serde(default)]
        closed: bool,
        #[serde(default)]
        layer: Option<u64>,
    },

    /// Move an entity to a different layer.
    SetEntityLayer { entity: u64, layer: u64 },

    /// Rename or label an entity.
    SetLabel { entity: u64, label: String },

    /// Delete an entity. Source-schema data is never touched — invariant I8 makes the
    /// original drawing permanent, and this only removes derived objects.
    DeleteEntity { entity: u64 },
}

#[derive(Debug)]
pub enum CommandError {
    UnknownEntity(u64),
    UnknownLayer(u64),
    /// A command that cannot be turned into ops given the current document.
    NotApplicable(String),
    /// A value the command surface rejects before validation even sees it.
    BadArgument(String),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::UnknownEntity(e) => write!(f, "no entity with id {e}"),
            CommandError::UnknownLayer(l) => write!(f, "no layer with id {l}"),
            CommandError::NotApplicable(m) => write!(f, "{m}"),
            CommandError::BadArgument(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for CommandError {}

impl Command {
    /// The registry name. Matches the serde tag, and is what a tool call uses.
    pub fn name(&self) -> &'static str {
        match self {
            Command::CreateLayer { .. } => "create_layer",
            Command::SetLayerVisible { .. } => "set_layer_visible",
            Command::CreateWall { .. } => "create_wall",
            Command::SetWallHeight { .. } => "set_wall_height",
            Command::CreateOpening { .. } => "create_opening",
            Command::CreatePolyline { .. } => "create_polyline",
            Command::SetEntityLayer { .. } => "set_entity_layer",
            Command::SetLabel { .. } => "set_label",
            Command::DeleteEntity { .. } => "delete_entity",
        }
    }

    /// Every command name in the registry. Used by the CI drift test.
    pub const ALL: &'static [&'static str] = &[
        "create_layer",
        "set_layer_visible",
        "create_wall",
        "set_wall_height",
        "create_opening",
        "create_polyline",
        "set_entity_layer",
        "set_label",
        "delete_entity",
    ];

    /// Turn a command into ops against a document.
    ///
    /// This does *not* validate — `tri_doc::check` does, and it runs on the ops this
    /// produces. What happens here is argument translation and lookup; anything that can
    /// only be judged against document state is left for validation so there is exactly
    /// one place that decides what is legal.
    pub fn to_ops(&self, doc: &Document, author: &str) -> Result<Vec<Op>, CommandError> {
        let layer_ref = |id: u64| -> Result<LayerId, CommandError> {
            let l = LayerId::from_raw(id);
            doc.layers()
                .contains(l)
                .then_some(l)
                .ok_or(CommandError::UnknownLayer(id))
        };
        let entity_ref = |id: u64| -> Result<EntityId, CommandError> {
            let e = EntityId::from_raw(id);
            doc.contains_entity(e)
                .then_some(e)
                .ok_or(CommandError::UnknownEntity(id))
        };
        let positive = |v: f64, what: &str| -> Result<Length, CommandError> {
            if !v.is_finite() || v <= 0.0 {
                return Err(CommandError::BadArgument(format!(
                    "{what} must be a positive, finite number of millimetres, got {v}"
                )));
            }
            Ok(Length::from_mm_f64(v))
        };

        Ok(match self {
            Command::CreateLayer { name, parent } => {
                let parent = parent.map(layer_ref).transpose()?;
                vec![Op::CreateLayer {
                    layer: Layer {
                        name: name.clone(),
                        parent,
                        visible: true,
                        color: [200, 200, 200, 255],
                    },
                }]
            }

            Command::SetLayerVisible { layer, visible } => vec![Op::SetLayerVisible {
                id: layer_ref(*layer)?,
                visible: *visible,
            }],

            Command::CreateWall {
                centreline_mm,
                thickness_mm,
                height_mm,
                layer,
            } => {
                if centreline_mm.len() < 2 {
                    return Err(CommandError::BadArgument(
                        "a wall centreline needs at least two points".into(),
                    ));
                }
                let thickness = positive(*thickness_mm, "thickness_mm")?;
                let height = match height_mm {
                    Some(h) => Tracked::measured(
                        positive(*h, "height_mm")?,
                        format!("height stated by {author} when creating the wall"),
                    ),
                    None => Tracked::assumed(
                        Length::from_mm(2700),
                        "no height given; project default 2700mm".to_string(),
                    ),
                };
                let mut components = vec![Component::WallProfile(WallProfile {
                    centreline: centreline_mm.iter().map(|p| (*p).into()).collect(),
                    thickness: Tracked::measured(
                        thickness,
                        format!("thickness stated by {author}"),
                    ),
                    height,
                    base_elevation: Tracked::assumed(
                        Length::ZERO,
                        "no level given; assumed floor at 0",
                    ),
                })];
                if let Some(l) = layer {
                    components.push(Component::LayerRef(layer_ref(*l)?));
                }
                vec![Op::CreateEntity { components }]
            }

            Command::SetWallHeight {
                entity,
                height_mm,
                reason,
            } => {
                if reason.trim().is_empty() {
                    return Err(CommandError::BadArgument(
                        "a reason is required: a height with no justification cannot be \
                         reviewed (invariant I4)"
                            .into(),
                    ));
                }
                let id = entity_ref(*entity)?;
                let Some(Component::WallProfile(w)) = doc.component(id, &ComponentKey::WallProfile)
                else {
                    return Err(CommandError::NotApplicable(format!(
                        "entity {entity} is not a wall"
                    )));
                };
                vec![Op::SetComponent {
                    id,
                    component: Component::WallProfile(WallProfile {
                        centreline: w.centreline.clone(),
                        thickness: w.thickness.clone(),
                        height: Tracked::measured(
                            positive(*height_mm, "height_mm")?,
                            format!("{reason} (stated by {author})"),
                        ),
                        base_elevation: w.base_elevation.clone(),
                    }),
                }]
            }

            Command::CreateOpening {
                host,
                kind,
                position_mm,
                width_mm,
                height_mm,
                sill_mm,
            } => {
                let host_id = entity_ref(*host)?;
                let sill = sill_mm.unwrap_or(match kind {
                    OpeningKindArg::Window => 900.0,
                    _ => 0.0,
                });
                vec![Op::CreateEntity {
                    components: vec![Component::Opening(Opening {
                        host: host_id,
                        kind: (*kind).into(),
                        position: Length::from_mm_f64(*position_mm),
                        width: Tracked::measured(
                            positive(*width_mm, "width_mm")?,
                            format!("width stated by {author}"),
                        ),
                        height: Tracked::measured(
                            positive(*height_mm, "height_mm")?,
                            format!("height stated by {author}"),
                        ),
                        sill: match sill_mm {
                            Some(_) => Tracked::measured(
                                Length::from_mm_f64(sill),
                                format!("sill stated by {author}"),
                            ),
                            None => Tracked::assumed(
                                Length::from_mm_f64(sill),
                                format!("no sill given; typical {kind:?} sill {sill}mm"),
                            ),
                        },
                    })],
                }]
            }

            Command::CreatePolyline {
                points_mm,
                closed,
                layer,
            } => {
                let mut components = vec![Component::Polyline2d(Polyline2d {
                    points: points_mm.iter().map(|p| (*p).into()).collect(),
                    closed: *closed,
                })];
                if let Some(l) = layer {
                    components.push(Component::LayerRef(layer_ref(*l)?));
                }
                vec![Op::CreateEntity { components }]
            }

            Command::SetEntityLayer { entity, layer } => vec![Op::SetComponent {
                id: entity_ref(*entity)?,
                component: Component::LayerRef(layer_ref(*layer)?),
            }],

            Command::SetLabel { entity, label } => vec![Op::SetComponent {
                id: entity_ref(*entity)?,
                component: Component::Label(label.clone()),
            }],

            Command::DeleteEntity { entity } => vec![Op::DeleteEntity {
                id: entity_ref(*entity)?,
            }],
        })
    }
}
