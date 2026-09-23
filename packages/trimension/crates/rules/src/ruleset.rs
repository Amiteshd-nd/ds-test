//! The ruleset: bylaws as versioned data.
//!
//! Nothing here encodes a number. The numbers live in `rulesets/*.json`, each carrying
//! the authority that issued them and the date they took effect, so a plan can always
//! answer "which revision am I looking at?" — which architects need for their own
//! reasons, not only ours.

use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Authority {
    /// "BBMP", "BDA", "CMDA".
    pub name: String,
    /// The revision this file encodes.
    pub revision: String,
    /// ISO date the revision took effect.
    pub effective: String,
    /// Has a practising architect in this jurisdiction checked it?
    ///
    /// Recorded because the honest answer is usually "no", and an unreviewed ruleset
    /// presented as authoritative is the risk the PRD names. The UI shows this.
    pub reviewed_by: Option<String>,
    pub notes: String,
}

/// Setbacks and coverage for one plot-area band.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct SetbackBand {
    /// Inclusive lower bound of the band, in m².
    pub min_area_sqm: i64,
    /// Exclusive upper bound. `None` is the open-ended top band.
    pub max_area_sqm: Option<i64>,
    pub front_mm: i64,
    pub rear_mm: i64,
    pub side_mm: i64,
    /// Ground coverage limit, percentage × 100.
    pub coverage_x100: i64,
    /// The clause this row comes from.
    pub clause: String,
}

/// Permissible FAR for a band of road widths.
///
/// Separate from [`SetbackBand`] because the two are indexed by different things: BBMP
/// sets back by plot area and grants floor area by the width of the road the plot fronts.
/// Folding them into one table would force a fiction about which one a row belongs to.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct FarBand {
    /// Inclusive lower bound, in metres.
    pub min_road_width_m: i64,
    /// Exclusive upper bound. `None` is the open-ended top band.
    pub max_road_width_m: Option<i64>,
    /// FAR × 1000.
    pub far_x1000: i64,
    pub clause: String,
}

/// Minimum dimensions a habitable space must meet.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct MinimumRoom {
    pub kind: String,
    pub min_area_mm2: i64,
    pub min_width_mm: i64,
    pub clause: String,
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct RuleSet {
    pub authority: Authority,
    pub bands: Vec<SetbackBand>,
    pub far_bands: Vec<FarBand>,
    pub minimum_rooms: Vec<MinimumRoom>,
    pub staircase_min_width_mm: i64,
    pub staircase_min_headroom_mm: i64,
    /// Riser and tread the footprint is worked out from.
    pub staircase_riser_mm: i64,
    pub staircase_tread_mm: i64,
    /// Litres per occupant per day, and how occupancy is estimated from the brief.
    pub water_litres_per_person_day: i64,
    pub occupants_per_bedroom: i64,
    /// Overhead tank as a fraction of daily demand, percent. The rest sits in the sump.
    pub overhead_share_pct: i64,
    /// Shown verbatim wherever compliance is displayed.
    pub disclaimer: String,
}

#[derive(Debug, thiserror::Error)]
pub enum RuleSetError {
    #[error("could not parse the ruleset: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("no band in {authority} covers a plot of {area_sqm} m²")]
    NoBand { authority: String, area_sqm: i64 },
    #[error("no FAR band in {authority} covers a {road_width_m} m road")]
    NoFarBand {
        authority: String,
        road_width_m: i64,
    },
}

impl RuleSet {
    pub fn from_json(s: &str) -> Result<RuleSet, RuleSetError> {
        Ok(serde_json::from_str(s)?)
    }

    /// The bundled BBMP plotted-residential ruleset.
    ///
    /// **Not reviewed by a practising architect.** The file says so and the UI surfaces
    /// it. Treat every number in it as a placeholder with the right shape until someone
    /// qualified has signed it off.
    pub fn bbmp_plotted_residential() -> RuleSet {
        RuleSet::from_json(include_str!("../rulesets/bbmp-plotted-residential.json"))
            .expect("the bundled ruleset must parse")
    }

    pub fn band_for(&self, area_sqm: i64) -> Result<&SetbackBand, RuleSetError> {
        self.bands
            .iter()
            .find(|b| area_sqm >= b.min_area_sqm && b.max_area_sqm.is_none_or(|max| area_sqm < max))
            .ok_or_else(|| RuleSetError::NoBand {
                authority: self.authority.name.clone(),
                area_sqm,
            })
    }

    pub fn far_for(&self, road_width_m: i64) -> Result<&FarBand, RuleSetError> {
        self.far_bands
            .iter()
            .find(|b| {
                road_width_m >= b.min_road_width_m
                    && b.max_road_width_m.is_none_or(|max| road_width_m < max)
            })
            .ok_or_else(|| RuleSetError::NoFarBand {
                authority: self.authority.name.clone(),
                road_width_m,
            })
    }

    pub fn minimum_for(&self, kind: &str) -> Option<&MinimumRoom> {
        self.minimum_rooms.iter().find(|m| m.kind == kind)
    }

    /// "BBMP 2024 revision, effective 2024-04-01 — not reviewed".
    pub fn provenance_line(&self) -> String {
        let a = &self.authority;
        let reviewed = match &a.reviewed_by {
            Some(who) => format!("reviewed by {who}"),
            None => "NOT reviewed by a practising architect".to_string(),
        };
        format!(
            "{} {}, effective {} — {reviewed}",
            a.name, a.revision, a.effective
        )
    }
}
