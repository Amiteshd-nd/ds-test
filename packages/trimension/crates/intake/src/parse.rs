//! Turning whatever came back into a [`Brief`], or saying clearly why it cannot.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use tri_params::{Brief, Units};

/// A tier-1 field, named so the UI can mark the ones a model guessed.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Field {
    Units,
    PlotWidth,
    PlotDepth,
    RoadFacing,
    RoadWidth,
    NorthAngle,
    Bedrooms,
    Floors,
    CarParking,
}

impl Field {
    pub fn as_str(self) -> &'static str {
        match self {
            Field::Units => "units",
            Field::PlotWidth => "plot_width",
            Field::PlotDepth => "plot_depth",
            Field::RoadFacing => "road_facing",
            Field::RoadWidth => "road_width_m",
            Field::NorthAngle => "north_angle_deg",
            Field::Bedrooms => "bedrooms",
            Field::Floors => "floors",
            Field::CarParking => "car_parking",
        }
    }

    /// What to ask if it is missing.
    pub fn question(self) -> &'static str {
        match self {
            Field::Units => "Are the plot figures in feet or metres?",
            Field::PlotWidth => "How wide is the plot?",
            Field::PlotDepth => "How deep is the plot?",
            Field::RoadFacing => "Which side faces the road?",
            Field::RoadWidth => "How wide is the road?",
            Field::NorthAngle => "How far off north is the plot?",
            Field::Bedrooms => "How many bedrooms?",
            Field::Floors => "How many floors?",
            Field::CarParking => "How many cars?",
        }
    }

    /// Without these there is no plot to lay out, so intake fails rather than guessing.
    pub const REQUIRED: [Field; 3] = [Field::PlotWidth, Field::PlotDepth, Field::Bedrooms];
}

pub type Stated = BTreeSet<Field>;

/// A filled brief, and an honest account of where each value came from.
#[derive(Clone, Debug)]
pub struct Intake {
    pub brief: Brief,
    /// Fields the architect's own words supplied.
    pub stated: Stated,
    /// Repairs applied to a malformed response, for the log. Empty is the common case.
    pub repairs: Vec<String>,
}

impl Intake {
    /// Tier-1 fields nobody stated, which the confirmation card marks for review.
    ///
    /// Optional fields are excluded: a brief that does not mention the road width is not
    /// underspecified, it is ordinary.
    pub fn guessed(&self) -> Vec<Field> {
        [
            Field::Units,
            Field::PlotWidth,
            Field::PlotDepth,
            Field::RoadFacing,
            Field::Bedrooms,
            Field::Floors,
            Field::CarParking,
        ]
        .into_iter()
        .filter(|f| !self.stated.contains(f))
        .collect()
    }

