//! The curated template library, and picking one for a brief.
//!
//! Four topologies, one per bedroom count the brief will accept. The PRD is explicit that
//! the solver works from a curated library rather than free-form search: templates are far
//! more reliable than solving from scratch, and each new one is a visible product
//! improvement rather than a model retrain.
//!
//! Every proportion here is a constant with a reason. None of them are tuned against real
//! plans — the PRD's own open question is who draws the first ten layouts, and until
//! somebody does, these are an ordinary starting point that an architect will want to
//! change. That is why the output is editable and why every dimension carries provenance.

use crate::template::{Band, CellSpec, Side, Spine, Template, Width};
use std::sync::LazyLock;
use tri_params::ParameterSet;
use tri_rules::RuleSet;

/// Common toilet, in millimetres. A WC and a basin, no shower.
const TOILET: i64 = 1_200;
/// Attached toilet. Wider than the common one to take a shower enclosure.
const ATTACHED: i64 = 1_500;
/// Single-person corridor. Wide enough to pass a door swing, no wider — corridor area is
/// the first thing an architect deletes.
const CORRIDOR: i64 = 1_050;
/// Widest a kitchen gets. Two counters and a walkway between them; past this the cook
/// walks further for nothing. The plot's extra frontage goes to the living room instead.
const KITCHEN_MAX: i64 = 3_300;

fn cell(name: &'static str, kind: &'static str, width: Width) -> CellSpec {
    CellSpec { name, kind, width }
}

fn band(name: &'static str, share_pct: i64, cells: Vec<CellSpec>) -> Band {
    Band {
        name,
        share_pct,
        cells,
    }
}

static LIBRARY: LazyLock<Vec<Template>> = LazyLock::new(|| {
    vec![
        // 1BHK. The 2BHK with one bedroom band instead of two, which is what it is.
        Template {
            id: "1bhk.compact.v1",
            label: "1BHK, living room to the road",
            bedrooms: 1,
            entry_pct: 33,
            bands: vec![
                band(
                    "living",
                    42,
                    vec![cell("Living / Dining", "living", Width::Share(1))],
                ),
                band(
                    "service",
                    25,
                    vec![
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 1,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                    ],
                ),
                band(
                    "bedroom",
                    33,
                    vec![cell("Bedroom 1 (master)", "bedroom", Width::Share(1))],
                ),
            ],
            spine: None,
        },
        // 2BHK. Three bands deep: entry from the road into the living room, service and
        // circulation in the middle, bedrooms at the back away from the street. It is an
        // ordinary plan, which is the point — the PRD's named risk is output that looks
        // naive to a trained eye, and an ordinary plan drawn correctly beats a clever one
        // drawn badly.
        Template {
            id: "2bhk.front-living.v1",
            label: "2BHK, living room to the road",
            bedrooms: 2,
            entry_pct: 33,
            bands: vec![
                band(
                    "living",
                    40,
                    vec![cell("Living / Dining", "living", Width::Share(1))],
                ),
                band(
                    "service",
                    24,
                    vec![
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                        // The kitchen takes what the two fixtures leave, so a wider plot
                        // buys a bigger kitchen rather than a bigger bathroom.
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 1,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                        cell("Toilet (attached)", "toilet", Width::Fixed(ATTACHED)),
                    ],
                ),
                band(
                    "bedroom",
                    36,
                    vec![
                        cell("Bedroom 2", "bedroom", Width::Share(45)),
                        cell("Bedroom 1 (master)", "bedroom", Width::Share(55)),
                    ],
                ),
            ],
            spine: None,
        },
        // 2BHK, second topology. The service band sits *between* the bedrooms instead of
        // in front of both, which buys real separation between the master and the second
        // room at the cost of a deeper plan. A different answer to the same brief rather
        // than a rearrangement of this one, which is what makes it worth offering.
        Template {
            id: "2bhk.split-bedroom.v1",
            label: "2BHK, bedrooms split by the service core",
            bedrooms: 2,
            entry_pct: 33,
            bands: vec![
                band(
                    "living",
                    32,
                    vec![cell("Living / Dining", "living", Width::Share(1))],
                ),
                band(
                    "master",
                    24,
                    vec![
                        cell("Bedroom 1 (master)", "bedroom", Width::Share(1)),
                        cell("Toilet (attached)", "toilet", Width::Fixed(ATTACHED)),
                    ],
                ),
                band(
                    "service",
                    20,
                    vec![
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 1,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                    ],
                ),
                band(
                    "rear bedroom",
                    24,
                    vec![cell("Bedroom 2", "bedroom", Width::Share(1))],
                ),
            ],
            spine: None,
        },
        // 3BHK. Four bands is too many to reach off a single living room, so circulation
        // becomes a corridor down one side, starting behind the living room. The corridor
        // is deliberately not a band: it has to be continuous front to back, and the
        // dividers between bands stop at its edge rather than crossing it.
        Template {
            id: "3bhk.side-corridor.v1",
            label: "3BHK with a side corridor",
            bedrooms: 3,
            entry_pct: 30,
            bands: vec![
                band(
                    "living",
                    30,
                    vec![cell("Living / Dining", "living", Width::Share(1))],
                ),
                band(
                    "service",
                    22,
                    vec![
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 1,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                    ],
                ),
                band(
                    "master",
                    24,
                    vec![
                        cell("Bedroom 1 (master)", "bedroom", Width::Share(1)),
                        cell("Toilet (attached)", "toilet", Width::Fixed(ATTACHED)),
                    ],
                ),
                band(
                    "rear bedrooms",
                    24,
                    vec![
                        cell("Bedroom 2", "bedroom", Width::Share(1)),
                        cell("Bedroom 3", "bedroom", Width::Share(1)),
                    ],
                ),
            ],
            spine: Some(Spine {
                name: "Corridor",
                width_mm: CORRIDOR,
                side: Side::Right,
                from_band: 1,
            }),
        },
        // 3BHK, second topology. All three bedrooms in one rear band off a central hall,
        // no corridor. It needs about 7.2m of clear width for three bedrooms side by side,
        // so on a 30ft plot it is refused and the side-corridor plan is the only option —
        // which is the library adapting to the plot rather than offering four versions of
        // the same compromise.
        Template {
            id: "3bhk.central-hall.v1",
            label: "3BHK around a central hall",
            bedrooms: 3,
            entry_pct: 28,
            bands: vec![
                band(
                    "living",
                    30,
                    vec![
                        cell("Living / Dining", "living", Width::Share(6)),
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 4,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                    ],
                ),
                band(
                    "hall",
                    16,
                    vec![
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                        cell("Family hall", "living", Width::Share(1)),
                        cell("Toilet (attached)", "toilet", Width::Fixed(ATTACHED)),
                    ],
                ),
                band(
                    "bedrooms",
                    54,
                    vec![
                        cell("Bedroom 1 (master)", "bedroom", Width::Share(40)),
                        cell("Bedroom 2", "bedroom", Width::Share(30)),
                        cell("Bedroom 3", "bedroom", Width::Share(30)),
                    ],
                ),
            ],
            spine: None,
        },
        // 4BHK. A side corridor serving four bedrooms gets long and dark, so circulation
        // goes back to a band — a wide central hall with bedrooms fore and aft and the
        // toilets opening off it. This one wants a genuinely large plot and says so
        // rather than squeezing.
        Template {
            id: "4bhk.central-hall.v1",
            label: "4BHK around a central hall",
            bedrooms: 4,
            entry_pct: 25,
            bands: vec![
                band(
                    "living",
                    26,
                    vec![
                        cell("Living / Dining", "living", Width::Share(6)),
                        cell(
                            "Kitchen",
                            "kitchen",
                            Width::Capped {
                                weight: 4,
                                max_mm: KITCHEN_MAX,
                            },
                        ),
                    ],
                ),
                band(
                    "front bedrooms",
                    25,
                    vec![
                        cell("Bedroom 1 (master)", "bedroom", Width::Share(1)),
                        cell("Bedroom 2", "bedroom", Width::Share(1)),
                    ],
                ),
                // The hall is `living`, not `circulation`, and that is not a labelling
                // choice. On a wide plot this band is eleven metres across; calling that
                // circulation would exempt a 26 m² habitable room from every room check
                // in the ruleset. A family hall is a room people sit in, so it is checked
                // like one.
                band(
                    "hall",
                    14,
                    vec![
                        cell("Toilet", "toilet", Width::Fixed(TOILET)),
                        cell("Family hall", "living", Width::Share(1)),
                        cell("Toilet (attached)", "toilet", Width::Fixed(ATTACHED)),
                    ],
                ),
                band(
                    "rear bedrooms",
                    35,
                    vec![
                        cell("Bedroom 3", "bedroom", Width::Share(1)),
                        cell("Bedroom 4", "bedroom", Width::Share(1)),
                    ],
                ),
            ],
            spine: None,
        },
    ]
});

