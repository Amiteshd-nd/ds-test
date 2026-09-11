//! Classification rules as **data**, not code.
//!
//! PRD anti-pattern: "Do not accept a hardcoded layer-name string in the classifier.
//! Every office names layers differently." So the classifier holds no strings at all —
//! it evaluates a [`RuleSet`] that is loaded from JSON, and every native object records
//! which rule id fired (invariant **I4**).
//!
//! Signal priority is PRD Prompt 3: layer name, then block name, then linetype and
//! lineweight, then geometry heuristics as a last resort. Priority is expressed as a
//! numeric `weight` on each rule so a site-specific rule set can override the defaults
//! without editing the classifier.

use serde::{Deserialize, Serialize};

/// What a matched entity becomes.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Classification {
    Wall,
    Door,
    Window,
    /// Text, dimensions, hatching, title blocks — carried but not built.
    Annotation,
    /// Deliberately excluded: grid lines, viewports, construction geometry.
    Ignored,
    /// Nothing matched. This is a *result*, not a failure to record — an unclassified
    /// entity is visible in the report rather than silently dropped.
    Unknown,
}

/// How a rule inspects an entity.
///
/// Internally tagged on `on`, so a rule reads as a flat object in JSON. Every variant
/// therefore has to be a struct or a struct-like newtype — that is why the geometry
/// predicate is `{ value, extra }` rather than a tuple variant.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(tag = "on", rename_all = "snake_case")]
pub enum Match {
    /// Layer name. The dominant signal in real drawings.
    Layer(TextMatch),
    /// Block reference name, for doors and windows inserted as blocks.
    BlockName(TextMatch),
    LineType(TextMatch),
    /// Lineweight in 1/100 mm, as DXF stores it. Walls are often drawn heavy.
    LineWeightAtLeast {
        value: i16,
    },
    /// Last resort (PRD Prompt 3, signal 4). Kept a distinct variant so that a rule set
    /// leaning on geometry is visibly doing so when you read the file.
    Geometry {
        value: GeometryKind,
        /// Threshold for the predicates that need one, in millimetres.
        #[serde(default)]
        extra: i64,
    },
    /// All of the inner matches must hold.
    All {
        value: Vec<Match>,
    },
    Any {
        value: Vec<Match>,
    },
    Not {
        value: Box<Match>,
    },
}

#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(tag = "how", content = "value", rename_all = "snake_case")]
pub enum TextMatch {
    Equals(String),
    StartsWith(String),
    EndsWith(String),
    Contains(String),
    /// Matches AutoCAD-style layer patterns: `*` is any run of characters, `?` is one.
    /// A deliberate choice over full regex — layer conventions are glob-shaped, and a
    /// regex in a config file is a debugging liability for whoever maintains it.
    Glob(String),
}

impl TextMatch {
    /// Comparison is case-insensitive: DXF layer names are conventionally uppercase but
    /// nothing enforces it, and a rule set that breaks on `A-Wall` vs `A-WALL` is a
    /// support ticket waiting to happen.
    pub fn matches(&self, subject: &str) -> bool {
        let s = subject.to_ascii_uppercase();
        match self {
            TextMatch::Equals(v) => s == v.to_ascii_uppercase(),
            TextMatch::StartsWith(v) => s.starts_with(&v.to_ascii_uppercase()),
            TextMatch::EndsWith(v) => s.ends_with(&v.to_ascii_uppercase()),
            TextMatch::Contains(v) => s.contains(&v.to_ascii_uppercase()),
            TextMatch::Glob(v) => glob_match(&v.to_ascii_uppercase(), &s),
        }
    }
}

/// Iterative glob matcher with backtracking on `*`. Linear in practice, and it cannot
/// blow the stack on a pathological pattern arriving from a config file.
fn glob_match(pattern: &str, subject: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let s: Vec<char> = subject.chars().collect();
    let (mut pi, mut si) = (0usize, 0usize);
    let (mut star, mut backtrack) = (usize::MAX, 0usize);

    while si < s.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == s[si]) {
            pi += 1;
            si += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = pi;
            backtrack = si;
            pi += 1;
        } else if star != usize::MAX {
            pi = star + 1;
            backtrack += 1;
            si = backtrack;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// Geometry predicates. Unit variants only — the threshold rides in `Match::Geometry.extra`.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeometryKind {
    /// Polyline with exactly two points — a bare wall line in a sloppy drawing.
    OpenTwoPoint,
    Closed,
    /// Total length at least `extra` millimetres.
    LongerThanMm,
    ShorterThanMm,
    IsBlockReference,
    IsText,
    IsArcOrCurve,
}

#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct Rule {
    /// Stable identifier, recorded in provenance so a reviewer can ask "why is this a
    /// wall?" and get an answer that names the rule.
    pub id: String,
    /// Human-readable explanation, surfaced in the UI alongside the classification.
    pub because: String,
    #[serde(rename = "match")]
    pub matcher: Match,
    pub becomes: Classification,
    /// Higher wins. PRD Prompt 3's signal priority, expressed as data:
    /// layer 400, block 300, linetype/lineweight 200, geometry 100.
    pub weight: i32,
    /// Whether a match on this rule should be treated as certain. Layer-name and
    /// block-name matches are `Inferred`; geometry guesses stay `Assumed` so they show
    /// up as questionable in the provenance report (I4).
    pub confidence: Confidence,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    /// The drawing said so about as directly as a drawing can.
    Strong,
    /// A guess that a drafter would probably agree with.
    Weak,
}

impl Confidence {
    pub fn provenance(self) -> tri_doc::Provenance {
        match self {
            // Even a strong rule is an inference: the drawing said "layer A-WALL", not
            // "this is a wall". Nothing from classification is ever Measured.
            Confidence::Strong => tri_doc::Provenance::Inferred,
            Confidence::Weak => tri_doc::Provenance::Assumed,
        }
    }
}

#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
pub struct RuleSet {
    pub name: String,
    pub rules: Vec<Rule>,
    /// Wall height when the drawing does not say. Always emitted as `Assumed` with the
    /// reason naming this field — "do not let a default become a fact".
    pub default_wall_height_mm: i64,
    /// Wall thickness when polyline pairing fails.
    pub default_wall_thickness_mm: i64,
    /// Endpoint-snapping tolerance for the healing stage, in millimetres.
    pub heal_tolerance_mm: i64,
}

impl RuleSet {
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("RuleSet is always serialisable")
    }

    /// The shipped starting point, modelled on the US National CAD Standard layer
    /// convention (`A-WALL`, `A-DOOR`, `A-GLAZ`, `A-ANNO`). It is a *default*, not a
    /// truth: an office with its own convention replaces the file, not the code.
    pub fn ncs_default() -> Self {
        RuleSet::from_json(include_str!("../rules/ncs-default.json"))
            .expect("the bundled default rule set must parse")
    }

    /// Rules in evaluation order: heaviest first, then by id so that two rules of equal
    /// weight resolve deterministically rather than by file order.
    pub fn ordered(&self) -> Vec<&Rule> {
        let mut v: Vec<&Rule> = self.rules.iter().collect();
        v.sort_by(|a, b| b.weight.cmp(&a.weight).then_with(|| a.id.cmp(&b.id)));
        v
    }

    pub fn get(&self, id: &str) -> Option<&Rule> {
        self.rules.iter().find(|r| r.id == id)
    }
}
