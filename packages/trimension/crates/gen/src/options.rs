//! Three or four options per generation, ranked.
//!
//! The PRD is specific about why this exists: "Options, not an answer. Three or four
//! layouts as selectable thumbnails along the canvas edge. This matches how architects
//! actually think, and it lowers the cost of any single bad output." A generator that
//! hands back one plan is asserting it got the design right; one that hands back four is
//! asking a question, which is the honest posture for a tool that has never seen the site.
//!
//! An option is a template plus a [`Variant`]. Candidates are every template for the
//! bedroom count crossed with every emphasis, ranked by how many rooms each leaves
//! awkward to furnish, and then **filled round-robin across templates** so that two
//! genuinely different layouts beat two reweightings of one.
//!
//! That last step is not a refinement, it is the point. The first version ranked purely
//! by score and produced four options reading 43.1, 43.1, 43.1 and 43.1 m² — the same
//! plan four times, which is worse than offering one, because it implies a choice was
//! considered. Total habitable area turned out to be nearly constant across variants
//! (the envelope is fixed; emphasis only moves area *between* rooms), so ranking on it
//! was ranking on rounding noise.
//!
//! **Mirroring is offered only when Vaastu is on.** A mirrored plan has the same rooms at
//! the same sizes, so without a directional input, presenting it as one of four choices is
//! a coin flip dressed as a decision. With Vaastu on the north angle is in play and
//! handedness decides which sector the kitchen lands in, which is the whole question — so
//! the mirror comes back, and it is frequently the option that wins.

use crate::library::{select, Rejection, SelectError};
use crate::template::Layout;
use crate::variant::{Emphasis, Variant};
use crate::Template;
use tri_params::ParameterSet;
use tri_rules::RuleSet;

/// How many options reach the architect. The PRD says three or four; four is the number
/// of thumbnails that fit down the edge of a canvas without becoming a gallery.
pub const OPTIONS_PER_GENERATION: usize = 4;

/// One option: a template, a variant, and the layout the two produced.
#[derive(Clone, Debug)]
pub struct Candidate {
    pub template: &'static Template,
    pub variant: Variant,
    pub layout: Layout,
    /// Stable across runs for the same brief, so a UI can key on it.
    pub key: String,
    /// "3BHK with a side corridor" or "3BHK with a side corridor — larger bedrooms".
    pub label: String,
    /// Rooms this option makes awkward to furnish. The first ranking term.
    pub awkward: usize,
    /// Total habitable area in mm². Reported, not ranked on.
    pub habitable_mm2: i64,
    /// Directional assessment, when the brief asked for one. `None` means Vaastu is off,
    /// which is not the same as a score of zero.
    pub vaastu: Option<tri_vaastu::Assessment>,
    /// Where this option would have ranked with Vaastu off, counting from 1.
    ///
    /// The PRD asks that Vaastu's "influence is shown so the architect can see what it
    /// cost in efficiency". A rank that moved is the cheapest honest way to show it.
    pub rank_without_vaastu: usize,
    /// Habitable area given up against the option that led the Vaastu-off ranking, in mm².
    /// Zero or negative means this option costs nothing.
    pub cost_mm2: i64,
}

impl Candidate {
    /// Why this option ranked where it did, in a sentence an architect can argue with.
    pub fn ranking_note(&self) -> String {
        let area = self.habitable_mm2 as f64 / 1_000_000.0;
        let base = match self.awkward {
            0 => format!("{area:.1} m² of rooms, none awkward to furnish"),
            1 => format!("{area:.1} m² of rooms, one hard to furnish"),
            n => format!("{area:.1} m² of rooms, {n} hard to furnish"),
        };
        match &self.vaastu {
            None => base,
            Some(v) => format!("{base} · {}", v.summary()),
        }
    }

    /// What choosing this option over the best non-Vaastu one costs, in plain words.
    ///
    /// Empty when there is nothing to say. An architect who turns Vaastu on is entitled to
    /// know whether it moved anything and what it gave up — a toggle whose effects are
    /// invisible is one nobody can reason about.
    pub fn cost_note(&self) -> String {
        if self.vaastu.is_none() {
            return String::new();
        }
        let area = self.cost_mm2 as f64 / 1_000_000.0;
        match (self.rank_without_vaastu, self.cost_mm2 > 500_000) {
            (1, false) => "the same plan Vaastu-off would have chosen".into(),
            (r, false) => format!("ranked {r} without Vaastu, at no cost in area"),
            (1, true) => format!("{area:.1} m² smaller than the largest option"),
            (r, true) => format!("ranked {r} without Vaastu, {area:.1} m² less room area"),
        }
    }
}

