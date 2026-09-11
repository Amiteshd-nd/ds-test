//! Camera and view modes.

use serde::{Deserialize, Serialize};
use tri_doc::{Length, Point2};

/// Vertical field of view for the perspective view, in degrees. Shared by the camera fit
/// and the projection so they cannot disagree about how much fits on screen.
pub const PERSPECTIVE_FOV_DEG: f64 = 40.0;

/// The four views a drafter expects on screen at once.
///
/// The three orthographic modes share one projection with different basis vectors, so a
/// change to framing or clipping cannot make plan and elevation disagree. Perspective is
/// deliberately **two-point**, not free orbit — see [`ViewMode::TwoPointPerspective`].
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewMode {
    /// Top-down orthographic. Looking along −Z, north up.
    PlanView2d,
    /// Orthographic from −X looking along +X. Screen right is +Y, screen up is +Z.
    ElevationLeft,
    /// Orthographic from +X looking along −X. Screen right is −Y, screen up is +Z.
    ElevationRight,
    /// Two-point perspective.
    ///
    /// The distinction from a free orbit matters and is not cosmetic. Two-point means the
    /// view direction is **horizontal** and the picture plane **vertical**, so vertical
    /// edges stay vertical and parallel and the scene has exactly two vanishing points.
    /// Tilt the camera and every vertical converges to a third vanishing point, which is
    /// what makes a casual 3D orbit look wrong to anyone who draws buildings for a living.
    ///
    /// So pitch is not a parameter here: the eye sits at [`Camera::eye_height_um`] and
    /// looks level, and only `yaw_mdeg` moves it around the model.
    TwoPointPerspective,
}

impl ViewMode {
    pub fn is_orthographic(self) -> bool {
        !matches!(self, ViewMode::TwoPointPerspective)
    }

    /// Does this view show extruded solids?
    pub fn shows_solids(self) -> bool {
        !matches!(self, ViewMode::PlanView2d)
    }

    pub fn label(self) -> &'static str {
        match self {
            ViewMode::PlanView2d => "plan",
            ViewMode::ElevationLeft => "left elevation",
            ViewMode::ElevationRight => "right elevation",
            ViewMode::TwoPointPerspective => "two-point perspective",
        }
    }

    pub const ALL: [ViewMode; 4] = [
        ViewMode::PlanView2d,
        ViewMode::ElevationLeft,
        ViewMode::ElevationRight,
        ViewMode::TwoPointPerspective,
    ];
}

/// A camera. Integer-valued so that two clients asking for "the same view" get
/// byte-identical images — a float camera would make the parity test (I6) flaky for
/// reasons that have nothing to do with the renderer.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Camera {
    /// What the centre of the image looks at, in document µm.
    pub centre: Point2,
    /// Zoom, in µm per pixel. Larger means further out.
    pub um_per_px: i64,
    pub width_px: u32,
    pub height_px: u32,
    /// Perspective only: which way round the model the eye stands, in milli-degrees.
    pub yaw_mdeg: i32,
    /// Perspective only: eye distance from the model centre, in µm.
    pub distance_um: i64,
    /// Perspective only: eye height above the base. 1600mm is standing eye level, which
    /// is the convention for an architectural two-point view.
    pub eye_height_um: i64,
    /// Vertical extent of the model, in µm. Elevations need it to frame; plan ignores it.
    pub z_min_um: i64,
    pub z_max_um: i64,
}

impl Default for Camera {
    fn default() -> Self {
        Camera {
            centre: Point2::new(Length::ZERO, Length::ZERO),
            um_per_px: 10_000, // 10mm per pixel
            width_px: 1280,
            height_px: 800,
            yaw_mdeg: 35_000,
            distance_um: 20_000_000,
            eye_height_um: 1_600_000,
            z_min_um: 0,
            z_max_um: 2_700_000,
        }
    }
}

impl Camera {
    /// Frame the given bounds with a 5% margin. Rounds *up* to a whole µm/px so the
    /// result is reproducible rather than depending on float rounding.
    pub fn fit(bounds: Bounds, width_px: u32, height_px: u32) -> Camera {
        Camera::fit_for(
            bounds,
            0,
            2_700_000,
            width_px,
            height_px,
            ViewMode::PlanView2d,
        )
    }

