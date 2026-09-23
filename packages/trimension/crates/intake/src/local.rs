//! Intake with no model at all.
//!
//! # Why this exists
//! Three reasons, in order of how much they matter.
//!
//! 1. **The eval needs a floor.** The PRD's done-when is thirty briefs parsing correctly.
//!    Run only against a hosted model, that number measures the model. Run against this
//!    first, it measures the schema, the coercions and the range checks — the parts that
//!    are ours to get wrong — and gives every model a baseline to beat.
//! 2. **The PRD leaves a question open**: "Is there a hosted default LLM for users
//!    without a key, and who pays for it?" This is one answer that costs nothing: the
//!    common brief shapes are a small grammar, and an architect typing *3BHK on a 30x40
//!    north facing site* should not need an account to see a plan.
//! 3. It is the offline path. A tool that cannot open without a network call is a worse
//!    tool.
//!
//! # What it is not
//! It is not an LLM and does not pretend to be. It reads the shapes below and reports
//! anything else as not stated, which is what [`Intake::stated`](crate::Intake::stated)
//! is for. A brief it cannot read produces a question, never a guess.

use crate::parse::{Field, Intake, IntakeError, Stated};
use serde_json::{Map, Value};

/// Parse a brief with no model.
pub fn parse(text: &str) -> Result<Intake, IntakeError> {
    let lower = text.to_ascii_lowercase();
    let mut obj = Map::new();

    if let Some((w, d, units)) = dimensions(&lower) {
        obj.insert("plot_width".into(), serde_json::json!(w));
        obj.insert("plot_depth".into(), serde_json::json!(d));
        if let Some(u) = units {
            obj.insert("units".into(), Value::String(u.into()));
        }
    }
    if let Some(n) = bedrooms(&lower) {
        obj.insert("bedrooms".into(), serde_json::json!(n));
    }
    if let Some(f) = floors(&lower) {
        obj.insert("floors".into(), serde_json::json!(f));
    }
    if let Some(o) = facing(&lower) {
        obj.insert("road_facing".into(), Value::String(o.into()));
    }
    if let Some(r) = road_width_m(&lower) {
        obj.insert("road_width_m".into(), serde_json::json!(r));
    }
    if let Some(c) = car_parking(&lower) {
        obj.insert("car_parking".into(), serde_json::json!(c));
    }
    for (key, yes, no) in CHIPS {
        if let Some(v) = chip(&lower, yes, no) {
            obj.insert((*key).into(), serde_json::json!(v));
        }
    }

    // The same validation the model path takes. Sharing it is the point: a brief that
    // parses here and not there would mean two definitions of a valid brief.
    let stated = stated_of(&obj);
    let text = Value::Object(obj).to_string();
    crate::parse::parse_response(&text, Some(&stated))
}

fn stated_of(obj: &Map<String, Value>) -> Stated {
    let mut out = Stated::new();
    for (field, key) in [
        (Field::Units, "units"),
        (Field::PlotWidth, "plot_width"),
        (Field::PlotDepth, "plot_depth"),
        (Field::RoadFacing, "road_facing"),
        (Field::RoadWidth, "road_width_m"),
        (Field::Bedrooms, "bedrooms"),
        (Field::Floors, "floors"),
        (Field::CarParking, "car_parking"),
    ] {
        if obj.contains_key(key) {
            out.insert(field);
        }
    }
    out
}

/// Words a unit can arrive as, longest first so "metres" is not read as "m".
const FOOT_WORDS: [&str; 5] = ["feet", "foot", "ft", "'", "sqft"];
const METRE_WORDS: [&str; 5] = ["metres", "meters", "metre", "meter", "m"];

/// `30x40`, `30 x 40`, `30 by 40`, `9.1 × 12.2 m`.
fn dimensions(s: &str) -> Option<(f64, f64, Option<&'static str>)> {
    let c: Vec<char> = s.chars().collect();
    for i in 0..c.len() {
        // Only start at the first digit of a run, so "30" is not also tried as "0".
        if i > 0 && (c[i - 1].is_ascii_digit() || c[i - 1] == '.') {
            continue;
        }
        let Some((a, after_a)) = number_at(&c, i) else {
            continue;
        };
        let j = skip_spaces(&c, after_a);
        let Some(sep_len) = separator(&c, j) else {
            continue;
        };
        let k = skip_spaces(&c, j + sep_len);
        let Some((b, after_b)) = number_at(&c, k) else {
            continue;
        };
        // A unit word may follow either number: "30 ft x 40 ft" or "30x40 feet".
        let tail: String = c[after_b..c.len().min(after_b + 12)].iter().collect();
        let between: String = c[after_a..k.min(c.len())].iter().collect();
        return Some((a, b, unit_word(&tail).or_else(|| unit_word(&between))));
    }
    None
}