/// Every option worth offering for this brief, best first.
///
/// Refuses only when *nothing* fits; a template that does not fit this plot is dropped
/// from the list rather than failing the generation, because the whole point of a library
/// is that the ones which do fit still work.
pub fn candidates(p: &ParameterSet, rules: &RuleSet) -> Result<Vec<Candidate>, SelectError> {
    let templates = select(p.bedrooms.get());
    if templates.is_empty() {
        return Err(SelectError::NoTemplate {
            bedrooms: p.bedrooms.get(),
            available: crate::library()
                .iter()
                .map(|t| format!("{} ({}BHK)", t.id, t.bedrooms))
                .collect(),
        });
    }

    // Every template crossed with every emphasis, and — only when Vaastu is on — with
    // each handedness. Library order first, then the default emphasis before the
    // reweightings, because `sort_by` is stable and that order is what survives as the
    // final tie-break.
    let vaastu_on = p.vaastu.get();
    let handedness: &[bool] = if vaastu_on { &[false, true] } else { &[false] };
    let mut wanted: Vec<(&'static Template, Variant)> = Vec::new();
    for emphasis in [Emphasis::Balanced, Emphasis::Living, Emphasis::Bedrooms] {
        for mirrored in handedness {
            for t in &templates {
                wanted.push((
                    t,
                    Variant {
                        emphasis,
                        mirrored: *mirrored,
                    },
                ));
            }
        }
    }

    let mut out = Vec::new();
    let mut rejections: Vec<Rejection> = Vec::new();
    for (template, variant) in wanted {
        match template.instantiate_with(p, rules, variant) {
            Ok(layout) => out.push(score(template, variant, layout, p, vaastu_on)),
            Err(e) => {
                // One rejection per template, not per variant: four copies of the same
                // "needs 4800mm" is noise, and the variant is not why it failed.
                if !rejections.iter().any(|r| r.template_id == template.id) {
                    rejections.push(Rejection {
                        template_id: template.id,
                        why: e.to_string(),
                    });
                }
            }
        }
    }
    if out.is_empty() {
        return Err(SelectError::NothingFits { rejections });
    }

    // Fewest awkward rooms, then the order above. Habitable area is reported but not
    // ranked on: the envelope is fixed, so every variant of a template has nearly the
    // same total and sorting by it is sorting by rounding.
    //
    // `sort_by` is stable, so equal scores keep the pass order and the same brief always
    // produces the same list. The PRD leans on that: "because the solver is
    // deterministic, the same parameter set always yields the same plan, so an architect
    // can reproduce and trust a result."
    //
    // The ranking is computed twice when Vaastu is on: once without it, recording where
    // each option *would* have come, and once with. The difference between the two is the
    // cost the PRD asks to be made visible.
    out.sort_by_key(|c| c.awkward);
    let without: Vec<String> = out.iter().map(|c| c.key.clone()).collect();
    let best_area = out.first().map(|c| c.habitable_mm2).unwrap_or(0);
    for c in out.iter_mut() {
        c.rank_without_vaastu = without.iter().position(|k| *k == c.key).unwrap_or(0) + 1;
        c.cost_mm2 = best_area - c.habitable_mm2;
    }

    if vaastu_on {
        // **Buildability stays first.** Vaastu decides among options that are equally
        // furnishable and never promotes one that is not — a directional preference is a
        // preference, and a 2.6:1 kitchen is a room nobody can cook in whichever way it
        // faces. In practice most candidates share an awkward count, so this reorders
        // freely; it simply cannot reorder past a real defect.
        out.sort_by_key(|c| {
            (
                c.awkward,
                -(c.vaastu.as_ref().map(|v| v.score as i32).unwrap_or(0)),
            )
        });
    }

    // Then spread across templates. Taking the top four outright would fill the strip
    // with one topology reweighted four ways whenever that topology happened to score
    // best, which is the failure this whole function exists to avoid.
    Ok(round_robin_by_template(out))
}

/// Fill the option list one template at a time, best first, so a second topology is
/// always preferred over a second variant of the first.
fn round_robin_by_template(ranked: Vec<Candidate>) -> Vec<Candidate> {
    let mut by_template: Vec<Vec<Candidate>> = Vec::new();
    for c in ranked {
        match by_template
            .iter_mut()
            .find(|g| g[0].template.id == c.template.id)
        {
            Some(g) => g.push(c),
            None => by_template.push(vec![c]),
        }
    }
    let mut out = Vec::with_capacity(OPTIONS_PER_GENERATION);
    let mut round = 0;
    while out.len() < OPTIONS_PER_GENERATION {
        let before = out.len();
        for group in by_template.iter_mut() {
            if out.len() == OPTIONS_PER_GENERATION {
                break;
            }
            if round < group.len() {
                out.push(group[round].clone());
            }
        }
        if out.len() == before {
            break;
        }
        round += 1;
    }
    out
}

fn score(
    template: &'static Template,
    variant: Variant,
    layout: Layout,
    p: &ParameterSet,
    vaastu_on: bool,
) -> Candidate {
    // `tri_rules::is_awkward` rather than a local copy of the 2.5:1 rule. A second
    // definition here would let the generator rank a layout first and the compliance
    // panel then warn about it, which is the tool arguing with itself in front of a user.
    let awkward = layout
        .cells
        .iter()
        .filter(|c| tri_rules::is_awkward(c.kind, c.width().as_mm_f64(), c.depth().as_mm_f64()))
        .count();
    let habitable_mm2 = layout
        .cells
        .iter()
        .filter(|c| matches!(c.kind, "living" | "bedroom" | "kitchen"))
        .map(|c| c.area_mm2())
        .sum();
    let vaastu = vaastu_on.then(|| assess_layout(&layout, p));
    let suffix = variant.label();
    Candidate {
        key: if variant.is_default() {
            template.id.to_string()
        } else {
            format!("{}+{}", template.id, suffix.replace(' ', "-"))
        },
        label: if suffix.is_empty() {
            template.label.to_string()
        } else {
            format!("{} — {suffix}", template.label)
        },
        template,
        variant,
        awkward,
        habitable_mm2,
        vaastu,
        rank_without_vaastu: 0,
        cost_mm2: 0,
        layout,
    }
}

/// Hand a layout to the Vaastu layer in the only terms it understands: kinds and centres.
///
/// The master bedroom and the main entry are positions rather than room kinds, so they get
/// their own vocabulary — `bedroom-master` and `entry`. Without that split the ruleset
/// could not say the master belongs south-west while the other bedrooms merely avoid the
/// north-east.
fn assess_layout(layout: &Layout, p: &ParameterSet) -> tri_vaastu::Assessment {
    let rules = tri_vaastu::RuleSet::traditional();
    let compass = tri_vaastu::Compass::new(p.road_facing.get().as_str(), p.north_angle_mdeg.get());

    let mut rooms: Vec<tri_vaastu::Room> = layout
        .cells
        .iter()
        .map(|c| tri_vaastu::Room {
            kind: if c.kind == "bedroom" && c.name.contains("master") {
                "bedroom-master"
            } else {
                c.kind
            },
            name: c.name,
            cx_um: (c.min.x.as_um() + c.max.x.as_um()) / 2,
            cy_um: (c.min.y.as_um() + c.max.y.as_um()) / 2,
        })
        .collect();

    // The main door, on the front wall at the entry offset. It is not a cell, and leaving
    // it out would drop the one preference most clients actually ask about.
    rooms.push(tri_vaastu::Room {
        kind: "entry",
        name: "Main entry",
        cx_um: layout.envelope_min.x.as_um() + layout.entry_offset.as_um(),
        cy_um: layout.envelope_min.y.as_um(),
    });

    let centre = (
        (layout.envelope_min.x.as_um() + layout.envelope_max.x.as_um()) / 2,
        (layout.envelope_min.y.as_um() + layout.envelope_max.y.as_um()) / 2,
    );
    let half = (
        layout.envelope_width().as_um() / 2,
        layout.envelope_depth().as_um() / 2,
    );
    tri_vaastu::assess(&rooms, compass, centre, half, &rules)
}