    /// Chips worth surfacing: the ones the brief said nothing about.
    ///
    /// "Where the brief is genuinely underspecified, the tool surfaces a short chip row
    /// above the input rather than a modal. Each chip is one tap, and skipping it accepts
    /// the default."
    pub fn open_chips(&self) -> Vec<(&'static str, &'static str)> {
        let b = &self.brief;
        [
            (
                "all_bedrooms_attached",
                "Attached toilets for all bedrooms?",
                b.all_bedrooms_attached,
            ),
            ("puja", "Puja room?", b.puja),
            ("balcony", "Balcony off the living room?", b.balcony),
            (
                "closed_kitchen",
                "Closed kitchen with utility?",
                b.closed_kitchen,
            ),
            ("vaastu", "Vaastu constraints?", b.vaastu),
        ]
        .into_iter()
        .filter(|(_, _, v)| v.is_none())
        .map(|(k, q, _)| (k, q))
        .collect()
    }
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum IntakeError {
    #[error("the model returned no JSON object: {0}")]
    NotJson(String),
    #[error("the brief does not say {}", .0.iter().map(|f| f.question()).collect::<Vec<_>>().join(" "))]
    Missing(Vec<Field>),
    #[error("{field} is {value}, which is not usable: {why}")]
    OutOfRange {
        field: &'static str,
        value: String,
        why: &'static str,
    },
}

/// Parse a model's reply into a brief.
///
/// Models get this almost right and wrong in the same few ways, so the repairs below are
/// specific and each one is recorded. A silent repair is a lie about what the model did;
/// a refusal over a fenced code block is a tool that works on one provider.
pub fn parse_response(text: &str, stated_hint: Option<&Stated>) -> Result<Intake, IntakeError> {
    let mut repairs = Vec::new();
    let mut obj = extract_object(text, &mut repairs)?;
    coerce(&mut obj, &mut repairs);

    let stated = stated_hint.cloned().unwrap_or_else(|| stated_from(&obj));
    let missing: Vec<Field> = Field::REQUIRED
        .into_iter()
        .filter(|f| !stated.contains(f))
        .collect();
    if !missing.is_empty() {
        return Err(IntakeError::Missing(missing));
    }

    fill_defaults(&mut obj);
    let brief: Brief = serde_json::from_value(Value::Object(obj))
        .map_err(|e| IntakeError::NotJson(e.to_string()))?;
    check_range(&brief)?;

    Ok(Intake {
        brief,
        stated,
        repairs,
    })
}

/// Find the JSON object in a reply that may be wrapped in prose or a fenced block.
fn extract_object(
    text: &str,
    repairs: &mut Vec<String>,
) -> Result<Map<String, Value>, IntakeError> {
    let trimmed = text.trim();
    if let Ok(Value::Object(m)) = serde_json::from_str::<Value>(trimmed) {
        return Ok(m);
    }
    // ```json ... ``` or a sentence either side. Take the outermost braces.
    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    if let (Some(a), Some(b)) = (start, end) {
        if b > a {
            if let Ok(Value::Object(m)) = serde_json::from_str::<Value>(&trimmed[a..=b]) {
                repairs.push("the reply wrapped its JSON in other text".into());
                return Ok(m);
            }
        }
    }
    Err(IntakeError::NotJson(trimmed.chars().take(120).collect()))
}

/// Fix the shapes models produce instead of the schema's.
fn coerce(obj: &mut Map<String, Value>, repairs: &mut Vec<String>) {
    // Numbers as strings: `"plot_width": "30"`.
    //
    // Integer fields are reinserted as integers, not as floats. `serde_json` will not
    // deserialise `3.0` into a `u8`, so coercing every numeric field to `f64` turned one
    // model quirk into a hard parse failure — a repair that broke what it was repairing.
    for (key, integral) in [
        ("plot_width", false),
        ("plot_depth", false),
        ("road_width_m", false),
        ("north_angle_deg", false),
        ("bedrooms", true),
        ("floors", true),
        ("car_parking", true),
    ] {
        if let Some(Value::String(s)) = obj.get(key) {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            if let Ok(n) = cleaned.parse::<f64>() {
                repairs.push(format!("{key} came back as the string {s:?}"));
                let v = if integral {
                    serde_json::json!(n as i64)
                } else {
                    serde_json::json!(n)
                };
                obj.insert(key.into(), v);
            }
        }
    }
    // A model may also send a whole number as a float for an integer field.
    for key in ["bedrooms", "floors", "car_parking"] {
        if let Some(Value::Number(n)) = obj.get(key) {
            if n.as_u64().is_none() {
                if let Some(f) = n.as_f64() {
                    if f.fract() == 0.0 && f >= 0.0 {
                        repairs.push(format!("{key} came back as the float {f}"));
                        obj.insert(key.into(), serde_json::json!(f as u64));
                    }
                }
            }
        }
    }
    // Enums in the wrong case, or spelled out: "North", "NORTH", "north-facing".
    if let Some(Value::String(s)) = obj.get("road_facing") {
        let lower = s.to_ascii_lowercase();
        if let Some(o) = orientation_from(&lower) {
            if *s != o {
                repairs.push(format!("road_facing came back as {s:?}"));
                obj.insert("road_facing".into(), Value::String(o.into()));
            }
        }
    }
    if let Some(Value::String(s)) = obj.get("units") {
        let lower = s.to_ascii_lowercase();
        if let Some(u) = Units::parse(&lower) {
            let canonical = match u {
                Units::Feet => "feet",
                Units::Metres => "metres",
                Units::Millimetres => "millimetres",
            };
            if *s != canonical {
                repairs.push(format!("units came back as {s:?}"));
                obj.insert("units".into(), Value::String(canonical.into()));
            }
        }
    }
    // `null` for a chip is the schema's own "not asked", but some models emit the string.
    for key in [
        "all_bedrooms_attached",
        "puja",
        "balcony",
        "closed_kitchen",
        "vaastu",
    ] {
        match obj.get(key) {
            Some(Value::String(s)) => {
                let v = match s.to_ascii_lowercase().as_str() {
                    "true" | "yes" => Some(true),
                    "false" | "no" => Some(false),
                    _ => None,
                };
                repairs.push(format!("{key} came back as the string {s:?}"));
                obj.insert(key.into(), serde_json::json!(v));
            }
            _ => continue,
        }
    }
}

fn orientation_from(lower: &str) -> Option<&'static str> {
    for (needle, name) in [
        ("north", "north"),
        ("south", "south"),
        ("east", "east"),
        ("west", "west"),
    ] {
        if lower.contains(needle) {
            return Some(name);
        }
    }
    None
}

