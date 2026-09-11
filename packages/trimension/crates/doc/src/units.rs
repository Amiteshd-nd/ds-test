//! Fixed-point length. **Deviation from the PRD — read the reasoning.**
//!
//! The PRD does not specify a coordinate representation, but M1 requires a document hash
//! that is deterministic *across targets*. Floating point cannot deliver that once M4
//! starts computing values: `wasm32` and `x86_64` differ on libm implementations and on
//! FMA contraction, and Manifold's C++ booleans are worse. A hash test written against
//! `f64` passes at M1 (nothing is computed yet) and breaks at M4, which is the most
//! expensive possible time to find out.
//!
//! So coordinates are `i64` micrometres. Range is ±9.2e12 µm — about ±9.2 million
//! kilometres, which is enough building. Resolution is 1 µm, roughly 10⁴ times finer
//! than any drafting tolerance. Addition and subtraction are exact, comparison is exact,
//! and the healing tolerance in PRD §4.5 becomes an integer comparison rather than an
//! epsilon that gets re-argued every few months.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::ops::{Add, Neg, Sub};

/// A length in micrometres. Exact under `+`, `-` and comparison.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize)]
pub struct Length(i64);

impl Length {
    pub const ZERO: Length = Length(0);

    pub const fn from_um(um: i64) -> Self {
        Length(um)
    }

    pub const fn from_mm(mm: i64) -> Self {
        Length(mm * 1_000)
    }

    pub const fn from_m(m: i64) -> Self {
        Length(m * 1_000_000)
    }

    /// Lossy: only for import boundaries and rendering. Never for stored geometry.
    pub fn from_mm_f64(mm: f64) -> Self {
        Length((mm * 1_000.0).round() as i64)
    }

    pub const fn as_um(self) -> i64 {
        self.0
    }

    pub fn as_mm_f64(self) -> f64 {
        self.0 as f64 / 1_000.0
    }

    pub const fn abs(self) -> Self {
        Length(self.0.abs())
    }

    /// Saturating so that a malformed import cannot panic the document.
    pub fn scaled(self, numerator: i64, denominator: i64) -> Self {
        debug_assert!(denominator != 0);
        Length(
            (self.0 as i128 * numerator as i128 / denominator.max(1) as i128)
                .clamp(i64::MIN as i128, i64::MAX as i128) as i64,
        )
    }
}

impl Add for Length {
    type Output = Length;
    fn add(self, rhs: Length) -> Length {
        Length(self.0.saturating_add(rhs.0))
    }
}

impl Sub for Length {
    type Output = Length;
    fn sub(self, rhs: Length) -> Length {
        Length(self.0.saturating_sub(rhs.0))
    }
}

impl Neg for Length {
    type Output = Length;
    fn neg(self) -> Length {
        Length(self.0.saturating_neg())
    }
}

impl fmt::Debug for Length {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}mm", self.as_mm_f64())
    }
}

/// A 2D point in document space.
#[derive(
    Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default, Serialize, Deserialize,
)]
pub struct Point2 {
    pub x: Length,
    pub y: Length,
}

impl Point2 {
    pub const fn new(x: Length, y: Length) -> Self {
        Point2 { x, y }
    }

    /// Squared distance in µm². `i128` because µm² overflows `i64` at ~3km.
    pub fn dist_sq(self, other: Point2) -> i128 {
        let dx = (self.x.as_um() - other.x.as_um()) as i128;
        let dy = (self.y.as_um() - other.y.as_um()) as i128;
        dx * dx + dy * dy
    }
}
