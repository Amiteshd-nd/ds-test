//! The intake form: what we ask, and nothing else.
//!
//! The PRD's rule is six questions on screen, not thirty. Everything here is tier 1 or an
//! ambiguity chip; tier 2 is derived by the rule engine and tier 3 lives in settings.
//!
//! # The form is this type
//! The UI renders the JSON Schema of this struct rather than a hand-written form, for the
//! same reason the agent's tools are generated rather than hand-written (I3): two
//! descriptions of the same fields drift, and the drift shows up as a form that silently
//! stops collecting something the solver needs. [`form_schema`] carries an `x-tier` on
//! every field so the UI knows what to show and what to fold away.

use crate::set::{Orientation, ParameterSet, ParamsError};
use crate::tiers::Tier;
use crate::units::Units;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tri_doc::Tracked;

/// An answer to an ambiguity chip.
///
/// `None` is not the same as `Some(false)` and the distinction is the point: an architect
/// who tapped "no servant room" has told us something, and one who skipped the chip has
/// not. The first is `Measured`, the second is `Assumed`.
pub type Chip = Option<bool>;

/// Everything the form asks.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize, JsonSchema)]
pub struct Brief {
    /// Unit the plot figures are given in. Global and sticky in the UI.
    #[serde(default)]
    #[schemars(extend("x-tier" = "ask", "x-sticky" = true))]
    pub units: Units,

    #[schemars(extend("x-tier" = "ask", "x-label" = "Plot width"))]
    pub plot_width: f64,

    #[schemars(extend("x-tier" = "ask", "x-label" = "Plot depth"))]
    pub plot_depth: f64,

    #[schemars(extend("x-tier" = "ask", "x-label" = "Road-facing side"))]
    pub road_facing: Orientation,

    /// Width of the road the plot fronts, in metres.
    ///
    /// Optional because most plotted residential sits on a 9m road and asking every time
    /// spends a question badly — but it is asked rather than derived, because BBMP FAR
    /// depends on it and a wrong road width is a wrong permissible area.
    #[serde(default)]
    #[schemars(extend("x-tier" = "ask", "x-optional" = true, "x-label" = "Road width (m)"))]
    pub road_width_m: Option<f64>,

    /// Degrees clockwise from the plot's own north. Optional: most plots are square to
    /// the road and the answer is zero, so asking every time is a question wasted.
    #[serde(default)]
    #[schemars(extend("x-tier" = "ask", "x-optional" = true, "x-label" = "North angle"))]
    pub north_angle_deg: Option<f64>,

    #[schemars(extend("x-tier" = "ask", "x-label" = "Bedrooms", "x-min" = 1, "x-max" = 4))]
    pub bedrooms: u8,

    /// 1 = ground only, 2 = G+1, 3 = G+2, 4 = G+3.
    #[schemars(extend("x-tier" = "ask", "x-label" = "Floors", "x-min" = 1, "x-max" = 4))]
    pub floors: u8,

    #[schemars(extend("x-tier" = "ask", "x-label" = "Car parking"))]
    pub car_parking: u8,

    // ---- ambiguity chips: one tap each, skipping accepts the default ----------
    #[serde(default)]
    #[schemars(extend("x-tier" = "chip", "x-label" = "Attached toilets for all bedrooms?"))]
    pub all_bedrooms_attached: Chip,

    #[serde(default)]
    #[schemars(extend("x-tier" = "chip", "x-label" = "Puja room?"))]
    pub puja: Chip,

    #[serde(default)]
    #[schemars(extend("x-tier" = "chip", "x-label" = "Balcony off the living room?"))]
    pub balcony: Chip,

    #[serde(default)]
    #[schemars(extend("x-tier" = "chip", "x-label" = "Closed kitchen with utility?"))]
    pub closed_kitchen: Chip,

    #[serde(default)]
    #[schemars(extend("x-tier" = "chip", "x-label" = "Vaastu constraints?"))]
    pub vaastu: Chip,
}

impl Brief {
    /// A brief with only the questions that cannot be guessed.
    pub fn new(
        units: Units,
        plot_width: f64,
        plot_depth: f64,
        road_facing: Orientation,
        bedrooms: u8,
        floors: u8,
        car_parking: u8,
    ) -> Brief {
        Brief {
            units,
            plot_width,
            plot_depth,
            road_facing,
            road_width_m: None,
            north_angle_deg: None,
            bedrooms,
            floors,
            car_parking,
            all_bedrooms_attached: None,
            puja: None,
            balcony: None,
            closed_kitchen: None,
            vaastu: None,
        }
    }

