//! Unit resolution — "the classic failure mode here" (PRD Prompt 3).
//!
//! DXF carries units in `$INSUNITS`, which is frequently `Unitless` even in drawings
//! that plainly use millimetres, and occasionally just wrong. The rule enforced here is
//! that a guess is never silently applied: every path returns a
//! [`Tracked<i64>`](tri_doc::Tracked) whose provenance says exactly how confident we are
//! and why, and an `Assumed` scale surfaces in the UI as a thing to check.

use tri_doc::{Provenance, Tracked};

/// Micrometres per source unit.
pub const UM_PER_MM: i64 = 1_000;
pub const UM_PER_CM: i64 = 10_000;
pub const UM_PER_M: i64 = 1_000_000;
pub const UM_PER_INCH: i64 = 25_400;
pub const UM_PER_FOOT: i64 = 304_800;

/// A drawing whose extents are outside this range in *assumed millimetres* is almost
/// certainly not in millimetres. 100mm to 1km spans a cupboard to a runway.
const PLAUSIBLE_MIN_MM: f64 = 100.0;
const PLAUSIBLE_MAX_MM: f64 = 1_000_000.0;

/// Resolve the scale from `$INSUNITS`, falling back to an extents heuristic.
///
/// `max_extent` is the largest absolute coordinate seen in the drawing, in raw source
/// units — the only evidence available when the header is silent.
pub fn resolve(insunits: dxf::enums::Units, max_extent: f64) -> Tracked<i64> {
    use dxf::enums::Units::*;

    let declared = match insunits {
        Millimeters => Some((UM_PER_MM, "millimetres")),
        Centimeters => Some((UM_PER_CM, "centimetres")),
        Meters => Some((UM_PER_M, "metres")),
        Inches => Some((UM_PER_INCH, "inches")),
        Feet => Some((UM_PER_FOOT, "feet")),
        _ => None,
    };

    if let Some((scale, name)) = declared {
        // Trust the header, but say so if the result is implausible rather than
        // producing a building the size of a postage stamp without comment.
        let extent_mm = max_extent * scale as f64 / UM_PER_MM as f64;
        if extent_mm > 0.0 && !(PLAUSIBLE_MIN_MM..=PLAUSIBLE_MAX_MM).contains(&extent_mm) {
            return Tracked::inferred(
                scale,
                format!(
                    "$INSUNITS says {name}, but that puts the drawing extents at {extent_mm:.0}mm \
                     which is outside the plausible range {PLAUSIBLE_MIN_MM:.0}mm-{PLAUSIBLE_MAX_MM:.0}mm; \
                     header honoured, please verify"
                ),
            );
        }
        return Tracked::measured(scale, format!("$INSUNITS = {name}"));
    }

    // No usable header. Guess from extents and be loud about it.
    let reason_prefix = match insunits {
        Unitless => "$INSUNITS is Unitless",
        other => {
            return Tracked::assumed(
                UM_PER_MM,
                format!(
                    "$INSUNITS = {other:?}, which this importer does not handle; \
                     assumed millimetres"
                ),
            )
        }
    };

    if max_extent <= 0.0 {
        return Tracked::assumed(
            UM_PER_MM,
            format!("{reason_prefix} and the drawing has no extents; assumed millimetres"),
        );
    }

    // Try each candidate and pick the one that lands in the plausible range.
    for (scale, name) in [
        (UM_PER_MM, "millimetres"),
        (UM_PER_M, "metres"),
        (UM_PER_INCH, "inches"),
        (UM_PER_FOOT, "feet"),
        (UM_PER_CM, "centimetres"),
    ] {
        let extent_mm = max_extent * scale as f64 / UM_PER_MM as f64;
        if (PLAUSIBLE_MIN_MM..=PLAUSIBLE_MAX_MM).contains(&extent_mm) {
            return Tracked::assumed(
                scale,
                format!(
                    "{reason_prefix}; extents of {max_extent:.1} source units are only \
                     plausible as {name} ({extent_mm:.0}mm overall) — verify before building"
                ),
            );
        }
    }

    Tracked::assumed(
        UM_PER_MM,
        format!(
            "{reason_prefix} and extents of {max_extent:.1} units are implausible at every \
             candidate scale; assumed millimetres — this drawing needs a human"
        ),
    )
}

/// Convert a source-unit coordinate to document µm.
pub fn to_um(value: f64, scale: i64) -> i64 {
    (value * scale as f64).round() as i64
}

/// Did unit resolution end up as a guess?
pub fn is_guess(t: &Tracked<i64>) -> bool {
    t.provenance() != Provenance::Measured
}
