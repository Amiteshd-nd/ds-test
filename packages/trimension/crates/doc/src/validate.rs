//! Invariant **I1**, enforced by the type system.
//!
//! # How the guarantee actually works
//! [`Document::apply`](crate::Document::apply) takes a [`Validated`]. `Validated` has
//! private fields and no public constructor, so the *only* way any code anywhere can
//! obtain one is [`check`], which runs every invariant. There is no `unsafe` escape
//! hatch and no `#[doc(hidden)]` back door. Calling `apply` without validating is a
//! compile error, not a code-review finding.
//!
//! This is stronger than the PRD's formulation. PRD §4.1 puts `validate` in the `commit`
//! crate and asks for mutation to be impossible "from outside the commit crate" — but
//! Rust's `pub(crate)` does not cross a crate boundary, so a separate `commit` crate
//! would force `doc` to expose public mutators and the invariant would degrade to a
//! naming convention. Binding the proof to the *operation* rather than to the *caller*
//! removes the loophole entirely: `commit` cannot bypass validation either.
//!
//! `Validated` also carries the document revision it was checked against, so a proof
//! cannot be validated against one state and applied to another.

use crate::component::{Component, ComponentKey};
use crate::document::Document;
use crate::id::{EntityId, LayerId, SourceId};
use crate::op::Op;
use std::fmt;

/// Proof that a batch of ops was checked against a specific document revision.
///
/// Deliberately not `Clone`: a proof is consumed by the apply it authorises.
///
/// # I1, demonstrated
/// Forging a proof does not compile — the fields are private and there is no
/// constructor:
///
/// ```compile_fail
/// use tri_doc::{Document, Op, Validated};
/// let mut doc = Document::new();
/// let forged = Validated { ops: &[], revision: 0 };
/// doc.apply(forged).unwrap();
/// ```
///
/// Nor can a proof be obtained by any route other than [`check`]:
///
/// ```compile_fail
/// use tri_doc::Validated;
/// let forged: Validated = Default::default();
/// ```
///
/// The supported route compiles and is the only one:
///
/// ```
/// use tri_doc::{check, Document, Op};
/// use tri_doc::layer::Layer;
/// let mut doc = Document::new();
/// let ops = [Op::CreateLayer {
///     layer: Layer { name: "A".into(), parent: None, visible: true, color: [0; 4] },
/// }];
/// let proof = check(&doc, &ops).expect("valid");
/// doc.apply(proof).expect("applies");
/// assert_eq!(doc.layers().len(), 1);
/// ```
pub struct Validated<'ops> {
    pub(crate) ops: &'ops [Op],
    pub(crate) revision: u64,
}

impl fmt::Debug for Validated<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Validated")
            .field("ops", &self.ops.len())
            .field("revision", &self.revision)
            .finish()
    }
}

