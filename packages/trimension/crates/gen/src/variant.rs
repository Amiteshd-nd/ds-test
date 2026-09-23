//! Variations on a template, so there is something to choose between.
//!
//! F5 asks for three or four options per generation. The library does not hold four
//! topologies for every bedroom count and should not pretend to — a topology is a design
//! somebody drew, and inventing three more per count to fill a strip of thumbnails would
//! be exactly the "output looks naive to a trained eye" failure in a new costume.
//!
//! So an option is a template *and* a variant. The two variations here are both real
//! choices an architect makes rather than noise:
//!
//! - **Emphasis** shifts depth between the public rooms and the private ones. Every band
//!   still claims its ruleset minimum first, so a heavier emphasis takes from the surplus
//!   and can never push a room under code.
//! - **Mirroring** flips the plan about its own centreline. On a plot with a neighbour on
//!   one side, or a gate off-centre, which side the kitchen and corridor sit is the whole
//!   question.
//!
//! Variants are ordered last in [`crate::options::candidates`], so they only appear when
//! the library has no second topology to offer.

use crate::template::Layout;
use tri_doc::{Length, Point2};

/// Where the surplus depth goes.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Emphasis {
    #[default]
    Balanced,
    /// A larger living and dining room, at the bedrooms' expense.
    Living,
    /// Larger bedrooms, at the living room's expense.
    Bedrooms,
}

impl Emphasis {
    /// Multiplier on a band's share, as a percentage. Applied to `share_pct` before the
    /// surplus is divided, so it only ever moves *surplus* — the minimums are already
    /// claimed by then and cannot be taken back.
    pub(crate) fn weight_pct(&self, role: BandRole) -> i64 {
        match (self, role) {
            (Emphasis::Balanced, _) | (_, BandRole::Service) => 100,
            (Emphasis::Living, BandRole::Public) => 150,
            (Emphasis::Living, BandRole::Private) => 75,
            (Emphasis::Bedrooms, BandRole::Public) => 75,
            (Emphasis::Bedrooms, BandRole::Private) => 150,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Emphasis::Balanced => "balanced",
            Emphasis::Living => "larger living",
            Emphasis::Bedrooms => "larger bedrooms",
        }
    }
}

/// What a band is for, read off the rooms in it rather than declared.
///
/// Derived rather than stored so that a new template cannot get it wrong by forgetting
/// to set a field. A band holding a living room is public; one holding a bedroom is
/// private; anything else is service.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum BandRole {
    Public,
    Private,
    Service,
}

impl BandRole {
    pub(crate) fn of(band: &crate::template::Band) -> BandRole {
        if band.cells.iter().any(|c| c.kind == "bedroom") {
            BandRole::Private
        } else if band.cells.iter().any(|c| c.kind == "living") {
            BandRole::Public
        } else {
            BandRole::Service
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Variant {
    pub emphasis: Emphasis,
    /// Flipped left-to-right about the envelope centreline.
    pub mirrored: bool,
}

impl Variant {
    pub const DEFAULT: Variant = Variant {
        emphasis: Emphasis::Balanced,
        mirrored: false,
    };

    pub fn is_default(&self) -> bool {
        *self == Variant::DEFAULT
    }

    /// How to describe this variant beside the template's own name.
    pub fn label(&self) -> String {
        match (self.emphasis, self.mirrored) {
            (Emphasis::Balanced, false) => String::new(),
            (Emphasis::Balanced, true) => "mirrored".into(),
            (e, false) => e.label().into(),
            (e, true) => format!("{}, mirrored", e.label()),
        }
    }
}

impl Layout {
    /// Flip the layout about the vertical centreline of its own envelope.
    ///
    /// A pure coordinate transform applied after the solve, not a second layout path.
    /// Mirroring inside the solver would mean every band and cell rule had a left-handed
    /// twin to keep in step; here there is one function, and `mirror(mirror(l)) == l` is
    /// a test.
    pub fn mirrored(mut self) -> Layout {
        let (lo, hi) = (self.envelope_min.x.as_um(), self.envelope_max.x.as_um());
        let flip = |p: Point2| Point2::new(Length::from_um(lo + hi - p.x.as_um()), p.y);
        for w in &mut self.walls {
            // Swap the ends too, so a wall keeps running in the same direction around the
            // envelope. Nothing downstream depends on it, and a reversed front wall would
            // be a confusing thing to find later.
            let (a, b) = (flip(w.b), flip(w.a));
            w.a = a;
            w.b = b;
            w.reason = format!("{} [mirrored]", w.reason);
        }
        for c in &mut self.cells {
            // Only x moves. Taking `flip(c.max)` wholesale would carry `max.y` into
            // `min` and invert the cell's depth — which is how the first version of this
            // produced a -24 m² living room that then ranked *first*, because a room with
            // a negative short side is not awkward to furnish either.
            let (lo_x, hi_x) = (lo + hi - c.max.x.as_um(), lo + hi - c.min.x.as_um());
            c.min = Point2::new(Length::from_um(lo_x), c.min.y);
            c.max = Point2::new(Length::from_um(hi_x), c.max.y);
        }
        let width = hi - lo;
        self.entry_offset = Length::from_um(width - self.entry_offset.as_um());
        self.mirrored = true;
        self
    }
}