fn number_at(c: &[char], i: usize) -> Option<(f64, usize)> {
    if i >= c.len() || !c[i].is_ascii_digit() {
        return None;
    }
    let mut j = i;
    while j < c.len() && (c[j].is_ascii_digit() || c[j] == '.') {
        j += 1;
    }
    let s: String = c[i..j].iter().collect();
    s.parse().ok().map(|n| (n, j))
}

fn skip_spaces(c: &[char], mut i: usize) -> usize {
    while i < c.len() && c[i] == ' ' {
        i += 1;
    }
    i
}

/// Length of the separator at `i`, if there is one.
fn separator(c: &[char], i: usize) -> Option<usize> {
    if i >= c.len() {
        return None;
    }
    if c[i] == 'x' || c[i] == '×' || c[i] == '*' {
        return Some(1);
    }
    let rest: String = c[i..c.len().min(i + 3)].iter().collect();
    if rest.starts_with("by ") {
        return Some(2);
    }
    // "30 ft x 40": step over a unit word sitting between the number and the separator.
    for w in FOOT_WORDS.iter().chain(METRE_WORDS.iter()) {
        if rest.starts_with(w) {
            let after = skip_spaces(c, i + w.chars().count());
            if after < c.len() && (c[after] == 'x' || c[after] == '×' || c[after] == '*') {
                return Some(after + 1 - i);
            }
        }
    }
    None
}

fn unit_word(s: &str) -> Option<&'static str> {
    let t = s.trim_start();
    for w in FOOT_WORDS {
        if t.starts_with(w) {
            return Some("feet");
        }
    }
    for w in METRE_WORDS {
        if t.starts_with(w) {
            // Guard against "3bhk on a 9 x 12 modern plot" reading "modern" as metres.
            let after: Vec<char> = t.chars().skip(w.chars().count()).take(1).collect();
            if after.first().is_none_or(|c| !c.is_ascii_alphabetic()) {
                return Some("metres");
            }
        }
    }
    None
}

/// `3bhk`, `3 bhk`, `3 bedroom`, `three bedroom`.
fn bedrooms(s: &str) -> Option<u8> {
    for (i, _) in s.match_indices("bhk") {
        if let Some(n) = number_before(s, i) {
            return Some(n as u8);
        }
    }
    for needle in ["bedroom", "bed room", " br "] {
        for (i, _) in s.match_indices(needle) {
            if let Some(n) = number_before(s, i) {
                return Some(n as u8);
            }
            if let Some(n) = word_number_before(s, i) {
                return Some(n);
            }
        }
    }
    None
}

/// `g+1`, `ground + 1`, `two floors`, `duplex`, `single storey`.
fn floors(s: &str) -> Option<u8> {
    if let Some(i) = s.find("g+") {
        if let Some((n, _)) = number_at(&s.chars().collect::<Vec<_>>(), i + 2) {
            return Some(n as u8 + 1);
        }
    }
    if let Some(i) = s.find("ground + ") {
        if let Some((n, _)) = number_at(&s.chars().collect::<Vec<_>>(), i + 9) {
            return Some(n as u8 + 1);
        }
    }
    for needle in ["floors", "floor", "storey", "storeys", "storied", "story"] {
        for (i, _) in s.match_indices(needle) {
            if let Some(n) = number_before(s, i) {
                return Some(n as u8);
            }
            if let Some(n) = word_number_before(s, i) {
                return Some(n);
            }
        }
    }
    if s.contains("duplex") {
        return Some(2);
    }
    if s.contains("ground floor only") || s.contains("single storey") {
        return Some(1);
    }
    None
}

fn facing(s: &str) -> Option<&'static str> {
    // "north facing" and "facing north" both occur, and "east-west" does not mean a side.
    for name in ["north", "south", "east", "west"] {
        for (i, _) in s.match_indices(name) {
            let after: String = s.chars().skip(i + name.len()).take(9).collect();
            let before_start = i.saturating_sub(8);
            let before = &s[before_start..i];
            // `after` is already trimmed, so these must not carry a leading space.
            // The first version compared " side" against "side road" and matched nothing.
            let a = after.trim_start().trim_start_matches('-');
            if a.starts_with("facing")
                || a.starts_with("side")
                || a.starts_with("road")
                || before.contains("facing")
            {
                return Some(name);
            }
        }
    }
    None
}

