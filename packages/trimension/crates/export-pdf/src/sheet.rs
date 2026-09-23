//! Paper, scale and the title block.

/// A sheet size, in millimetres of paper.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Paper {
    A4Landscape,
    A3Landscape,
    A2Landscape,
}

impl Paper {
    pub fn size_mm(self) -> (f64, f64) {
        match self {
            Paper::A4Landscape => (297.0, 210.0),
            Paper::A3Landscape => (420.0, 297.0),
            Paper::A2Landscape => (594.0, 420.0),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Paper::A4Landscape => "A4 landscape",
            Paper::A3Landscape => "A3 landscape",
            Paper::A2Landscape => "A2 landscape",
        }
    }
}

/// The scales an architect will accept on a residential plan.
///
/// A drawing is never scaled to fit. It is drawn at one of these and the sheet is chosen
/// to suit, because the whole value of a printed plan is that a scale rule works on it —
/// "1:87 to fit the page" is a picture of a building, not a drawing of one.
pub const SCALES: [i64; 5] = [50, 75, 100, 150, 200];

/// Margin from the paper edge to the drawing frame.
pub const MARGIN_MM: f64 = 10.0;
/// Height of the title block strip along the bottom.
pub const TITLE_BLOCK_MM: f64 = 34.0;

/// Everything the sheet needs that is not geometry.
#[derive(Clone, Debug, Default)]
pub struct TitleBlock {
    pub project: String,
    pub plot: String,
    pub drawing: String,
    pub date: String,
    pub revision: String,
    /// The compliance authority line. Printed verbatim, always.
    pub authority: String,
    /// "Indicative only. Verify against the sanctioning authority before submission."
    pub disclaimer: String,
    /// A short compliance summary: FAR, coverage.
    pub facts: Vec<(String, String)>,
}

/// Paper and scale chosen together.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Fit {
    pub paper: Paper,
    pub scale_denominator: i64,
}

impl Fit {
    /// The drawing area, in millimetres of paper: `(x, y, width, height)`.
    pub fn frame(self) -> (f64, f64, f64, f64) {
        let (w, h) = self.paper.size_mm();
        (
            MARGIN_MM,
            MARGIN_MM + TITLE_BLOCK_MM,
            w - 2.0 * MARGIN_MM,
            h - 2.0 * MARGIN_MM - TITLE_BLOCK_MM,
        )
    }

    /// Millimetres of paper per micrometre of building.
    pub fn paper_per_um(self) -> f64 {
        1.0 / (1000.0 * self.scale_denominator as f64)
    }
}

/// Pick the largest scale that fits the drawing on the smallest paper.
///
/// Tried scale-first rather than paper-first: an architect would rather have A2 at 1:100
/// than A3 at 1:150, because 1:100 is the scale they can read without thinking.
pub fn choose(width_um: i64, depth_um: i64, papers: &[Paper]) -> Fit {
    for &scale in SCALES.iter() {
        for &paper in papers {
            let fit = Fit {
                paper,
                scale_denominator: scale,
            };
            let (_, _, fw, fh) = fit.frame();
            let w = width_um as f64 / (1000.0 * scale as f64);
            let d = depth_um as f64 / (1000.0 * scale as f64);
            // A little air around the drawing, for dimension strings.
            if w <= fw - 24.0 && d <= fh - 24.0 {
                return fit;
            }
        }
    }
    // Nothing in the table fits. The largest paper at the smallest scale is the honest
    // fallback — the drawing runs to the frame rather than being silently shrunk to a
    // scale no rule measures.
    Fit {
        paper: *papers.last().unwrap_or(&Paper::A2Landscape),
        scale_denominator: *SCALES.last().unwrap_or(&200),
    }
}
