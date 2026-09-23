//! The parameter set itself.

use crate::layers::LayerScheme;
use crate::units::Units;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tri_doc::{Length, Provenance, Tracked};

/// Which way the plot faces the road. Sets the entry and the setback asymmetry.
#[derive(
    Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum Orientation {
    North,
    South,
    East,
    West,
}

impl Orientation {
    pub fn as_str(self) -> &'static str {
        match self {
            Orientation::North => "north",
            Orientation::South => "south",
            Orientation::East => "east",
            Orientation::West => "west",
        }
    }

    pub fn parse(s: &str) -> Option<Orientation> {
        Some(match s.trim().to_ascii_lowercase().as_str() {
            "n" | "north" => Orientation::North,
            "s" | "south" => Orientation::South,
            "e" | "east" => Orientation::East,
            "w" | "west" => Orientation::West,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub struct DoorSize {
    pub width: Length,
    pub height: Length,
}

/// Everything known about the brief.
///
/// Every field is a [`Tracked`] value: there is no way to store a dimension here without
/// saying where it came from. Tier 2 fields start `Assumed` with a reason saying they
/// have not been derived yet, rather than starting empty — an absent value and a
/// not-yet-computed value are different things and the panel needs to tell them apart.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct ParameterSet {
    // ---- tier 1: the architect typed these -------------------------------------
    pub plot_width: Tracked<Length>,
    pub plot_depth: Tracked<Length>,
    pub road_facing: Tracked<Orientation>,
    /// Degrees × 1000, clockwise from plot north. Integer for the determinism reason in
    /// `tri_doc::units`.
    pub north_angle_mdeg: Tracked<i32>,
    /// Width of the fronting road. Drives the FAR band.
    pub road_width_mm: Tracked<Length>,
    pub bedrooms: Tracked<u8>,
    /// 1 = ground only, 2 = G+1, and so on.
    pub floors: Tracked<u8>,
    pub car_parking: Tracked<u8>,

    // ---- tier 2: derived, with the rule that produced them ---------------------
    /// FAR × 1000, so 1.75 is 1750. A ratio stored as a float would not hash.
    pub far_permitted_x1000: Tracked<i64>,
    pub built_up_permitted_mm2: Tracked<i64>,
    /// Ground coverage limit as a percentage × 100, so 60% is 6000.
    pub ground_coverage_permitted_x100: Tracked<i64>,
    pub setback_front: Tracked<Length>,
    pub setback_rear: Tracked<Length>,
    pub setback_left: Tracked<Length>,
    pub setback_right: Tracked<Length>,
    pub toilets: Tracked<u8>,
    /// Footprint the stair needs on each floor, mm². Zero on a single-storey plan.
    pub staircase_footprint_mm2: Tracked<i64>,
    /// Storage sized from an occupancy estimate, litres.
    pub overhead_tank_litres: Tracked<i64>,
    pub sump_litres: Tracked<i64>,

    // ---- tier 3: defaults ------------------------------------------------------
    /// The unit the plot was entered in. A display preference; storage is always µm.
    pub entry_units: Tracked<Units>,
    /// Answers to the ambiguity chips. Recorded whether or not the current template can
    /// act on them — losing a stated requirement because today's template cannot build
    /// it would be worse than carrying it. The template library (F4) consumes these.
    pub all_bedrooms_attached: Tracked<bool>,
    pub include_puja: Tracked<bool>,
    pub include_balcony: Tracked<bool>,
    pub closed_kitchen: Tracked<bool>,
    pub vaastu: Tracked<bool>,
    pub balcony_depth: Tracked<Length>,
    pub two_wheeler_slots: Tracked<u8>,
    /// Layer names used on export. See [`LayerScheme`] for why these are data.
    pub layers: Tracked<LayerScheme>,
    pub external_wall: Tracked<Length>,
    pub internal_wall: Tracked<Length>,
    pub floor_to_floor: Tracked<Length>,
    pub main_door: Tracked<DoorSize>,
    pub internal_door: Tracked<DoorSize>,
    pub toilet_door: Tracked<DoorSize>,
}

#[derive(Debug, thiserror::Error)]
pub enum ParamsError {
    #[error("{field} must be between {min} and {max}, got {got}")]
    OutOfRange {
        field: &'static str,
        min: i64,
        max: i64,
        got: i64,
    },
    #[error("the parameter set is missing {0}")]
    Missing(String),
    #[error("{field}: {message}")]
    Malformed { field: String, message: String },
}

impl ParameterSet {
    /// A set with tier 1 answered and everything else at its default.
    ///
    /// Tier 2 is deliberately *not* computed here. Deriving setbacks needs a ruleset, and
    /// a ruleset is data with an authority and a date behind it — baking BBMP numbers
    /// into a constructor is precisely the coupling the `rules` crate exists to avoid.
    /// Until `rules::derive` runs, tier 2 reads as "not derived yet" rather than as a
    /// number nobody can source.
    pub fn from_brief(
        plot_width: Length,
        plot_depth: Length,
        road_facing: Orientation,
        bedrooms: u8,
        floors: u8,
        car_parking: u8,
    ) -> Result<ParameterSet, ParamsError> {
        let range = |field, got: i64, min, max| {
            if (min..=max).contains(&got) {
                Ok(())
            } else {
                Err(ParamsError::OutOfRange {
                    field,
                    min,
                    max,
                    got,
                })
            }
        };
        // MVP scope from the PRD: 20x30 to 60x40 ft, 1-4 BHK, G to G+3.
        range("plot_width", plot_width.as_mm_f64() as i64, 3_000, 30_000)?;
        range("plot_depth", plot_depth.as_mm_f64() as i64, 3_000, 30_000)?;
        range("bedrooms", bedrooms as i64, 1, 4)?;
        range("floors", floors as i64, 1, 4)?;
        range("car_parking", car_parking as i64, 0, 4)?;

        let typed = "entered by the architect";
        let pending = |what: &str| format!("not derived yet; needs a ruleset to compute {what}");

        Ok(ParameterSet {
            plot_width: Tracked::measured(plot_width, typed),
            plot_depth: Tracked::measured(plot_depth, typed),
            road_facing: Tracked::measured(road_facing, typed),
            north_angle_mdeg: Tracked::assumed(0, "north not given; assumed aligned to the plot"),
            road_width_mm: Tracked::assumed(
                Length::from_mm(9_000),
                "road width not given; assumed 9m, the commonest plotted-residential street",
            ),
            bedrooms: Tracked::measured(bedrooms, typed),
            floors: Tracked::measured(floors, typed),
            car_parking: Tracked::measured(car_parking, typed),

            far_permitted_x1000: Tracked::assumed(0, pending("FAR from the road width")),
            built_up_permitted_mm2: Tracked::assumed(0, pending("permissible built-up area")),
            ground_coverage_permitted_x100: Tracked::assumed(
                0,
                pending("the ground coverage limit"),
            ),
            setback_front: Tracked::assumed(Length::ZERO, pending("setbacks from the area band")),
            setback_rear: Tracked::assumed(Length::ZERO, pending("setbacks from the area band")),
            setback_left: Tracked::assumed(Length::ZERO, pending("setbacks from the area band")),
            setback_right: Tracked::assumed(Length::ZERO, pending("setbacks from the area band")),
            // Indian convention, and a convention is an inference rather than a default:
            // it follows from the bedroom count by a stated rule.
            toilets: Tracked::inferred(
                bedrooms.clamp(1, 3) + 1,
                "Indian convention: master attached, one common per remaining pair",
            ),

            staircase_footprint_mm2: Tracked::assumed(
                0,
                pending("the staircase footprint from the floor count"),
            ),
            overhead_tank_litres: Tracked::assumed(
                0,
                pending("storage from an occupancy estimate"),
            ),
            sump_litres: Tracked::assumed(0, pending("storage from an occupancy estimate")),

            entry_units: Tracked::assumed(
                Units::Millimetres,
                "no unit recorded; the brief was built from raw lengths",
            ),
            all_bedrooms_attached: Tracked::assumed(
                false,
                "not asked; Indian convention is master attached, rest common",
            ),
            include_puja: Tracked::assumed(true, "not asked; included by default"),
            include_balcony: Tracked::assumed(true, "not asked; one off the living room"),
            closed_kitchen: Tracked::assumed(true, "not asked; closed with utility by default"),
            vaastu: Tracked::assumed(false, "not asked; Vaastu off by default"),
            balcony_depth: Tracked::assumed(Length::from_mm(1200), "default, not specified"),
            two_wheeler_slots: Tracked::assumed(2, "default, not specified"),
            layers: Tracked::assumed(
                LayerScheme::default(),
                "default layer scheme (US National CAD Standard names), not specified",
            ),

            external_wall: Tracked::assumed(Length::from_mm(230), "default, not specified"),
            internal_wall: Tracked::assumed(Length::from_mm(115), "default, not specified"),
            floor_to_floor: Tracked::assumed(Length::from_mm(3000), "default, not specified"),
            main_door: Tracked::assumed(
                DoorSize {
                    width: Length::from_mm(1050),
                    height: Length::from_mm(2100),
                },
                "default door schedule, not specified",
            ),
            internal_door: Tracked::assumed(
                DoorSize {
                    width: Length::from_mm(900),
                    height: Length::from_mm(2100),
                },
                "default door schedule, not specified",
            ),
            toilet_door: Tracked::assumed(
                DoorSize {
                    width: Length::from_mm(750),
                    height: Length::from_mm(2100),
                },
                "default door schedule, not specified",
            ),
        })
    }

    /// Plot area in mm². Exact: both sides are integer micrometres.
    pub fn plot_area_mm2(&self) -> i64 {
        let w = self.plot_width.get().as_um() as i128 / 1_000;
        let d = self.plot_depth.get().as_um() as i128 / 1_000;
        (w * d) as i64
    }

    pub fn plot_area_sqm(&self) -> f64 {
        self.plot_area_mm2() as f64 / 1_000_000.0
    }

    /// Has tier 2 been filled in by a ruleset?
    ///
    /// The generator must refuse to run before this is true — a plan laid out against
    /// zero setbacks is not a conservative plan, it is a wrong one.
    pub fn is_derived(&self) -> bool {
        self.far_permitted_x1000.get() > 0
    }

    /// Every value the architect must check, worst provenance first.
    pub fn needs_review(&self) -> Vec<(&'static str, Provenance, &str)> {
        self.all_records()
            .into_iter()
            .filter(|(_, p, _)| *p != Provenance::Measured)
            .collect()
    }

    /// Field name, provenance and reason for every parameter.
    pub fn all_records(&self) -> Vec<(&'static str, Provenance, &str)> {
        macro_rules! rec {
            ($($f:ident),* $(,)?) => {
                vec![$((stringify!($f), self.$f.provenance(), self.$f.reason())),*]
            };
        }
        rec![
            plot_width,
            plot_depth,
            road_facing,
            north_angle_mdeg,
            road_width_mm,
            bedrooms,
            floors,
            car_parking,
            far_permitted_x1000,
            built_up_permitted_mm2,
            ground_coverage_permitted_x100,
            setback_front,
            setback_rear,
            setback_left,
            setback_right,
            toilets,
            staircase_footprint_mm2,
            overhead_tank_litres,
            sump_litres,
            entry_units,
            all_bedrooms_attached,
            include_puja,
            include_balcony,
            closed_kitchen,
            vaastu,
            balcony_depth,
            two_wheeler_slots,
            layers,
            external_wall,
            internal_wall,
            floor_to_floor,
            main_door,
            internal_door,
            toilet_door,
        ]
    }
}