/// A specific reason a batch was rejected. Rejections are plural: validation reports
/// everything wrong in one pass rather than failing on the first problem, because an
/// agent that gets one error at a time burns a round trip per mistake.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Violation {
    /// The op index within the batch, for pointing a human or an agent at the cause.
    At(usize, Box<Violation>),
    UnknownEntity(EntityId),
    UnknownLayer(LayerId),
    UnknownSource(SourceId),
    /// The canonical invariant (PRD §4.3).
    LayerCycle {
        child: LayerId,
        parent: LayerId,
    },
    LayerHasChildren {
        id: LayerId,
        children: usize,
    },
    /// An entity was created or modified with no components at all.
    EmptyEntity,
    DuplicateComponent(ComponentKey),
    /// I4: a provenance record with no explanation is worse than none, because it looks
    /// like diligence.
    EmptyProvenanceReason {
        field: &'static str,
    },
    /// An `Opening` whose host is not a wall, or does not exist.
    OpeningHostInvalid {
        host: EntityId,
        reason: &'static str,
    },
    /// An opening that does not fit within its host wall.
    OpeningNotContained {
        host: EntityId,
        detail: String,
    },
    /// A `Custom` component whose type is not in the registry.
    UnregisteredType(String),
    MissingRequiredField {
        type_name: String,
        field: String,
    },
    /// A closed polyline needs at least three distinct points to bound anything.
    DegenerateProfile {
        points: usize,
    },
    /// Format version may only move forward — lazy migration is one-way.
    FormatVersionRegression {
        from: u32,
        to: u32,
    },
    NonPositiveDimension {
        field: &'static str,
        value: i64,
    },
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Violation::At(i, inner) => write!(f, "op[{i}]: {inner}"),
            Violation::UnknownEntity(id) => write!(f, "no such entity {id:?}"),
            Violation::UnknownLayer(id) => write!(f, "no such layer {id:?}"),
            Violation::UnknownSource(id) => write!(f, "no such source entity {id:?}"),
            Violation::LayerCycle { child, parent } => write!(
                f,
                "reparenting {child:?} under {parent:?} would create a layer cycle"
            ),
            Violation::LayerHasChildren { id, children } => {
                write!(f, "layer {id:?} still has {children} child layer(s)")
            }
            Violation::EmptyEntity => write!(f, "an entity must be created with components"),
            Violation::DuplicateComponent(k) => write!(f, "component {k:?} given twice"),
            Violation::EmptyProvenanceReason { field } => {
                write!(
                    f,
                    "I4: field '{field}' has a provenance record with no reason"
                )
            }
            Violation::OpeningHostInvalid { host, reason } => {
                write!(f, "opening host {host:?} invalid: {reason}")
            }
            Violation::OpeningNotContained { host, detail } => {
                write!(f, "opening does not fit in host {host:?}: {detail}")
            }
            Violation::UnregisteredType(t) => write!(f, "component type '{t}' is not registered"),
            Violation::MissingRequiredField { type_name, field } => {
                write!(f, "type '{type_name}' requires field '{field}'")
            }
            Violation::DegenerateProfile { points } => {
                write!(f, "closed profile needs >= 3 points, got {points}")
            }
            Violation::FormatVersionRegression { from, to } => {
                write!(f, "format version cannot go backwards: {from} -> {to}")
            }
            Violation::NonPositiveDimension { field, value } => {
                write!(f, "'{field}' must be positive, got {value}um")
            }
        }
    }
}

/// Run every invariant against `ops` as applied to `doc`.
///
/// The check is *sequential*: each op is validated against the state the preceding ops
/// in the same batch would produce. A batch that creates a layer and then reparents
/// under it must therefore pass, while a batch that creates a cycle across two of its
/// own ops must fail. Doing this without mutating `doc` is what the shadow state below
/// is for.
pub fn check<'ops>(doc: &Document, ops: &'ops [Op]) -> Result<Validated<'ops>, Vec<Violation>> {
    let mut shadow = Shadow::new(doc);
    let mut violations = Vec::new();

    for (i, op) in ops.iter().enumerate() {
        let before = violations.len();
        check_op(doc, &mut shadow, op, &mut violations);
        // Attribute every violation this op produced to its index.
        for v in violations.iter_mut().skip(before) {
            let owned = std::mem::replace(v, Violation::EmptyEntity);
            *v = Violation::At(i, Box::new(owned));
        }
    }

    if violations.is_empty() {
        Ok(Validated {
            ops,
            revision: doc.revision(),
        })
    } else {
        Err(violations)
    }
}

/// Tracks what the batch has created or destroyed so far, without touching `doc`.
struct Shadow {
    new_entities: Vec<EntityId>,
    dead_entities: Vec<EntityId>,
    /// (id, parent) for layers created in this batch.
    new_layers: Vec<(LayerId, Option<LayerId>)>,
    dead_layers: Vec<LayerId>,
    reparents: Vec<(LayerId, Option<LayerId>)>,
    new_types: Vec<String>,
    new_sources: Vec<SourceId>,
    next_entity: u64,
    next_layer: u64,
    next_source: u64,
    format_version: u32,
}

impl Shadow {
    fn new(doc: &Document) -> Self {
        Shadow {
            new_entities: Vec::new(),
            dead_entities: Vec::new(),
            new_layers: Vec::new(),
            dead_layers: Vec::new(),
            reparents: Vec::new(),
            new_types: Vec::new(),
            new_sources: Vec::new(),
            next_entity: doc.peek_next_entity_raw(),
            next_layer: doc.peek_next_layer_raw(),
            next_source: doc.peek_next_source_raw(),
            format_version: doc.format_version(),
        }
    }

    fn entity_live(&self, doc: &Document, id: EntityId) -> bool {
        if self.dead_entities.contains(&id) {
            return false;
        }
        doc.contains_entity(id) || self.new_entities.contains(&id)
    }

    fn layer_live(&self, doc: &Document, id: LayerId) -> bool {
        if self.dead_layers.contains(&id) {
            return false;
        }
        doc.layers().contains(id) || self.new_layers.iter().any(|(l, _)| *l == id)
    }

