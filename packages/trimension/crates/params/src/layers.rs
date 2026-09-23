//! The DXF layer scheme — a tier 3 default, not a set of constants.
//!
//! Layer names are the first thing an architect notices when a file opens, and every
//! office has its own convention. Hardcoding them in the exporter is the same mistake as
//! hardcoding them in the importer's classifier (PRD §4.6): it works for one practice and
//! is a support ticket for every other. They live in the parameter set so they are
//! editable, versioned by commits, and visible in settings.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Where each kind of geometry lands in the exported file.
#[derive(
    Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize, JsonSchema,
)]
pub struct LayerScheme {
    pub walls: String,
    pub doors: String,
    pub windows: String,
    pub dimensions: String,
    pub text: String,
    pub furniture: String,
    pub grid: String,
    /// Closed wall outlines, for poché.
    ///
    /// Not in the PRD's tier 3 list, and added deliberately. The wall itself is exported
    /// on [`walls`](Self::walls) as a polyline carrying its thickness, which is a single
    /// unambiguous representation that reads back exactly. The closed outline is a second
    /// drawing of the same wall, kept because the PRD asks for closed polylines and
    /// because that is what an architect hatches.
    ///
    /// It sits on its own layer so re-importing our own file does not find each wall
    /// twice — once as a centreline and once as an outline — and quietly double the
    /// building. The bundled rule set classifies this layer as reference geometry.
    pub wall_hatch: String,
}

impl Default for LayerScheme {
    /// US National CAD Standard names, which is the convention the bundled classifier
    /// rule set also reads. Export and import therefore agree out of the box.
    fn default() -> Self {
        LayerScheme {
            walls: "A-WALL".into(),
            doors: "A-DOOR".into(),
            windows: "A-GLAZ".into(),
            dimensions: "A-ANNO-DIMS".into(),
            text: "A-ANNO-TEXT".into(),
            furniture: "A-FURN".into(),
            grid: "A-GRID".into(),
            wall_hatch: "A-WALL-PATT".into(),
        }
    }
}

impl LayerScheme {
    /// Every layer name, for creating them up front in the exported file.
    pub fn all(&self) -> [&str; 8] {
        [
            &self.walls,
            &self.wall_hatch,
            &self.doors,
            &self.windows,
            &self.dimensions,
            &self.text,
            &self.furniture,
            &self.grid,
        ]
    }
}
