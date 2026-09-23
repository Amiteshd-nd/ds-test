//! Scoring a layout against directional preferences.

use crate::compass::Compass;
use crate::ruleset::{Match, RuleSet};
use serde::Serialize;

/// One room, as this crate needs to see it.
#[derive(Clone, Debug)]
pub struct Room<'a> {
    /// `kitchen`, `toilet`, `living`, `bedroom`, or `bedroom-master` / `entry` for the two
    /// positions that are not room kinds.
    pub kind: &'a str,
    pub name: &'a str,
    /// Centre of the room, in micrometres, in document coordinates.
    pub cx_um: i64,
    pub cy_um: i64,
}

/// Where one room landed and what the ruleset makes of it.
#[derive(Clone, Debug, Serialize)]
pub struct Placement {
    pub name: String,
    pub kind: String,
    pub sector: String,
    /// `prefer`, `accept`, `neutral` or `avoid`.
    pub verdict: Verdict,
    /// Why the ruleset cares, verbatim from the data.
    pub source: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Prefer,
    Accept,
    Neutral,
    Avoid,
}

impl From<Match> for Verdict {
    fn from(m: Match) -> Verdict {
        match m {
            Match::Prefer => Verdict::Prefer,
            Match::Accept => Verdict::Accept,
            Match::Neutral => Verdict::Neutral,
            Match::Avoid => Verdict::Avoid,
        }
    }
}

/// What the layer has to say about one layout. Never a refusal — see the crate docs.
#[derive(Clone, Debug, Serialize)]
pub struct Assessment {
    /// 0 to 100. A layout with nothing the ruleset recognises scores 50: it is not good
    /// and it is not bad, and rounding it to either would be an opinion nobody formed.
    pub score: u8,
    pub placements: Vec<Placement>,
    /// The rooms in a sector the ruleset asks them to avoid, named for the panel.
    pub conflicts: Vec<String>,
    /// "Traditional Vaastu, common South Indian residential practice placeholder-v0 —
    /// NOT reviewed by a practising consultant, and not a building code."
    pub authority: String,
}

impl Assessment {
    /// A sentence for the option card.
    pub fn summary(&self) -> String {
        match self.conflicts.len() {
            0 if self.score >= 70 => format!("Vaastu {}%, nothing misplaced", self.score),
            0 => format!("Vaastu {}%", self.score),
            1 => format!("Vaastu {}%, {} is misplaced", self.score, self.conflicts[0]),
            n => format!("Vaastu {}%, {n} rooms misplaced", self.score),
        }
    }
}

/// Score a layout.
///
/// `half_width_um` and `half_depth_um` are the envelope's half-extents, used to find the
/// plot centre's neighbourhood. `centre` is the envelope centre in document coordinates.
pub fn assess(
    rooms: &[Room<'_>],
    compass: Compass,
    centre: (i64, i64),
    half_extent_um: (i64, i64),
    rules: &RuleSet,
) -> Assessment {
    // The brahmasthan, as a fraction of the *shorter* half-extent: on a long narrow plot
    // the centre is a small square rather than a long ellipse.
    let radius = half_extent_um.0.min(half_extent_um.1) * rules.centre_fraction_pct / 100;

    let mut placements = Vec::new();
    let mut conflicts = Vec::new();
    let mut got: i32 = 0;
    let mut possible: i32 = 0;

    for room in rooms {
        let Some(pref) = rules.preference(room.kind) else {
            // A kind the ruleset says nothing about — a corridor, a utility. Not scored,
            // not penalised, not silently counted as a miss.
            continue;
        };
        let sector = compass.sector(room.cx_um - centre.0, room.cy_um - centre.1, radius);
        let m = pref.verdict(sector);
        got += m.points() * pref.weight as i32;
        possible += Match::Prefer.points() * pref.weight as i32;
        if m == Match::Avoid {
            conflicts.push(format!("{} in the {}", room.name, sector.as_str()));
        }
        placements.push(Placement {
            name: room.name.to_string(),
            kind: room.kind.to_string(),
            sector: sector.as_str().to_string(),
            verdict: m.into(),
            source: pref.source.clone(),
        });
    }

    // Map the signed total onto 0..100. The worst case is every room on its avoid list.
    let score = if possible == 0 {
        50
    } else {
        let worst = Match::Avoid.points().abs() * possible / Match::Prefer.points();
        let span = possible + worst;
        (((got + worst) * 100) / span).clamp(0, 100) as u8
    };

    Assessment {
        score,
        placements,
        conflicts,
        authority: rules.provenance_line(),
    }
}
