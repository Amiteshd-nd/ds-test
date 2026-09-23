//! Directional preferences as versioned data.
//!
//! The same argument the bylaws get, for the same reason: "Rules live in a versioned JSON
//! ruleset, never in application code." Vaastu has a stronger version of it — there is no
//! single authority, schools disagree, and a client's own consultant may want different
//! preferences entirely. Encoding one school in Rust would make that a code change.

use crate::compass::Sector;
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Preference {
    /// The room vocabulary, plus `bedroom-master` and `entry` which are positions rather
    /// than room kinds.
    pub kind: String,
    #[serde(default)]
    pub prefer: Vec<String>,
    #[serde(default)]
    pub accept: Vec<String>,
    #[serde(default)]
    pub avoid: Vec<String>,
    /// How much this preference counts. Higher is stronger.
    pub weight: u32,
    /// Shown on hover, so a score is never a bare number.
    pub source: String,
}

impl Preference {
    pub fn verdict(&self, sector: Sector) -> Match {
        let name = sector.as_str();
        if self.prefer.iter().any(|s| s == name) {
            Match::Prefer
        } else if self.avoid.iter().any(|s| s == name) {
            Match::Avoid
        } else if self.accept.iter().any(|s| s == name) {
            Match::Accept
        } else {
            Match::Neutral
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Match {
    Prefer,
    Accept,
    Neutral,
    Avoid,
}

impl Match {
    /// Points out of the preference's weight. Deliberately not symmetric: being in the
    /// wrong place costs more than being in the right place gains, because the complaints
    /// a client makes are all about the avoid list.
    pub fn points(self) -> i32 {
        match self {
            Match::Prefer => 2,
            Match::Accept => 1,
            Match::Neutral => 0,
            Match::Avoid => -3,
        }
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct RuleSet {
    pub authority: String,
    pub revision: String,
    /// `None` until a practising consultant has actually looked at this file.
    pub reviewed_by: Option<String>,
    pub note: String,
    /// How much of the plot counts as the central *brahmasthan*, as a percentage of the
    /// shorter side.
    pub centre_fraction_pct: i64,
    pub preferences: Vec<Preference>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum RuleSetError {
    #[error("the Vaastu ruleset could not be read: {0}")]
    Unreadable(String),
}

impl RuleSet {
    /// The bundled preferences. Placeholder data — see [`RuleSet::provenance_line`].
    pub fn traditional() -> RuleSet {
        serde_json::from_str(include_str!("../rulesets/traditional-v0.json"))
            .expect("the bundled Vaastu ruleset is valid")
    }

    pub fn parse(json: &str) -> Result<RuleSet, RuleSetError> {
        serde_json::from_str(json).map_err(|e| RuleSetError::Unreadable(e.to_string()))
    }

    pub fn preference(&self, kind: &str) -> Option<&Preference> {
        self.preferences.iter().find(|p| p.kind == kind)
    }

    /// Shown wherever a score is. Says out loud that nobody qualified has checked this.
    pub fn provenance_line(&self) -> String {
        match &self.reviewed_by {
            Some(who) => format!("{} {} — reviewed by {who}", self.authority, self.revision),
            None => format!(
                "{} {} — NOT reviewed by a practising consultant, and not a building code",
                self.authority, self.revision
            ),
        }
    }
}