    /// Turn the answers into a parameter set.
    ///
    /// Tier 1 becomes `Measured`, and the reason records the figure *as typed* rather
    /// than as stored — see [`Units`]. Tier 3 stays `Assumed` unless a chip answered it,
    /// in which case it becomes `Measured` and says the architect chose it. Tier 2 is
    /// untouched; deriving it needs a ruleset, which this crate deliberately does not
    /// have.
    pub fn into_parameters(self) -> Result<ParameterSet, ParamsError> {
        let u = self.units;
        let mut p = ParameterSet::from_brief(
            u.to_length(self.plot_width),
            u.to_length(self.plot_depth),
            self.road_facing,
            self.bedrooms,
            self.floors,
            self.car_parking,
        )?;

        // Replace the generic "entered by the architect" with what was actually typed.
        p.plot_width = Tracked::measured(p.plot_width.get(), u.describe(self.plot_width));
        p.plot_depth = Tracked::measured(p.plot_depth.get(), u.describe(self.plot_depth));
        p.entry_units = Tracked::measured(
            u,
            format!("the architect entered the plot in {}", u.suffix()),
        );

        if let Some(w) = self.road_width_m {
            p.road_width_mm = Tracked::measured(
                tri_doc::Length::from_mm_f64(w * 1000.0),
                format!("road measured at {w} m wide"),
            );
        }

        if let Some(deg) = self.north_angle_deg {
            p.north_angle_mdeg = Tracked::measured(
                (deg * 1000.0).round() as i32,
                format!("north measured at {deg}° clockwise from the plot"),
            );
        }

        // Chips. Answered is a decision; skipped is a default, and the reason says which.
        p.all_bedrooms_attached = chip(
            self.all_bedrooms_attached,
            false,
            "the architect asked for an attached toilet to every bedroom",
            "the architect asked for common toilets beyond the master",
            "not asked; Indian convention is master attached, rest common",
        );
        p.include_puja = chip(
            self.puja,
            true,
            "the architect asked for a puja room",
            "the architect said no puja room",
            "not asked; included by default, 900x900mm niche minimum",
        );
        p.include_balcony = chip(
            self.balcony,
            true,
            "the architect asked for a balcony",
            "the architect said no balcony",
            "not asked; one balcony off the living room by default",
        );
        p.closed_kitchen = chip(
            self.closed_kitchen,
            true,
            "the architect asked for a closed kitchen",
            "the architect asked for an open kitchen",
            "not asked; closed kitchen with utility by default",
        );
        p.vaastu = chip(
            self.vaastu,
            false,
            "the architect asked for Vaastu constraints",
            "the architect declined Vaastu constraints",
            "not asked; Vaastu off by default",
        );

        Ok(p)
    }
}

fn chip(answer: Chip, default: bool, yes: &str, no: &str, skipped: &str) -> Tracked<bool> {
    match answer {
        Some(true) => Tracked::measured(true, yes),
        Some(false) => Tracked::measured(false, no),
        None => Tracked::assumed(default, skipped),
    }
}

/// The form, as a schema the UI renders.
///
/// Every field carries `x-tier`: `ask` for tier 1, `chip` for the one-tap ambiguity row.
/// Tier 2 and tier 3 are not in here at all, which is the point — the form asks six
/// questions and a row of chips, and everything else is derived or defaulted.
pub fn form_schema() -> serde_json::Value {
    serde_json::to_value(schemars::schema_for!(Brief)).unwrap_or(serde_json::Value::Null)
}

/// Field name and tier for everything the form asks, in declaration order.
pub fn form_fields() -> Vec<(String, Tier)> {
    let schema = form_schema();
    let Some(props) = schema.get("properties").and_then(|p| p.as_object()) else {
        return Vec::new();
    };
    props
        .iter()
        .filter_map(|(name, spec)| {
            let tier = match spec.get("x-tier").and_then(|t| t.as_str())? {
                "ask" | "chip" => Tier::Ask,
                "derive" => Tier::Derive,
                _ => Tier::Default,
            };
            Some((name.clone(), tier))
        })
        .collect()
}
