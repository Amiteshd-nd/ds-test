//! Phase B: source entities → native objects.
//!
//! Every decision made here is recorded. A native object carries a `SourceRef` back to
//! the phase-A entities it came from and a `Provenance` naming the rule that fired
//! (invariant **I4**), and an entity that matched nothing is reported as `Unknown`
//! rather than dropped — the difference between a model you can review and a model that
//! merely looks complete.
//!
//! The whole of phase B emits ops. Nothing mutates a document directly; **I1** has no
//! import exemption and this is the module where breaking it would be most tempting.

use crate::importer::{EntityFacts, Geometry, SourceLoad};
use crate::rules::{Classification, GeometryKind, Match, Rule, RuleSet};
use std::collections::BTreeMap;
use tri_doc::component::{Opening, OpeningKind, Polyline2d, Transform, WallProfile};
use tri_doc::layer::Layer;
use tri_doc::{Component, EntityId, LayerId, Length, Op, Point2, Provenance, SourceId, Tracked};

/// What one source entity was decided to be, and why.
#[derive(Clone, PartialEq, Debug)]
pub struct Decision {
    pub source: SourceId,
    pub classification: Classification,
    /// `None` when nothing matched.
    pub rule_id: Option<String>,
    pub because: String,
    pub provenance: Provenance,
}

/// The output of phase B: ops to apply, plus a report a human can read.
#[derive(Clone, Debug, Default)]
pub struct Classified {
    pub ops: Vec<Op>,
    pub decisions: Vec<Decision>,
}

impl Classified {
    pub fn count(&self, c: Classification) -> usize {
        self.decisions
            .iter()
            .filter(|d| d.classification == c)
            .count()
    }

    /// Entities nothing could account for. A non-empty list is the honest answer to
    /// "did the import work", and is surfaced rather than logged and forgotten.
    pub fn unknown(&self) -> Vec<&Decision> {
        self.decisions
            .iter()
            .filter(|d| d.classification == Classification::Unknown)
            .collect()
    }

    /// Decisions a reviewer should look at: anything not `Inferred` from a strong rule.
    pub fn questionable(&self) -> Vec<&Decision> {
        self.decisions
            .iter()
            .filter(|d| d.provenance == Provenance::Assumed)
            .collect()
    }

    /// Compact, stable text for snapshot testing.
    pub fn snapshot(&self) -> String {
        let mut out = String::new();
        for d in &self.decisions {
            out.push_str(&format!(
                "{:?} {:?} rule={} prov={:?}\n",
                d.source,
                d.classification,
                d.rule_id.as_deref().unwrap_or("-"),
                d.provenance
            ));
        }
        out
    }
}

/// Evaluate one entity against one matcher.
fn matches(m: &Match, f: &EntityFacts) -> bool {
    match m {
        Match::Layer(t) => t.matches(&f.layer),
        Match::BlockName(t) => f.block_name.as_deref().is_some_and(|b| t.matches(b)),
        Match::LineType(t) => t.matches(&f.line_type),
        Match::LineWeightAtLeast { value } => f.line_weight >= *value,
        Match::Geometry { value, extra } => match value {
            GeometryKind::OpenTwoPoint => !f.closed && f.point_count == 2,
            GeometryKind::Closed => f.closed,
            GeometryKind::LongerThanMm => f.length_um >= extra * 1_000,
            GeometryKind::ShorterThanMm => f.length_um <= extra * 1_000,
            GeometryKind::IsBlockReference => f.is_block_reference,
            GeometryKind::IsText => f.is_text,
            GeometryKind::IsArcOrCurve => f.is_arc_or_curve,
        },
        Match::All { value } => value.iter().all(|m| matches(m, f)),
        Match::Any { value } => value.iter().any(|m| matches(m, f)),
        Match::Not { value } => !matches(value, f),
    }
}

/// Pick the highest-weight rule that matches. Ties break on rule id, so classification
/// is a pure function of (facts, rule set) and a snapshot test means something.
fn first_match<'r>(rules: &'r RuleSet, f: &EntityFacts) -> Option<&'r Rule> {
    rules.ordered().into_iter().find(|r| matches(&r.matcher, f))
}