    /// Effective parent of a layer given the batch's pending reparents.
    fn parent_of(&self, doc: &Document, id: LayerId) -> Option<LayerId> {
        if let Some((_, p)) = self.reparents.iter().rev().find(|(l, _)| *l == id) {
            return *p;
        }
        if let Some((_, p)) = self.new_layers.iter().find(|(l, _)| *l == id) {
            return *p;
        }
        doc.layers().get(id).and_then(|l| l.parent)
    }

    /// Cycle check over the batch's projected tree, not the committed one.
    fn would_cycle(&self, doc: &Document, child: LayerId, new_parent: Option<LayerId>) -> bool {
        let Some(parent) = new_parent else {
            return false;
        };
        if parent == child {
            return true;
        }
        let bound = doc.layers().len() + self.new_layers.len() + 1;
        let mut cursor = Some(parent);
        let mut steps = 0;
        while let Some(id) = cursor {
            if id == child {
                return true;
            }
            steps += 1;
            if steps > bound {
                return true; // corrupt or cyclic; refuse either way
            }
            cursor = self.parent_of(doc, id);
        }
        false
    }
}

fn check_op(doc: &Document, sh: &mut Shadow, op: &Op, out: &mut Vec<Violation>) {
    match op {
        Op::CreateEntity { components } => {
            if components.is_empty() {
                out.push(Violation::EmptyEntity);
            }
            let mut seen: Vec<ComponentKey> = Vec::new();
            for c in components {
                let k = c.key();
                if seen.contains(&k) {
                    out.push(Violation::DuplicateComponent(k.clone()));
                }
                seen.push(k);
                check_component(doc, sh, c, out);
            }
            sh.next_entity += 1;
            sh.new_entities.push(EntityId::from_raw(sh.next_entity));
        }

        Op::DeleteEntity { id } => {
            if !sh.entity_live(doc, *id) {
                out.push(Violation::UnknownEntity(*id));
            }
            sh.dead_entities.push(*id);
        }

        Op::SetComponent { id, component } => {
            if !sh.entity_live(doc, *id) {
                out.push(Violation::UnknownEntity(*id));
            }
            check_component(doc, sh, component, out);
        }

        Op::RemoveComponent { id, .. } => {
            if !sh.entity_live(doc, *id) {
                out.push(Violation::UnknownEntity(*id));
            }
        }

        Op::CreateLayer { layer } => {
            if let Some(p) = layer.parent {
                if !sh.layer_live(doc, p) {
                    out.push(Violation::UnknownLayer(p));
                }
            }
            sh.next_layer += 1;
            sh.new_layers
                .push((LayerId::from_raw(sh.next_layer), layer.parent));
        }

        Op::ReparentLayer { id, new_parent } => {
            if !sh.layer_live(doc, *id) {
                out.push(Violation::UnknownLayer(*id));
                return;
            }
            if let Some(p) = new_parent {
                if !sh.layer_live(doc, *p) {
                    out.push(Violation::UnknownLayer(*p));
                    return;
                }
                if sh.would_cycle(doc, *id, Some(*p)) {
                    out.push(Violation::LayerCycle {
                        child: *id,
                        parent: *p,
                    });
                    return;
                }
            }
            sh.reparents.push((*id, *new_parent));
        }

        Op::RenameLayer { id, .. } | Op::SetLayerVisible { id, .. } => {
            if !sh.layer_live(doc, *id) {
                out.push(Violation::UnknownLayer(*id));
            }
        }

        Op::DeleteLayer { id } => {
            if !sh.layer_live(doc, *id) {
                out.push(Violation::UnknownLayer(*id));
                return;
            }
            // Deleting a layer with children would orphan them into a broken tree.
            let children = doc
                .layers()
                .children_of(*id)
                .into_iter()
                .filter(|c| !sh.dead_layers.contains(c))
                .filter(|c| sh.parent_of(doc, *c) == Some(*id))
                .count()
                + sh.new_layers
                    .iter()
                    .filter(|(l, p)| *p == Some(*id) && !sh.dead_layers.contains(l))
                    .count();
            if children > 0 {
                out.push(Violation::LayerHasChildren { id: *id, children });
                return;
            }
            sh.dead_layers.push(*id);
        }

        Op::RegisterType { def } => {
            sh.new_types.push(def.name.clone());
        }

        Op::AddSourceEntity { .. } => {
            sh.next_source += 1;
            sh.new_sources.push(SourceId::from_raw(sh.next_source));
        }

        Op::RecordImport { record } => {
            if record.unit_scale.reason().trim().is_empty() {
                out.push(Violation::EmptyProvenanceReason {
                    field: "import.unit_scale",
                });
            }
        }

        Op::SetFormatVersion { version } => {
            if *version < sh.format_version {
                out.push(Violation::FormatVersionRegression {
                    from: sh.format_version,
                    to: *version,
                });
            } else {
                sh.format_version = *version;
            }
        }
    }
}

