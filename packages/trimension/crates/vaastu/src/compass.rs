//! Turning a position on the plot into a compass sector.

use serde::{Deserialize, Serialize};

/// The eight sectors, plus the middle of the plot.
///
/// The centre — *brahmasthan* — is a sector in its own right in every school, and is
/// preferably left open. Folding it into one of the eight would lose that.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Sector {
    North,
    NorthEast,
    East,
    SouthEast,
    South,
    SouthWest,
    West,
    NorthWest,
    Centre,
}

impl Sector {
    pub fn as_str(self) -> &'static str {
        match self {
            Sector::North => "north",
            Sector::NorthEast => "north-east",
            Sector::East => "east",
            Sector::SouthEast => "south-east",
            Sector::South => "south",
            Sector::SouthWest => "south-west",
            Sector::West => "west",
            Sector::NorthWest => "north-west",
            Sector::Centre => "centre",
        }
    }

    pub fn parse(s: &str) -> Option<Sector> {
        Some(match s {
            "north" => Sector::North,
            "north-east" => Sector::NorthEast,
            "east" => Sector::East,
            "south-east" => Sector::SouthEast,
            "south" => Sector::South,
            "south-west" => Sector::SouthWest,
            "west" => Sector::West,
            "north-west" => Sector::NorthWest,
            "centre" => Sector::Centre,
            _ => return None,
        })
    }
}

/// How the plot's own axes sit against true north.
///
/// The document's +Y runs away from the road, because that is how the templates lay a plot
/// out. Everything here is in millidegrees clockwise from true north, matching
/// `ParameterSet::north_angle_mdeg`, so no floating point enters the conversion.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Compass {
    /// Bearing of the document's +Y axis.
    pub plus_y_mdeg: i32,
}

impl Compass {
    /// From the side the road is on, and the plot's own deviation from true north.
    ///
    /// **A "north-facing plot" has the road to its north**, so the building faces north and
    /// the document's +Y — which runs away from the road — points *south*. Getting that
    /// backwards would put every room in the opposite sector and the whole layer would be
    /// confidently wrong rather than obviously broken, which is why it is spelled out here
    /// and asserted in a test.
    pub fn new(road_facing: &str, north_angle_mdeg: i32) -> Compass {
        let base = match road_facing {
            "north" => 180_000,
            "east" => 270_000,
            "south" => 0,
            "west" => 90_000,
            // An unknown orientation is treated as north-facing rather than refused. This
            // crate does not get to stop a plan over a spelling.
            _ => 180_000,
        };
        Compass {
            plus_y_mdeg: wrap(base + north_angle_mdeg),
        }
    }

    /// Which sector a point sits in, given its offset from the plot's centre.
    ///
    /// `radius_um` is the distance from the centre inside which a room counts as central.
    pub fn sector(self, dx_um: i64, dy_um: i64, radius_um: i64) -> Sector {
        if dx_um * dx_um + dy_um * dy_um <= radius_um * radius_um {
            return Sector::Centre;
        }
        // Bearing of the offset within the plot's own frame: 0 along +Y, increasing
        // clockwise towards +X.
        let plot_bearing = (dx_um as f64).atan2(dy_um as f64).to_degrees() * 1000.0;
        let mdeg = wrap(self.plus_y_mdeg + plot_bearing.round() as i32);
        // Eight 45° sectors centred on the cardinals, so north is -22.5°..+22.5°.
        let index = (((mdeg + 22_500) / 45_000) % 8) as usize;
        [
            Sector::North,
            Sector::NorthEast,
            Sector::East,
            Sector::SouthEast,
            Sector::South,
            Sector::SouthWest,
            Sector::West,
            Sector::NorthWest,
        ][index]
    }
}

fn wrap(mdeg: i32) -> i32 {
    mdeg.rem_euclid(360_000)
}