/// Run phase B.
///
/// `source_ids` must be the ids minted by phase A, in the same order as `load.facts` —
/// the caller gets them from the `Minted` returned by applying the phase-A commit.
pub fn classify(
    load: &SourceLoad,
    source_ids: &[SourceId],
    layer_ids: &BTreeMap<String, LayerId>,
    rules: &RuleSet,
) -> Classified {
    let mut out = Classified::default();

    // Walls are created first so that openings, created second, can name their host.
    // Index of source position -> the wall entity it will become.
    let mut wall_slot: Vec<Option<usize>> = vec![None; load.facts.len()];
    let mut wall_ops = Vec::new();
    let mut opening_specs = Vec::new();
    let mut other_ops = Vec::new();

    for (i, facts) in load.facts.iter().enumerate() {
        let Some(&source) = source_ids.get(i) else {
            continue;
        };
        let geometry = load.geometry.get(i).unwrap_or(&Geometry::None);
        let rule = first_match(rules, facts);

        let (classification, rule_id, because, provenance) = match rule {
            Some(r) => (
                r.becomes,
                Some(r.id.clone()),
                r.because.clone(),
                r.confidence.provenance(),
            ),
            None => (
                Classification::Unknown,
                None,
                format!(
                    "no rule in '{}' matched layer '{}'{}",
                    rules.name,
                    facts.layer,
                    facts
                        .block_name
                        .as_deref()
                        .map(|b| format!(" / block '{b}'"))
                        .unwrap_or_default()
                ),
                Provenance::Assumed,
            ),
        };

        out.decisions.push(Decision {
            source,
            classification,
            rule_id: rule_id.clone(),
            because: because.clone(),
            provenance,
        });

        let layer_ref = layer_ids.get(&facts.layer).copied();
        let reason = format!(
            "{} (rule {})",
            because,
            rule_id.as_deref().unwrap_or("none")
        );

        match classification {
            Classification::Wall => {
                let points = geometry.points().to_vec();
                if points.len() < 2 {
                    continue;
                }
                wall_slot[i] = Some(wall_ops.len());
                wall_ops.push(Op::CreateEntity {
                    components: base_components(source, layer_ref, provenance, &reason)
                        .into_iter()
                        .chain([Component::WallProfile(WallProfile {
                            centreline: points,
                            // Real thickness comes from polyline pairing in M4. Until
                            // then this is explicitly a default, and says so.
                            thickness: if facts.constant_width_um > 0 {
                                // The file says how thick this wall is, so nothing needs
                                // inferring. Measured, because it was read from the
                                // drawing rather than worked out from it.
                                Tracked::measured(
                                    Length::from_um(facts.constant_width_um),
                                    format!(
                                        "polyline constant width of {:.0}mm stated in the \
                                         source file",
                                        facts.constant_width_um as f64 / 1000.0
                                    ),
                                )
                            } else {
                                Tracked::assumed(
                                    Length::from_mm(rules.default_wall_thickness_mm),
                                    format!(
                                        "no paired polyline found; rule set default \
                                         {}mm (RuleSet.default_wall_thickness_mm)",
                                        rules.default_wall_thickness_mm
                                    ),
                                )
                            },
                            height: Tracked::assumed(
                                Length::from_mm(rules.default_wall_height_mm),
                                format!(
                                    "no DIMENSION or height annotation found; rule set \
                                     default {}mm (RuleSet.default_wall_height_mm)",
                                    rules.default_wall_height_mm
                                ),
                            ),
                            base_elevation: Tracked::assumed(
                                Length::ZERO,
                                "drawing carries no level data; assumed floor at 0",
                            ),
                        })])
                        .collect(),
                });
            }

            Classification::Door | Classification::Window => {
                let kind = if classification == Classification::Door {
                    OpeningKind::Door
                } else {
                    OpeningKind::Window
                };
                if let Geometry::Insert { at, .. } = geometry {
                    opening_specs.push((source, layer_ref, kind, *at, reason, provenance));
                } else {
                    // A door drawn as loose geometry rather than a block. Recorded as a
                    // polyline so it is not lost, and left unhosted — guessing a host
                    // from a swing arc is exactly the kind of silent decision I4 exists
                    // to prevent.
                    other_ops.push(Op::CreateEntity {
                        components: base_components(
                            source,
                            layer_ref,
                            Provenance::Assumed,
                            &format!(
                                "{reason}; drawn as loose geometry rather than a block, so it \
                             could not be hosted to a wall"
                            ),
                        )
                        .into_iter()
                        .chain([Component::Polyline2d(Polyline2d {
                            points: geometry.points().to_vec(),
                            closed: false,
                        })])
                        .collect(),
                    });
                }
            }

            Classification::Annotation => {
                let label = match geometry {
                    Geometry::Text { value, .. } => value.clone(),
                    _ => String::new(),
                };
                other_ops.push(Op::CreateEntity {
                    components: base_components(source, layer_ref, provenance, &reason)
                        .into_iter()
                        .chain([Component::Label(label)])
                        .collect(),
                });
            }

            // Ignored and Unknown produce no native object. Both stay in the source
            // schema (I8) and both appear in the report, so neither is a silent loss.
            Classification::Ignored | Classification::Unknown => {}
        }
    }

    out.ops.extend(wall_ops.clone());

    // Openings need their host's EntityId, which is only known once the wall ops are
    // ordered. Wall N in this batch becomes entity `next_entity + N`.
    for (source, layer_ref, kind, at, reason, provenance) in opening_specs {
        let Some((host_index, position)) = nearest_wall(&wall_ops, at) else {
            // An opening with no wall anywhere near it. Kept as an annotation-free
            // record so the count still reconciles against the source file.
            out.decisions.push(Decision {
                source,
                classification: kind_to_classification(kind),
                rule_id: None,
                because: "no wall found to host this opening".into(),
                provenance: Provenance::Assumed,
            });
            continue;
        };
        opening_op(
            &mut other_ops,
            source,
            layer_ref,
            kind,
            host_index,
            position,
            &reason,
            provenance,
        );
    }

    out.ops.extend(other_ops);
    out
}

