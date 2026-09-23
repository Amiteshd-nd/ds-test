//! Parameters in, commits out.
//!
//! [`plan`] is pure: it computes everything and touches nothing. [`apply`] takes that
//! plan and submits it through the sequencer. Between the two sits the approval gate
//! invariant **I7** asks for — a caller can show the summary, the room schedule and the
//! assumption list to an architect before a single op lands.

use crate::library::SelectError;
use crate::options::{candidates, Candidate};

use tri_commit::{Author, Commit, CommitError, Sequencer};
use tri_doc::component::{Component, Opening, OpeningKind, WallProfile};
use tri_doc::layer::Layer;
use tri_doc::{EntityId, Length, Op, Point2, Provenance, Tracked};
use tri_params::ParameterSet;

/// Re-exported so callers do not need `tri_rules` just to name the component. The
/// definition lives in `rules` because the rule engine is what interprets a room; a
/// generator that owned it could rename a field and silently stop being checked.
pub use tri_rules::ROOM_TYPE_NAME;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RoomKind {
    Living,
    Kitchen,
    Bedroom,
    Toilet,
}

#[derive(Debug, thiserror::Error)]
pub enum GenError {
    #[error(
        "the brief has not been checked against a ruleset, so the setbacks are unknown. \
         Run rules::derive_parameters first — laying out against a zero setback is not a \
         conservative plan, it is a wrong one."
    )]
    NotDerived,
    #[error(transparent)]
    Select(#[from] SelectError),
    #[error("generation produced no walls")]
    Empty,
    #[error(transparent)]
    Rejected(#[from] CommitError),
}

/// Everything generation intends to do, before any of it happens.
#[derive(Clone, Debug)]
pub struct GenerationPlan {
    pub template_id: &'static str,
    /// Identifies the option this plan came from: the template id, plus the variant when
    /// there is one. Stable for a given brief, so a UI can key a thumbnail on it.
    pub option_key: String,
    /// "3BHK with a side corridor — larger bedrooms".
    pub option_label: String,
    /// A sentence for the approval card.
    pub summary: String,
    /// Layers, then geometry. Two commits, so the layer ids are known before anything
    /// references them.
    pub layer_ops: Vec<Op>,
    pub geometry_ops: Vec<Op>,
    /// Room name, kind and area in mm², for the schedule shown beside the plan.
    pub rooms: Vec<(String, String, i64)>,
    /// Every value this plan assumed, so a reviewer sees the guesses before approving.
    pub assumptions: Vec<(String, String)>,
    pub footprint_mm2: i64,
}

impl GenerationPlan {
    pub fn wall_count(&self) -> usize {
        self.geometry_ops
            .iter()
            .filter(|o| {
                matches!(o, Op::CreateEntity { components }
                    if components.iter().any(|c| matches!(c, Component::WallProfile(_))))
            })
            .count()
    }

    pub fn opening_count(&self) -> usize {
        self.geometry_ops
            .iter()
            .filter(|o| {
                matches!(o, Op::CreateEntity { components }
                    if components.iter().any(|c| matches!(c, Component::Opening(_))))
            })
            .count()
    }

    /// The approval text. Names the assumptions rather than burying them, because the
    /// architect is being asked to accept those, not the walls.
    pub fn approval_summary(&self) -> String {
        let mut s = format!(
            "{} — {} walls, {} openings, {} rooms, {:.1} m² footprint\n",
            self.summary,
            self.wall_count(),
            self.opening_count(),
            self.rooms.len(),
            self.footprint_mm2 as f64 / 1_000_000.0,
        );
        if !self.assumptions.is_empty() {
            s.push_str(&format!(
                "{} value(s) assumed by the template:\n",
                self.assumptions.len()
            ));
            for (field, why) in self.assumptions.iter().take(6) {
                s.push_str(&format!("  {field}: {why}\n"));
            }
        }
        s
    }
}

/// Work out the whole plan. Pure — no document, no mutation, no commits.
pub fn plan(p: &ParameterSet, rules: &tri_rules::RuleSet) -> Result<GenerationPlan, GenError> {
    if !p.is_derived() {
        return Err(GenError::NotDerived);
    }
    let best = candidates(p, rules)?
        .into_iter()
        .next()
        .ok_or(GenError::Empty)?;
    plan_for(&best, p)
}

/// Work out the plan for one specific option.
///
/// The same function `plan` uses, called once per option when a generation produces
/// several. Every option therefore goes through identical code — there is no "the real
/// one" and "the alternatives", which is what makes switching between them lossless.
pub fn plan_for(c: &Candidate, p: &ParameterSet) -> Result<GenerationPlan, GenError> {
    if !p.is_derived() {
        return Err(GenError::NotDerived);
    }
    // The layout is already solved. The template read the ruleset directly while doing
    // it: hard rules constrain the generator, and a template that lays out first and
    // checks afterwards produces plans that are two centimetres short of legal.
    let (template, t) = (c.template, &c.layout);
    if t.walls.is_empty() {
        return Err(GenError::Empty);
    }

    // Layers first, in their own commit, so the geometry can reference real ids.
    let layer = |name: &str, color: [u8; 4]| Op::CreateLayer {
        layer: Layer {
            name: name.to_string(),
            parent: None,
            visible: true,
            color,
        },
    };
    let layer_ops = vec![
        layer("A-WALL", [220, 220, 225, 255]),
        layer("A-DOOR", [120, 200, 140, 255]),
        layer("A-AREA", [150, 160, 180, 255]),
        Op::RegisterType {
            def: tri_rules::room::type_definition(),
        },
        Op::RegisterType {
            def: tri_params::component::type_definition(),
        },
        // The brief travels with the plan it produced.
        //
        // Without this the document is geometry with no account of where it came from:
        // the compliance panel would find no parameter set and report a clean bill of
        // health on a plan it had never checked, and "the same parameters produce the
        // same plan" would be unverifiable from the document alone.
        Op::CreateEntity {
            components: vec![tri_params::component::to_component(p)],
        },
    ];
    // Ids are minted in order from 1, and this is the first commit on a fresh document.
    let (wall_layer, door_layer, area_layer) = (
        tri_doc::LayerId::from_raw(1),
        tri_doc::LayerId::from_raw(2),
        tri_doc::LayerId::from_raw(3),
    );

    let mut geometry_ops = Vec::new();
    let mut assumptions: Vec<(String, String)> = Vec::new();

    // --- walls ---------------------------------------------------------------
    // Thickness and height come from the parameter set, so they keep whatever provenance
    // the architect or the ruleset gave them. The template does not re-decide them.
    for w in &t.walls {
        let thickness = if w.external {
            p.external_wall.clone()
        } else {
            p.internal_wall.clone()
        };
        let height = p.floor_to_floor.clone();
        let base = Tracked::assumed(
            Length::ZERO,
            "ground floor; the template places the slab at level 0",
        );

        for (field, tracked) in [
            ("wall.thickness", thickness.provenance()),
            ("wall.height", height.provenance()),
        ] {
            if tracked == Provenance::Assumed {
                let reason = if field == "wall.thickness" {
                    thickness.reason()
                } else {
                    height.reason()
                };
                let entry = (field.to_string(), reason.to_string());
                if !assumptions.contains(&entry) {
                    assumptions.push(entry);
                }
            }
        }

        geometry_ops.push(Op::CreateEntity {
            components: vec![
                Component::WallProfile(WallProfile {
                    centreline: vec![w.a, w.b],
                    thickness,
                    height,
                    base_elevation: base,
                }),
                Component::LayerRef(wall_layer),
                Component::Provenance {
                    provenance: Provenance::Inferred,
                    reason: format!("{} (template {})", w.reason, template.id),
                },
            ],
        });
    }
    // Entity ids are minted in commit order. The parameter set is created in the first
    // commit, so the walls in the second start at 2.
    const PARAMETER_ENTITIES: u64 = 1;
    let wall_entities: Vec<EntityId> = (0..t.walls.len())
        .map(|i| EntityId::from_raw(i as u64 + 1 + PARAMETER_ENTITIES))
        .collect();

    // --- the main door -------------------------------------------------------
    // Hosted on the front wall, which is wall 0 by construction.
    let door = p.main_door.get();
    geometry_ops.push(Op::CreateEntity {
        components: vec![
            Component::Opening(Opening {
                host: wall_entities[0],
                kind: OpeningKind::Door,
                position: t.entry_offset,
                width: Tracked::assumed(
                    door.width,
                    format!(
                        "main door width from the door schedule ({}mm default)",
                        door.width.as_mm_f64() as i64
                    ),
                ),
                height: Tracked::assumed(
                    door.height,
                    format!(
                        "main door height from the door schedule ({}mm default)",
                        door.height.as_mm_f64() as i64
                    ),
                ),
                sill: Tracked::measured(Length::ZERO, "a door meets the floor by definition"),
            }),
            Component::LayerRef(door_layer),
        ],
    });
    assumptions.push((
        "main_door".to_string(),
        format!(
            "{}x{}mm from the default door schedule",
            door.width.as_mm_f64() as i64,
            door.height.as_mm_f64() as i64
        ),
    ));

    // --- rooms ---------------------------------------------------------------
    let mut rooms = Vec::new();
    for cell in &t.cells {
        let area = cell.area_mm2();
        rooms.push((cell.name.to_string(), cell.kind.to_string(), area));

        let why = format!(
            "laid out by template {} from the buildable envelope; not a stated requirement",
            template.id
        );
        geometry_ops.push(Op::CreateEntity {
            components: vec![
                Component::Custom {
                    type_name: ROOM_TYPE_NAME.to_string(),
                    data: tri_rules::room::to_data(
                        cell.name,
                        cell.kind,
                        area,
                        cell.width(),
                        cell.depth(),
                        &why,
                    ),
                },
                // The outline, so the room is visible in plan and pickable.
                Component::Polyline2d(tri_doc::component::Polyline2d {
                    points: rect(cell.min, cell.max),
                    closed: true,
                }),
                Component::Label(cell.name.to_string()),
                Component::LayerRef(area_layer),
            ],
        });
    }

    Ok(GenerationPlan {
        template_id: template.id,
        option_key: c.key.clone(),
        option_label: c.label.clone(),
        summary: format!(
            "{} on a {:.1} x {:.1} m plot, {} floor(s)",
            template.label,
            p.plot_width.get().as_mm_f64() / 1000.0,
            p.plot_depth.get().as_mm_f64() / 1000.0,
            p.floors.get()
        ),
        layer_ops,
        geometry_ops,
        rooms,
        assumptions,
        footprint_mm2: t.footprint_mm2(),
    })
}

fn rect(min: Point2, max: Point2) -> Vec<Point2> {
    vec![
        min,
        Point2::new(max.x, min.y),
        max,
        Point2::new(min.x, max.y),
    ]
}

/// Apply an approved plan.
///
/// Three commits: layers, geometry, solids. Every one goes through the sequencer and so
/// through `commit::validate` — there is no `&mut Document` anywhere in this crate, which
/// is what makes I1 structural here rather than remembered.
pub fn apply(
    seq: &mut Sequencer,
    plan: &GenerationPlan,
    author: Author,
) -> Result<Vec<tri_commit::CommitId>, GenError> {
    let mut ids = Vec::new();

    let mut submit = |seq: &mut Sequencer, ops: Vec<Op>, msg: String| -> Result<(), GenError> {
        if ops.is_empty() {
            return Ok(());
        }
        let c = Commit::new(seq.head(), author.clone(), ops, msg);
        ids.push(seq.submit(c)?.id());
        Ok(())
    };

    submit(
        seq,
        plan.layer_ops.clone(),
        format!("generate {}: layers", plan.template_id),
    )?;
    submit(
        seq,
        plan.geometry_ops.clone(),
        format!(
            "generate {}: {} walls, {} openings, {} rooms",
            plan.template_id,
            plan.wall_count(),
            plan.opening_count(),
            plan.rooms.len()
        ),
    )?;

    // Stages 4-7, used verbatim. `Preparation::Clean` skips heal and pair: this geometry
    // was generated, not drawn, so there is nothing to repair and nothing to infer.
    let (solid_ops, _report) = tri_solid::pipeline::build_solids(
        seq.document(),
        tri_solid::pipeline::BuildParams::clean(),
    );
    submit(
        seq,
        solid_ops,
        format!("generate {}: extrude", plan.template_id),
    )?;

    Ok(ids)
}