/// Every template in the library, in library order.
pub fn library() -> &'static [Template] {
    &LIBRARY
}

/// The templates that lay out this many bedrooms.
///
/// Returns every candidate, not the best one. F5 turns these into parallel commit
/// branches an architect chooses between; until then [`solve`] takes the first that fits.
pub fn select(bedrooms: u8) -> Vec<&'static Template> {
    LIBRARY.iter().filter(|t| t.bedrooms == bedrooms).collect()
}

/// Why one candidate template could not be used.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rejection {
    pub template_id: &'static str,
    pub why: String,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SelectError {
    #[error(
        "no template in the library lays out {bedrooms} bedroom(s). The library holds: {}",
        .available.join(", ")
    )]
    NoTemplate {
        bedrooms: u8,
        available: Vec<String>,
    },
    #[error(
        "nothing in the library fits this plot:\n{}",
        .rejections.iter().map(|r| format!("  {} — {}", r.template_id, r.why))
            .collect::<Vec<_>>().join("\n")
    )]
    NothingFits { rejections: Vec<Rejection> },
}

/// Pick a template for this brief and lay it out.
///
/// **A refusal here names every candidate and what was wrong with each.** The PRD's
/// done-when for this phase is "failures are explicit, not silent", and the failure mode
/// it is guarding against is a generator that quietly squeezes a 4BHK onto a 20x30 plot
/// and hands back six rooms nobody could stand up in. A refusal an architect can read is
/// worth more than a plan they have to detect is wrong.
pub fn solve(
    p: &ParameterSet,
    rules: &RuleSet,
) -> Result<(&'static Template, crate::template::Layout), SelectError> {
    let want = p.bedrooms.get();
    let candidates = select(want);
    if candidates.is_empty() {
        return Err(SelectError::NoTemplate {
            bedrooms: want,
            available: LIBRARY
                .iter()
                .map(|t| format!("{} ({}BHK)", t.id, t.bedrooms))
                .collect(),
        });
    }
    let mut rejections = Vec::new();
    for t in candidates {
        match t.instantiate(p, rules) {
            Ok(layout) => return Ok((t, layout)),
            Err(e) => rejections.push(Rejection {
                template_id: t.id,
                why: e.to_string(),
            }),
        }
    }
    Err(SelectError::NothingFits { rejections })
}