    /// Frame the model for a specific view.
    ///
    /// Each mode measures a different pair of world axes: plan sees X and Y, the
    /// elevations see Y and Z. Fitting them with one function is what keeps the four
    /// viewports at comparable scales instead of each inventing its own.
    pub fn fit_for(
        bounds: Bounds,
        z_min_um: i64,
        z_max_um: i64,
        width_px: u32,
        height_px: u32,
        mode: ViewMode,
    ) -> Camera {
        let z_span = (z_max_um - z_min_um).max(1);
        let (span_x, span_y) = match mode {
            ViewMode::PlanView2d | ViewMode::TwoPointPerspective => {
                (bounds.width_um().max(1), bounds.height_um().max(1))
            }
            // An elevation looks along X, so it measures the model's Y extent across the
            // screen and its Z extent up it.
            ViewMode::ElevationLeft | ViewMode::ElevationRight => {
                (bounds.height_um().max(1), z_span)
            }
        };

        // Manual ceiling division: i64::div_ceil is still unstable on 1.98.
        let ceil_div = |a: i64, b: i64| (a + b - 1) / b.max(1);
        let by_x = ceil_div(span_x, width_px.max(1) as i64);
        let by_y = ceil_div(span_y, height_px.max(1) as i64);
        let um_per_px = (by_x.max(by_y) * 115 / 100).max(1);

        // Perspective distance, derived from the actual field of view rather than a
        // bounding sphere. A sphere fit is the easy version and it frames a building
        // badly: buildings are wide and flat, so the sphere is dominated by the plan
        // diagonal and the camera ends up far enough back that the model occupies a
        // quarter of the frame.
        //
        // Instead: solve the distance separately for the horizontal and vertical extents
        // at [`PERSPECTIVE_FOV_DEG`] and take whichever is further, plus a margin.
        let aspect = width_px.max(1) as f64 / height_px.max(1) as f64;
        let half_v = (PERSPECTIVE_FOV_DEG / 2.0).to_radians();
        let half_h = (half_v.tan() * aspect).atan();

        // Worst case the eye looks along the plan diagonal, so that is the width to fit.
        let diagonal =
            ((bounds.width_um() as f64).powi(2) + (bounds.height_um() as f64).powi(2)).sqrt();
        let need_h = (diagonal / 2.0) / half_h.tan().max(1e-6);
        let need_v = (z_span as f64 / 2.0) / half_v.tan().max(1e-6);

        // Those two solve for the extent *at the model centre*. Under perspective the
        // near corner is closer than that and projects larger, so a camera placed at
        // exactly `need` clips the corners off. Backing off by half the depth of the
        // model puts the near face at the fitted distance instead of the middle.
        let half_depth = diagonal / 2.0;
        let distance_um = (((need_h.max(need_v) + half_depth) * 1.1) as i64).max(3_000_000);

        Camera {
            centre: bounds.centre(),
            um_per_px,
            width_px,
            height_px,
            z_min_um,
            z_max_um,
            distance_um,
            ..Camera::default()
        }
    }

    /// Orthographic half-extents in µm.
    pub fn half_extent_um(&self) -> (i64, i64) {
        (
            self.um_per_px * self.width_px as i64 / 2,
            self.um_per_px * self.height_px as i64 / 2,
        )
    }

    pub fn aspect(&self) -> f32 {
        self.width_px.max(1) as f32 / self.height_px.max(1) as f32
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
pub struct Bounds {
    pub min: Point2,
    pub max: Point2,
}

impl Bounds {
    pub fn from_points(points: impl IntoIterator<Item = Point2>) -> Option<Bounds> {
        let mut it = points.into_iter();
        let first = it.next()?;
        let mut b = Bounds {
            min: first,
            max: first,
        };
        for p in it {
            b.include(p);
        }
        Some(b)
    }

    pub fn include(&mut self, p: Point2) {
        if p.x < self.min.x {
            self.min.x = p.x;
        }
        if p.y < self.min.y {
            self.min.y = p.y;
        }
        if p.x > self.max.x {
            self.max.x = p.x;
        }
        if p.y > self.max.y {
            self.max.y = p.y;
        }
    }

    pub fn width_um(&self) -> i64 {
        self.max.x.as_um() - self.min.x.as_um()
    }

    pub fn height_um(&self) -> i64 {
        self.max.y.as_um() - self.min.y.as_um()
    }

    pub fn centre(&self) -> Point2 {
        Point2::new(
            Length::from_um((self.min.x.as_um() + self.max.x.as_um()) / 2),
            Length::from_um((self.min.y.as_um() + self.max.y.as_um()) / 2),
        )
    }
}