/// `9m road`, `40 ft road`, `road width 12 m`.
fn road_width_m(s: &str) -> Option<f64> {
    for (i, _) in s.match_indices("road") {
        // "12 m road" — look back.
        if let Some((n, unit)) = measured_before(s, i) {
            return Some(if unit == "feet" { n * 0.3048 } else { n });
        }
        // "road width 12 m" — look forward.
        let rest: Vec<char> = s.chars().skip(i).collect();
        for k in 0..rest.len().min(20) {
            if let Some((n, after)) = number_at(&rest, k) {
                let tail: String = rest[after..rest.len().min(after + 8)].iter().collect();
                let unit = unit_word(&tail).unwrap_or("metres");
                return Some(if unit == "feet" { n * 0.3048 } else { n });
            }
        }
    }
    None
}

fn car_parking(s: &str) -> Option<u8> {
    for needle in ["car parking", "car park", "cars", "car"] {
        for (i, _) in s.match_indices(needle) {
            if let Some(n) = number_before(s, i) {
                return Some(n as u8);
            }
            if let Some(n) = word_number_before(s, i) {
                return Some(n);
            }
        }
    }
    None
}

/// Chip words: `(key, words that mean yes, words that mean no)`.
const CHIPS: &[(&str, &[&str], &[&str])] = &[
    (
        "all_bedrooms_attached",
        &[
            "attached toilet",
            "attached bath",
            "all en suite",
            "en-suite",
        ],
        &["common toilet only", "shared toilet"],
    ),
    (
        "puja",
        &["puja", "pooja", "prayer room"],
        &["no puja", "no pooja"],
    ),
    ("balcony", &["balcony", "balconies"], &["no balcony"]),
    (
        "closed_kitchen",
        &["closed kitchen", "separate kitchen"],
        &["open kitchen", "island kitchen"],
    ),
    ("vaastu", &["vaastu", "vastu"], &["no vaastu", "no vastu"]),
];

fn chip(s: &str, yes: &[&str], no: &[&str]) -> Option<bool> {
    // "no" wins: "no balcony" contains "balcony".
    if no.iter().any(|w| s.contains(w)) {
        return Some(false);
    }
    if yes.iter().any(|w| s.contains(w)) {
        return Some(true);
    }
    None
}

/// The number immediately before position `i`, skipping spaces and a hyphen.
fn number_before(s: &str, i: usize) -> Option<f64> {
    let c: Vec<char> = s[..i].chars().collect();
    let mut j = c.len();
    while j > 0 && (c[j - 1] == ' ' || c[j - 1] == '-') {
        j -= 1;
    }
    let end = j;
    while j > 0 && (c[j - 1].is_ascii_digit() || c[j - 1] == '.') {
        j -= 1;
    }
    if j == end {
        return None;
    }
    c[j..end].iter().collect::<String>().parse().ok()
}

/// A number and its unit immediately before `i`: "12 m road".
fn measured_before(s: &str, i: usize) -> Option<(f64, &'static str)> {
    let head = &s[..i];
    let trimmed = head.trim_end();
    for w in FOOT_WORDS.iter().chain(METRE_WORDS.iter()) {
        if let Some(stripped) = trimmed.strip_suffix(w) {
            let unit = if FOOT_WORDS.contains(w) {
                "feet"
            } else {
                "metres"
            };
            if let Some(n) = number_before(s, stripped.trim_end().len()) {
                return Some((n, unit));
            }
            // "12m" with no space.
            let c: Vec<char> = stripped.chars().collect();
            let mut j = c.len();
            while j > 0 && (c[j - 1].is_ascii_digit() || c[j - 1] == '.') {
                j -= 1;
            }
            if j < c.len() {
                if let Ok(n) = c[j..].iter().collect::<String>().parse() {
                    return Some((n, unit));
                }
            }
        }
    }
    None
}

const WORD_NUMBERS: [(&str, u8); 5] = [
    ("one", 1),
    ("two", 2),
    ("three", 3),
    ("four", 4),
    ("five", 5),
];

fn word_number_before(s: &str, i: usize) -> Option<u8> {
    let head = s[..i].trim_end();
    for (w, n) in WORD_NUMBERS {
        if head.ends_with(w) {
            return Some(n);
        }
    }
    None
}