fn kind_to_classification(k: OpeningKind) -> Classification {
    match k {
        OpeningKind::Door => Classification::Door,
        OpeningKind::Window => Classification::Window,
        OpeningKind::Passage => Classification::Door,
    }
}

/// Components every native object gets: where it came from, and why it exists.
fn base_components(
    source: SourceId,
    layer: Option<LayerId>,
    provenance: Provenance,
    reason: &str,
) -> Vec<Component> {
    let mut v = vec![
        Component::SourceRef(vec![source]),
        Component::Provenance {
            provenance,
            reason: reason.to_string(),
        },
        Component::Transform(Transform::IDENTITY),
    ];
    if let Some(l) = layer {
        v.push(Component::LayerRef(l));
    }
    v
}

/// Which wall in this batch is closest to an insertion point, and how far along it.
/// Returns `None` if the nearest wall is further than 2m away, which is far enough that
/// pairing them would be a guess rather than a reading.
fn nearest_wall(wall_ops: &[Op], at: Point2) -> Option<(usize, Length)> {
    const MAX_HOST_DISTANCE_UM: i128 = 2_000_000;
    let mut best: Option<(usize, i128, i64)> = None;

    for (i, op) in wall_ops.iter().enumerate() {
        let Op::CreateEntity { components } = op else {
            continue;
        };
        let Some(Component::WallProfile(w)) = components
            .iter()
            .find(|c| matches!(c, Component::WallProfile(_)))
        else {
            continue;
        };

        let mut travelled = 0i64;
        for seg in w.centreline.windows(2) {
            let (d2, along) = point_to_segment(at, seg[0], seg[1]);
            if best.is_none_or(|(_, bd, _)| d2 < bd) {
                best = Some((i, d2, travelled + along));
            }
            travelled += tri_doc::validate::isqrt_i128(seg[0].dist_sq(seg[1])) as i64;
        }
    }

    match best {
        Some((i, d2, along)) if d2 <= MAX_HOST_DISTANCE_UM * MAX_HOST_DISTANCE_UM => {
            Some((i, Length::from_um(along)))
        }
        _ => None,
    }
}