/// Which tier-1 fields the reply actually carried a value for.
fn stated_from(obj: &Map<String, Value>) -> Stated {
    let mut out = Stated::new();
    for (field, key) in [
        (Field::Units, "units"),
        (Field::PlotWidth, "plot_width"),
        (Field::PlotDepth, "plot_depth"),
        (Field::RoadFacing, "road_facing"),
        (Field::RoadWidth, "road_width_m"),
        (Field::NorthAngle, "north_angle_deg"),
        (Field::Bedrooms, "bedrooms"),
        (Field::Floors, "floors"),
        (Field::CarParking, "car_parking"),
    ] {
        if obj.get(key).is_some_and(|v| !v.is_null()) {
            out.insert(field);
        }
    }
    out
}

/// Values for the tier-1 fields a reply left out, so the form has something to show.
///
/// These are not measurements and the caller knows it: anything filled here is absent
/// from [`Intake::stated`] and comes back marked on the confirmation card.
fn fill_defaults(obj: &mut Map<String, Value>) {
    let defaults = [
        ("units", serde_json::json!("feet")),
        ("road_facing", serde_json::json!("north")),
        ("floors", serde_json::json!(1)),
        ("car_parking", serde_json::json!(1)),
    ];
    for (key, value) in defaults {
        if !obj.get(key).is_some_and(|v| !v.is_null()) {
            obj.insert(key.into(), value);
        }
    }
}

/// Catch the answers that parse but cannot be built.
fn check_range(b: &Brief) -> Result<(), IntakeError> {
    let plot_min = match b.units {
        Units::Feet => 10.0,
        Units::Metres => 3.0,
        Units::Millimetres => 3000.0,
    };
    for (field, v) in [("plot_width", b.plot_width), ("plot_depth", b.plot_depth)] {
        if !v.is_finite() || v < plot_min {
            return Err(IntakeError::OutOfRange {
                field,
                value: format!("{v}"),
                why: "no plot is that small; check the units",
            });
        }
    }
    if !(1..=4).contains(&b.bedrooms) {
        return Err(IntakeError::OutOfRange {
            field: "bedrooms",
            value: b.bedrooms.to_string(),
            why: "the library holds templates for one to four bedrooms",
        });
    }
    if !(1..=4).contains(&b.floors) {
        return Err(IntakeError::OutOfRange {
            field: "floors",
            value: b.floors.to_string(),
            why: "ground to G+3",
        });
    }
    Ok(())
}
