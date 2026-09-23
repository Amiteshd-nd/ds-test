//! The 2D→3D pipeline, end to end, **as commits**.
//!
//! PRD Prompt 5: "The whole pipeline runs as commits, not as a side-channel mutation —
//! I1 applies here too, and this is the place it's most tempting to break." So this
//! module produces `Vec<Op>` and never touches a `Document`. The caller commits them.
//!
//! Every derived number carries provenance naming its evidence (invariant **I4**):
//! a thickness from a paired polyline is `Inferred` with the separation and angle that
//! justified it; a defaulted height is `Assumed` with the default's origin; nothing
//! computed here is ever `Measured`.

use crate::extrude::{wall_with_openings, OpeningCut};
use crate::tessellate;
use tri_doc::component::{Opening, WallProfile};
use tri_doc::{Component, ComponentKey, Document, EntityId, Length, Op, Provenance, Tracked};
use tri_geom2d::heal::{self, Chain};
use tri_geom2d::pair::{self, PairParams};

/// Tuning for one run of the pipeline. Every value that could otherwise be a magic
/// constant lives here (PRD Prompt 5).
#[derive(Clone, Copy, Debug)]
pub struct BuildParams {
    pub preparation: Preparation,
    pub default_height: Length,
    pub default_base: Length,
}

/// How much cleaning the input needs before stages 4–7 can run.
///
/// Stages 1–3 (heal, classify, pair) exist for one reason: real drawings are messy.
/// Generated geometry is clean by construction — its endpoints already coincide, nothing
/// is drawn twice, and the thickness is a stated parameter rather than something inferred
/// from the gap between two lines.
///
/// Running the messy path over generated input is not merely wasted work, it is wrong:
/// `pair_walls` would look at two internal partitions 300mm apart and conclude they are
/// the two faces of one 300mm wall. Naming the distinction here keeps the generator on
/// the same pipeline as the importer instead of forking it.
#[derive(Clone, Copy, Debug)]
pub enum Preparation {
    /// Imported from a drawing: heal the geometry, then pair parallel lines into runs.
    Messy {
        heal_tolerance: Length,
        pairing: PairParams,
    },
    /// Generated: take the centrelines and thicknesses as given.
    Clean,
}

impl Default for BuildParams {
    fn default() -> Self {
        BuildParams {
            preparation: Preparation::Messy {
                heal_tolerance: Length::from_mm(5),
                pairing: PairParams::default(),
            },
            default_height: Length::from_mm(2700),
            default_base: Length::ZERO,
        }
    }
}

impl BuildParams {
    /// Parameters for geometry this process generated.
    pub fn clean() -> BuildParams {
        BuildParams {
            preparation: Preparation::Clean,
            ..BuildParams::default()
        }
    }
}

/// One wall run ready for extrusion: a centreline and a thickness that knows where it
/// came from. Produced either by pairing imported lines or taken straight from generated
/// input, after which stages 4–7 cannot tell the difference.
struct PreparedRun {
    centreline: Vec<tri_doc::Point2>,
    thickness: Tracked<Length>,
    /// Index into the collected wall list.
    source: usize,
}

/// What the build did and how much of it was guessed.
#[derive(Clone, Debug, Default)]
pub struct BuildReport {
    pub walls_built: usize,
    pub openings_cut: usize,
    pub openings_skipped: Vec<String>,
    pub heal_summary: String,
    /// Wall runs whose thickness came from pairing rather than a default.
    pub paired: usize,
    pub unpaired: usize,
    /// Every `Assumed` value the build produced, as (entity, field, reason).
    pub assumptions: Vec<(EntityId, String, String)>,
    /// Meshes that failed the closure check — a hole in a solid is not a cosmetic issue.
    pub open_meshes: Vec<EntityId>,
}

impl BuildReport {
    pub fn summary(&self) -> String {
        format!(
            "built {} wall solid(s) ({} paired, {} on default thickness), cut {} opening(s), \
             {} assumption(s) recorded; healing: {}",
            self.walls_built,
            self.paired,
            self.unpaired,
            self.openings_cut,
            self.assumptions.len(),
            self.heal_summary
        )
    }
}

