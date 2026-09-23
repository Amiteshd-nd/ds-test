//! What the architect typed, and what we store.
//!
//! Storage is always exact integer micrometres (`tri_doc::units`). Units exist for two
//! other reasons.
//!
//! The first is the intake form: an architect in Bengaluru gives a plot in feet and a
//! wall in millimetres, and a form that insists on one of those is a form they will
//! mistype into.
//!
//! The second is provenance, and it is the one that matters. "30 ft" and "9144 mm" store
//! identically, but a reason string that says *entered as 30 ft* tells a reviewer
//! something a reason string that says *9144 mm* does not: that the figure is a round
//! number in the unit it was thought in, and that 9144 is a conversion rather than a
//! measurement. The PRD calls units the classic failure mode of this domain. Recording
//! the original is how you see the mistake later.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tri_doc::Length;

#[derive(
    Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum Units {
    Feet,
    Millimetres,
    Metres,
}

impl Units {
    pub fn parse(s: &str) -> Option<Units> {
        Some(match s.trim().to_ascii_lowercase().as_str() {
            "ft" | "feet" | "foot" => Units::Feet,
            "mm" | "millimetre" | "millimetres" | "millimeter" | "millimeters" => {
                Units::Millimetres
            }
            "m" | "metre" | "metres" | "meter" | "meters" => Units::Metres,
            _ => return None,
        })
    }

    pub fn suffix(self) -> &'static str {
        match self {
            Units::Feet => "ft",
            Units::Millimetres => "mm",
            Units::Metres => "m",
        }
    }

    /// Micrometres per unit. Feet is exact by definition: 1 ft = 304.8 mm exactly.
    fn um_per_unit(self) -> f64 {
        match self {
            Units::Feet => 304_800.0,
            Units::Millimetres => 1_000.0,
            Units::Metres => 1_000_000.0,
        }
    }

    pub fn to_length(self, value: f64) -> Length {
        Length::from_um((value * self.um_per_unit()).round() as i64)
    }

    pub fn from_length(self, l: Length) -> f64 {
        l.as_um() as f64 / self.um_per_unit()
    }

    /// How a value entered in this unit should read in a provenance reason.
    ///
    /// Shows the original figure and, when it is not the storage unit, the conversion —
    /// so a reviewer can see both what was meant and what was stored.
    pub fn describe(self, value: f64) -> String {
        let trimmed = if (value - value.round()).abs() < 1e-9 {
            format!("{}", value.round() as i64)
        } else {
            format!("{value}")
        };
        match self {
            Units::Millimetres => format!("entered as {trimmed} mm"),
            other => format!(
                "entered as {trimmed} {} ({:.0} mm)",
                other.suffix(),
                other.to_length(value).as_mm_f64()
            ),
        }
    }
}

impl Default for Units {
    /// Feet, because that is what a plot is quoted in here. Construction dimensions are
    /// millimetres regardless; this is the plot-entry default only.
    fn default() -> Self {
        Units::Feet
    }
}