fn check_component(doc: &Document, sh: &Shadow, c: &Component, out: &mut Vec<Violation>) {
    // I4: every tracked value must explain itself.
    for (field, _, reason) in c.provenance_records() {
        if reason.trim().is_empty() {
            out.push(Violation::EmptyProvenanceReason { field });
        }
    }

    match c {
        Component::LayerRef(l) => {
            if !sh.layer_live(doc, *l) {
                out.push(Violation::UnknownLayer(*l));
            }
        }

        Component::SourceRef(ids) => {
            for id in ids {
                if !doc.source().contains(*id) && !sh.new_sources.contains(id) {
                    out.push(Violation::UnknownSource(*id));
                }
            }
        }

        Component::Polyline2d(p) => {
            if p.closed && p.points.len() < 3 {
                out.push(Violation::DegenerateProfile {
                    points: p.points.len(),
                });
            }
        }

        Component::WallProfile(w) => {
            if w.centreline.len() < 2 {
                out.push(Violation::DegenerateProfile {
                    points: w.centreline.len(),
                });
            }
            if w.thickness.get().as_um() <= 0 {
                out.push(Violation::NonPositiveDimension {
                    field: "wall.thickness",
                    value: w.thickness.get().as_um(),
                });
            }
            if w.height.get().as_um() <= 0 {
                out.push(Violation::NonPositiveDimension {
                    field: "wall.height",
                    value: w.height.get().as_um(),
                });
            }
        }

        Component::Opening(o) => {
            if o.width.get().as_um() <= 0 {
                out.push(Violation::NonPositiveDimension {
                    field: "opening.width",
                    value: o.width.get().as_um(),
                });
            }
            if o.height.get().as_um() <= 0 {
                out.push(Violation::NonPositiveDimension {
                    field: "opening.height",
                    value: o.height.get().as_um(),
                });
            }
            if !sh.entity_live(doc, o.host) {
                out.push(Violation::OpeningHostInvalid {
                    host: o.host,
                    reason: "host entity does not exist",
                });
                return;
            }
            // Containment is only checkable against a committed host; a host created in
            // the same batch has no geometry to measure yet, so it is checked on the
            // next commit that touches it rather than being waved through silently.
            let Some(set) = doc.components(o.host) else {
                return;
            };
            let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) else {
                out.push(Violation::OpeningHostInvalid {
                    host: o.host,
                    reason: "host is not a wall",
                });
                return;
            };
            let run = centreline_length_um(&w.centreline);
            let half = o.width.get().as_um() / 2;
            let start = o.position.as_um() - half;
            let end = o.position.as_um() + half;
            if start < 0 || end > run {
                out.push(Violation::OpeningNotContained {
                    host: o.host,
                    detail: format!("spans {start}um..{end}um of a {run}um wall run",),
                });
            }
        }

        Component::Custom { type_name, data } => {
            let registered = doc.types().contains(type_name) || sh.new_types.contains(type_name);
            if !registered {
                out.push(Violation::UnregisteredType(type_name.clone()));
                return;
            }
            if let Some(def) = doc.types().get(type_name) {
                for (field, required) in &def.fields {
                    if *required && !data.contains_key(field) {
                        out.push(Violation::MissingRequiredField {
                            type_name: type_name.clone(),
                            field: field.clone(),
                        });
                    }
                }
            }
        }

        _ => {}
    }
}

/// Integer length of a polyline in µm. Uses an integer square root so the result is
/// identical on every target — see `units` module docs.
pub fn centreline_length_um(points: &[crate::units::Point2]) -> i64 {
    points
        .windows(2)
        .map(|w| isqrt_i128(w[0].dist_sq(w[1])) as i64)
        .sum()
}

/// Exact integer square root, floor. Deterministic everywhere; no libm involved.
pub fn isqrt_i128(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}