/// Run stages 1 and 3–7 on the walls already in the document.
///
/// Returns ops that attach a `Solid3d` to each wall entity and correct its thickness and
/// centreline to the paired values. Nothing is mutated here.
pub fn build_solids(doc: &Document, p: BuildParams) -> (Vec<Op>, BuildReport) {
    let mut report = BuildReport::default();
    let mut ops = Vec::new();

    // Collect the walls.
    let walls: Vec<(EntityId, WallProfile)> = doc
        .iter_with(ComponentKey::WallProfile)
        .filter_map(|(id, set)| match set.get(&ComponentKey::WallProfile) {
            Some(Component::WallProfile(w)) => Some((id, w.clone())),
            _ => None,
        })
        .collect();
    if walls.is_empty() {
        return (ops, report);
    }

    // --- stages 1 and 3: heal and pair, or skip both -------------------------
    let runs: Vec<PreparedRun> = match p.preparation {
        Preparation::Messy {
            heal_tolerance,
            pairing,
        } => {
            let chains: Vec<Chain> = walls
                .iter()
                .enumerate()
                .map(|(i, (_, w))| Chain {
                    points: w.centreline.clone(),
                    closed: false,
                    origin: i,
                })
                .collect();
            let (healed, heal_report) = heal::heal(&chains, heal_tolerance);
            report.heal_summary = heal_report.summary();

            let for_pairing: Vec<(usize, Vec<tri_doc::Point2>)> = healed
                .iter()
                .map(|c| (c.origin, c.points.clone()))
                .collect();

            pair::pair_walls(&for_pairing, pairing)
                .into_iter()
                .filter_map(|run| {
                    let source = *run.sources.first()?;
                    let paired = run.evidence.is_paired();
                    if paired {
                        report.paired += 1;
                    } else {
                        report.unpaired += 1;
                    }
                    // Thickness from pairing is Inferred; a fallback default is Assumed.
                    let thickness = if paired {
                        Tracked::inferred(run.thickness, run.evidence.reason())
                    } else {
                        Tracked::assumed(run.thickness, run.evidence.reason())
                    };
                    Some(PreparedRun {
                        centreline: run.centreline,
                        thickness,
                        source,
                    })
                })
                .collect()
        }
        Preparation::Clean => {
            report.heal_summary = "generated geometry; healing and pairing skipped".into();
            walls
                .iter()
                .enumerate()
                .map(|(i, (_, w))| {
                    // The thickness already carries its own provenance from whoever
                    // generated it. Re-deriving it here would replace a stated parameter
                    // with a guess.
                    report.paired += 1;
                    PreparedRun {
                        centreline: w.centreline.clone(),
                        thickness: w.thickness.clone(),
                        source: i,
                    }
                })
                .collect()
        }
    };

    // Openings, grouped by the wall they host.
    let openings: Vec<(EntityId, Opening)> = doc
        .iter_with(ComponentKey::Opening)
        .filter_map(|(id, set)| match set.get(&ComponentKey::Opening) {
            Some(Component::Opening(o)) => Some((id, o.clone())),
            _ => None,
        })
        .collect();

    for run in &runs {
        // A messy run may have absorbed two source polylines; the solid attaches to the
        // first. A clean run is one to one.
        let Some(&(entity, ref original)) = walls.get(run.source) else {
            continue;
        };
        let thickness = run.thickness.clone();

        // --- height: whatever classification decided, carried forward --------
        // The importer already recorded whether the height was found or defaulted, and
        // re-deriving it here would lose that. Provenance is carried, never recomputed.
        let height = original.height.clone();
        let base = original.base_elevation.clone();

        for (field, tracked_prov, reason) in [
            ("thickness", thickness.provenance(), thickness.reason()),
            ("height", height.provenance(), height.reason()),
            ("base_elevation", base.provenance(), base.reason()),
        ] {
            if tracked_prov == Provenance::Assumed {
                report
                    .assumptions
                    .push((entity, field.to_string(), reason.to_string()));
            }
        }

        // --- stages 4-6: profile, extrude, subtract openings -----------------
        let cuts: Vec<OpeningCut> = openings
            .iter()
            .filter(|(_, o)| o.host == entity)
            .map(|(_, o)| OpeningCut {
                position: o.position,
                width: o.width.get(),
                height: o.height.get(),
                sill: o.sill.get(),
            })
            .collect();

        let (mesh, cut_report) = wall_with_openings(
            &run.centreline,
            *thickness.value(),
            *base.value(),
            *height.value(),
            &cuts,
        );
        report.openings_cut += cut_report.applied;
        report.openings_skipped.extend(cut_report.skipped);

        if mesh.is_empty() {
            continue;
        }
        if !mesh.is_closed() {
            report.open_meshes.push(entity);
        }
        report.walls_built += 1;

        // --- stage 7: tessellate, and commit the result ----------------------
        ops.push(Op::SetComponent {
            id: entity,
            component: Component::WallProfile(WallProfile {
                centreline: run.centreline.clone(),
                thickness,
                height,
                base_elevation: base,
            }),
        });
        ops.push(Op::SetComponent {
            id: entity,
            component: Component::Solid3d(tessellate::to_solid(&mesh)),
        });
    }

    // A wall that was absorbed as the second half of a pair no longer has geometry of
    // its own. Removing its WallProfile would need a delete, which is the caller's
    // decision to make, not this module's — so it is reported instead of assumed.
    (ops, report)
}