/// Squared distance from `p` to segment `a`-`b`, and the distance along the segment to
/// the nearest point. Integer arithmetic throughout so the result is identical on every
/// target — see `tri_doc::units`.
fn point_to_segment(p: Point2, a: Point2, b: Point2) -> (i128, i64) {
    let (ax, ay) = (a.x.as_um() as i128, a.y.as_um() as i128);
    let (bx, by) = (b.x.as_um() as i128, b.y.as_um() as i128);
    let (px, py) = (p.x.as_um() as i128, p.y.as_um() as i128);

    let (dx, dy) = (bx - ax, by - ay);
    let len_sq = dx * dx + dy * dy;
    if len_sq == 0 {
        let (ex, ey) = (px - ax, py - ay);
        return (ex * ex + ey * ey, 0);
    }

    // Clamped projection parameter as a rational, kept in integers.
    let t_num = ((px - ax) * dx + (py - ay) * dy).clamp(0, len_sq);
    let cx = ax + t_num * dx / len_sq;
    let cy = ay + t_num * dy / len_sq;
    let (ex, ey) = (px - cx, py - cy);
    let along = tri_doc::validate::isqrt_i128((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay));
    (ex * ex + ey * ey, along as i64)
}

#[allow(clippy::too_many_arguments)]
fn opening_op(
    out: &mut Vec<Op>,
    source: SourceId,
    layer: Option<LayerId>,
    kind: OpeningKind,
    host_index: usize,
    position: Length,
    reason: &str,
    provenance: Provenance,
) {
    // Entity ids are minted in op order, and the wall ops come first in the batch, so
    // wall N is entity (base + N). The caller resolves `base`; here it is recorded
    // relative and fixed up by `resolve_hosts`.
    let host = EntityId::from_raw(host_index as u64);
    let (width_mm, height_mm, sill_mm) = match kind {
        OpeningKind::Door => (900, 2100, 0),
        OpeningKind::Window => (1200, 1500, 900),
        OpeningKind::Passage => (900, 2100, 0),
    };
    out.push(Op::CreateEntity {
        components: base_components(source, layer, provenance, reason)
            .into_iter()
            .chain([Component::Opening(Opening {
                host,
                kind,
                position,
                width: Tracked::assumed(
                    Length::from_mm(width_mm),
                    format!(
                        "block carries no width attribute; typical {} width {width_mm}mm",
                        match kind {
                            OpeningKind::Window => "window",
                            _ => "door",
                        }
                    ),
                ),
                height: Tracked::assumed(
                    Length::from_mm(height_mm),
                    "block carries no height attribute; typical opening height",
                ),
                sill: Tracked::assumed(
                    Length::from_mm(sill_mm),
                    match kind {
                        OpeningKind::Window => "no sill dimension in drawing; typical 900mm",
                        _ => "door: sill at floor level",
                    },
                ),
            })])
            .collect(),
    });
}

/// Rewrite placeholder host ids into real ones once the wall entities exist.
///
/// Phase B builds openings before it knows the wall ids, so hosts are stored as indices
/// and fixed up here. Doing it as a rewrite of pending *ops* rather than as a mutation
/// after the fact is what keeps this inside I1.
pub fn resolve_hosts(ops: &mut [Op], wall_entities: &[EntityId]) {
    for op in ops.iter_mut() {
        if let Op::CreateEntity { components } = op {
            for c in components.iter_mut() {
                if let Component::Opening(o) = c {
                    if let Some(real) = wall_entities.get(o.host.raw() as usize) {
                        o.host = *real;
                    }
                }
            }
        }
    }
}

/// Layer ops for every layer in the source file, so `LayerRef` has something to point at.
pub fn layer_ops(load: &SourceLoad) -> Vec<Op> {
    load.layers
        .iter()
        .map(|l| Op::CreateLayer {
            layer: Layer {
                name: l.name.clone(),
                parent: None,
                visible: l.visible,
                color: l.color,
            },
        })
        .collect()
}
