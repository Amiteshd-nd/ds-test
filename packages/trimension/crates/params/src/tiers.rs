//! The three intake tiers, and their fixed relationship to provenance.

use serde::{Deserialize, Serialize};
use tri_doc::Provenance;

/// Which question a parameter answers.
///
/// The PRD's rule is "ask only tier 1, compute tier 2 and show the reasoning, default
/// tier 3 silently and expose it in settings". The UI decides what to render from this;
/// the provenance follows from it mechanically, which is what stops the two drifting.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Must be asked. Cannot be guessed, and generation cannot start without it.
    Ask,
    /// Derived from tier 1 plus a rule. Pre-filled, editable, shown with its reasoning.
    Derive,
    /// A default. Never asked on first run; lives in settings.
    Default,
}

impl Tier {
    /// The provenance a value carries when it arrives through this tier.
    ///
    /// One-way and total: there is no tier whose values are unprovenanced, and no way to
    /// record a tier-3 default as anything other than `Assumed`.
    pub fn provenance(self) -> Provenance {
        match self {
            Tier::Ask => Provenance::Measured,
            Tier::Derive => Provenance::Inferred,
            Tier::Default => Provenance::Assumed,
        }
    }

    /// Should the intake form show this on first run?
    pub fn asked_on_first_run(self) -> bool {
        self == Tier::Ask
    }

    pub fn label(self) -> &'static str {
        match self {
            Tier::Ask => "entered",
            Tier::Derive => "derived",
            Tier::Default => "default",
        }
    }
}
