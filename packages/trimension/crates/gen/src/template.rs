//! Templates as data, and the one solver that lays any of them out.
//!
//! A template is not a function that draws a plan. It is a stack of **bands** running
//! from the road to the rear of the plot, each band split across into **cells**, plus an
//! optional full-depth **spine** for circulation down one side. [`Template::instantiate`]
//! is the only code that turns any of that into geometry.
//!
//! That split is the whole design, and it is a direct consequence of F3. Every defect
//! that phase turned up lived in the band arithmetic — the envelope not inset by half a
//! wall, a band sized from its target area instead of its minimum — and all of them were
//! invisible in the drawing. Writing that arithmetic once per template would have meant
//! four chances to reintroduce each one. Here a new template is a `Vec<Band>` and cannot
//! contain an arithmetic bug, because it contains no arithmetic.
//!
//! The library itself lives in [`crate::library`].

use tri_doc::{Length, Point2};
use tri_params::ParameterSet;
use tri_rules::RuleSet;

/// How a cell claims width inside its band.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Width {
    /// Millimetres, fixed regardless of the plot.
    ///
    /// For fixtures. A toilet does not get more useful as the plot gets wider — the first
    /// version of the 2BHK made both toilets a fraction of the frontage and produced a
    /// 6.7 m² bathroom next to a 4.9 m² kitchen, which is exactly the "looks naive to a
    /// trained eye" failure the PRD names as the likeliest way this product dies.
    Fixed(i64),
    /// A relative weight on whatever the fixed cells leave.
    ///
    /// For rooms you live in. A share cell never falls below the ruleset's minimum width
    /// for its kind; it claims that first and shares only the surplus.
    Share(i64),
    /// A share with a ceiling. Width beyond `max_mm` goes to the uncapped cells beside it.
    ///
    /// The middle case, and the one the first library missed. A toilet is `Fixed` because
    /// it never wants more room; a living room is `Share` because it always does. A
    /// kitchen is neither: it needs to grow off a 5m frontage and stops improving at
    /// about three metres, past which it is just a longer walk between the hob and the
    /// sink. Without this, a 60x80 plot produced a 5.5m-wide, 25.6 m² kitchen — the same
    /// "looks naive to a trained eye" failure as F1's 6.7 m² bathroom, wearing a
    /// different size.
    Capped { weight: i64, max_mm: i64 },
}

impl Width {
    /// The weight this cell carries when surplus width is shared out.
    fn weight(&self) -> i64 {
        match self {
            Width::Fixed(_) => 0,
            Width::Share(w) | Width::Capped { weight: w, .. } => *w,
        }
    }
}

/// One room in a band.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CellSpec {
    pub name: &'static str,
    /// The room vocabulary `tri-rules` checks against. An unknown kind is not an error —
    /// it simply has no minimum — which is how circulation gets to exist.
    pub kind: &'static str,
    pub width: Width,
}

/// A strip across the plot, full width unless the spine takes a bite out of it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Band {
    /// Used in error messages, so a refusal names the strip that did not fit.
    pub name: &'static str,
    /// This band's weight when the surplus depth is shared out.
    pub share_pct: i64,
    pub cells: Vec<CellSpec>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Left,
    Right,
}

/// A circulation strip running front-to-rear along one side.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Spine {
    pub name: &'static str,
    pub width_mm: i64,
    pub side: Side,
    /// The band the spine starts at. Bands before it are full width.
    ///
    /// Almost always 1: you enter the living room from the road and the corridor leads
    /// off the back of it. A corridor that started at the front wall would need its own
    /// door and would waste the frontage.
    pub from_band: usize,
}

/// A layout topology. Front (road) to rear.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Template {
    pub id: &'static str,
    /// What to call it on the approval card.
    pub label: &'static str,
    pub bedrooms: u8,
    /// Main door position along the frontage, as a percentage of the buildable width.
    pub entry_pct: i64,
    pub bands: Vec<Band>,
    pub spine: Option<Spine>,
}

/// A rectangular room in plan.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Cell {
    pub name: &'static str,
    pub kind: &'static str,
    pub min: Point2,
    pub max: Point2,
}

impl Cell {
    pub fn width(&self) -> Length {
        Length::from_um(self.max.x.as_um() - self.min.x.as_um())
    }

    pub fn depth(&self) -> Length {
        Length::from_um(self.max.y.as_um() - self.min.y.as_um())
    }

    pub fn area_mm2(&self) -> i64 {
        let w = self.width().as_um() as i128 / 1_000;
        let d = self.depth().as_um() as i128 / 1_000;
        (w * d) as i64
    }
}

/// A wall centreline the template wants built.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct WallLine {
    pub a: Point2,
    pub b: Point2,
    pub external: bool,
    /// Why this wall is here, for the provenance record.
    pub reason: String,
}

impl WallLine {
    pub fn length(&self) -> Length {
        Length::from_um(
            (self.b.x.as_um() - self.a.x.as_um()).abs()
                + (self.b.y.as_um() - self.a.y.as_um()).abs(),
        )
    }
}

/// An instantiated template.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Layout {
    pub template_id: &'static str,
    /// The buildable rectangle after setbacks and the half-wall inset.
    pub envelope_min: Point2,
    pub envelope_max: Point2,
    pub walls: Vec<WallLine>,
    pub cells: Vec<Cell>,
    /// Distance along the front wall to the centre of the main door.
    pub entry_offset: Length,
    /// Whether [`Layout::mirrored`] has been applied. Carried so the option's label and
    /// the wall provenance can say so.
    pub mirrored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TemplateError {
    #[error(
        "the buildable envelope is {have_mm}mm wide after setbacks; the {band} band needs \
         at least {need_mm}mm to hold its rooms at the ruleset's minimum widths"
    )]
    TooNarrow {
        band: &'static str,
        have_mm: i64,
        need_mm: i64,
    },
    #[error(
        "the buildable envelope is {have_mm}mm deep after setbacks; this template needs at \
         least {need_mm}mm to clear the ruleset's room minimums"
    )]
    TooShallow { have_mm: i64, need_mm: i64 },
    #[error("the setbacks leave no buildable envelope: {width_mm}x{depth_mm}mm")]
    NoEnvelope { width_mm: i64, depth_mm: i64 },
    #[error(
        "template bug: the {band} band is built entirely from Fixed cells, so it cannot \
         stretch to fill the plot. Give one of its rooms a Share width."
    )]
    BandCannotStretch { band: &'static str },
}

impl Template {
    /// Lay this template into the plot's buildable envelope.
    ///
    /// The envelope comes from the setbacks in the parameter set, which come from the
    /// ruleset. If tier 2 has not been derived those setbacks are zero, so
    /// [`crate::plan`] refuses before reaching here — a plan laid out against no setback
    /// is not conservative, it is wrong.
    pub fn instantiate(&self, p: &ParameterSet, rules: &RuleSet) -> Result<Layout, TemplateError> {
        self.instantiate_with(p, rules, crate::Variant::DEFAULT)
    }

    /// Lay this template out under a variant.
    ///
    /// Emphasis reweights the bands before the surplus depth is divided; mirroring is a
    /// coordinate transform applied to the finished layout. Neither can push a room under
    /// the ruleset, because both act only on the surplus that the minimums have already
    /// been taken out of.
    pub fn instantiate_with(
        &self,
        p: &ParameterSet,
        rules: &RuleSet,
        variant: crate::Variant,
    ) -> Result<Layout, TemplateError> {
        // Road at the front (y = 0). Setbacks inset the buildable rectangle, and the
        // external wall is inset a further half-thickness.
        //
        // The half-thickness matters and the first version of this left it out. A setback
        // is a limit on *built form*, so the outer face of the wall has to land on the
        // building line — putting the centreline there pushes half the wall beyond it.
        // Every plan the generator produced was in breach of all four setbacks by 115mm,
        // and nothing noticed until the compliance check went in.
        let face = p.external_wall.get().as_um() / 2;
        let x0 = p.setback_left.get().as_um() + face;
        let y0 = p.setback_front.get().as_um() + face;
        let x1 = p.plot_width.get().as_um() - p.setback_right.get().as_um() - face;
        let y1 = p.plot_depth.get().as_um() - p.setback_rear.get().as_um() - face;

        let width = x1 - x0;
        let depth = y1 - y0;
        if width <= 0 || depth <= 0 {
            return Err(TemplateError::NoEnvelope {
                width_mm: width / 1_000,
                depth_mm: depth / 1_000,
            });
        }

        let spine_um = self.spine.map(|s| s.width_mm * 1_000).unwrap_or(0);
        let from_band = self.spine.map(|s| s.from_band).unwrap_or(usize::MAX);

        // 1. Widths. They depend only on the envelope, so they are settled first and the
        //    depth pass can ask each cell how deep it has to be at the width it got.
        let mut widths: Vec<Vec<i64>> = Vec::with_capacity(self.bands.len());
        for (i, band) in self.bands.iter().enumerate() {
            let avail = if i >= from_band {
                width - spine_um
            } else {
                width
            };
            widths.push(solve_widths(band, avail, rules)?);
        }

        // 2. Depths. Each band claims the depth its rooms need to clear the ruleset, and
        //    the surplus is shared in the template's own proportions, so a generous plot
        //    still reads like the template.
        //
        //    Both halves of that were learned the hard way. A pure proportional split put
        //    a bedroom at 9.48 m² against a 9.50 m² minimum — two centimetres short, on an
        //    ordinary plot, caught only because the compliance check happened to run.
        //    Sizing the band to the programme's *target* instead swung the other way and
        //    squeezed the living room to 1.96 m deep. The minimum is the constraint; the
        //    target is an aspiration, and only one of them belongs in a floor.
        let floors: Vec<i64> = self
            .bands
            .iter()
            .zip(&widths)
            .map(|(band, ws)| {
                band.cells
                    .iter()
                    .zip(ws)
                    .map(|(c, w)| depth_for(rules, c.kind, *w))
                    .max()
                    .unwrap_or(0)
            })
            .collect();
        let need: i64 = floors.iter().sum();
        if depth < need {
            return Err(TemplateError::TooShallow {
                have_mm: depth / 1_000,
                need_mm: need / 1_000,
            });
        }
        let surplus = depth - need;
        let share = |b: &Band| {
            b.share_pct * variant.emphasis.weight_pct(crate::variant::BandRole::of(b)) / 100
        };
        let total_pct: i64 = self.bands.iter().map(share).sum::<i64>().max(1);
        let mut depths = floors.clone();
        let mut given = 0;
        let last = self.bands.len() - 1;
        for (i, d) in depths.iter_mut().enumerate() {
            if i == last {
                // The last band absorbs the rounding, so the bands sum to the envelope
                // exactly and no sliver of plot is left unaccounted for.
                *d += surplus - given;
            } else {
                let g = surplus * share(&self.bands[i]) / total_pct;
                *d += g;
                given += g;
            }
        }

        // 3. Geometry.
        let pt = |x: i64, y: i64| Point2::new(Length::from_um(x), Length::from_um(y));
        let mut walls = Vec::new();
        let mut cells = Vec::new();
        let id = self.id;

        let mut wall = |a: Point2, b: Point2, external: bool, reason: String| {
            walls.push(WallLine {
                a,
                b,
                external,
                reason,
            })
        };

        wall(
            pt(x0, y0),
            pt(x1, y0),
            true,
            "front wall, on the building line set by the front setback".into(),
        );
        wall(
            pt(x1, y0),
            pt(x1, y1),
            true,
            "right wall, on the side setback".into(),
        );
        wall(
            pt(x1, y1),
            pt(x0, y1),
            true,
            "rear wall, on the rear setback".into(),
        );
        wall(
            pt(x0, y1),
            pt(x0, y0),
            true,
            "left wall, on the side setback".into(),
        );

        // Which side the spine sits on, and where the main strip therefore starts.
        let (spine_lo, spine_hi) = match self.spine.map(|s| s.side) {
            Some(Side::Left) => (x0, x0 + spine_um),
            Some(Side::Right) => (x1 - spine_um, x1),
            None => (x0, x0),
        };

        let mut y = y0;
        for (i, band) in self.bands.iter().enumerate() {
            let top = y + depths[i];
            let spined = i >= from_band;
            let (lo, hi) = match (spined, self.spine.map(|s| s.side)) {
                (true, Some(Side::Left)) => (spine_hi, x1),
                (true, Some(Side::Right)) => (x0, spine_lo),
                _ => (x0, x1),
            };

            // The divider at the foot of this band. It spans the main strip only: a wall
            // carried across the spine would chop the corridor into cupboards, and the
            // gap where it stops is the doorway from the living room into the corridor.
            if i > 0 {
                wall(
                    pt(lo, y),
                    pt(hi, y),
                    false,
                    format!("divider below the {} band ({id})", band.name),
                );
            }

            let mut x = lo;
            for (j, cell) in band.cells.iter().enumerate() {
                let right = if j + 1 == band.cells.len() {
                    hi
                } else {
                    x + widths[i][j]
                };
                if j > 0 {
                    wall(
                        pt(x, y),
                        pt(x, top),
                        false,
                        match cell.width {
                            Width::Fixed(mm) => {
                                format!("{} at a fixed {mm}mm ({id})", cell.name)
                            }
                            Width::Share(w) => {
                                format!("{} taking {w} share(s) of the band ({id})", cell.name)
                            }
                            Width::Capped { weight, max_mm } => format!(
                                "{} taking {weight} share(s) of the band, capped at \
                                 {max_mm}mm ({id})",
                                cell.name
                            ),
                        },
                    );
                }
                cells.push(Cell {
                    name: cell.name,
                    kind: cell.kind,
                    min: pt(x, y),
                    max: pt(right, top),
                });
                x = right;
            }
            y = top;
        }

        // The spine, and the one wall separating it from the rooms it serves.
        if let Some(s) = self.spine {
            let spine_y = y0 + depths.iter().take(s.from_band).sum::<i64>();
            let edge = match s.side {
                Side::Left => spine_hi,
                Side::Right => spine_lo,
            };
            wall(
                pt(edge, spine_y),
                pt(edge, y1),
                false,
                format!("{} wall, {}mm corridor ({id})", s.name, s.width_mm),
            );
            cells.push(Cell {
                name: s.name,
                kind: "corridor",
                min: pt(spine_lo, spine_y),
                max: pt(spine_hi, y1),
            });
        }

        let layout = Layout {
            template_id: id,
            envelope_min: pt(x0, y0),
            envelope_max: pt(x1, y1),
            walls,
            cells,
            entry_offset: Length::from_um(width * self.entry_pct / 100),
            mirrored: false,
        };
        Ok(if variant.mirrored {
            layout.mirrored()
        } else {
            layout
        })
    }

    /// The narrowest envelope this template can use, in millimetres.
    ///
    /// Width only, deliberately. There is no corresponding minimum depth, because the
    /// depth a band needs falls out of the width its rooms got — a 9m-wide plot needs
    /// less depth than a 5m-wide one for the same rooms. An earlier version of this
    /// returned a pair, computing the depth at the *minimum* width, and told an architect
    /// their plot needed to be 10.7m deep when 7.4m would have done. A hint that
    /// contradicts the error beside it is worse than no hint.
    pub fn minimum_width_mm(&self, rules: &RuleSet) -> i64 {
        let spine = self.spine.map(|s| s.width_mm * 1_000).unwrap_or(0);
        let from = self.spine.map(|s| s.from_band).unwrap_or(usize::MAX);
        self.bands
            .iter()
            .enumerate()
            .map(|(i, b)| {
                let inner: i64 = b.cells.iter().map(|c| floor_width(rules, c)).sum();
                if i >= from {
                    inner + spine
                } else {
                    inner
                }
            })
            .max()
            .unwrap_or(0)
            / 1_000
    }
}

/// The least width a cell will accept, in micrometres.
fn floor_width(rules: &RuleSet, c: &CellSpec) -> i64 {
    match c.width {
        Width::Fixed(mm) => mm * 1_000,
        Width::Share(_) | Width::Capped { .. } => rules
            .minimum_for(c.kind)
            .map(|m| m.min_width_mm * 1_000)
            .unwrap_or(0),
    }
}

/// Split one band's width across its cells: fixed cells take their size, the rest claim
/// their minimum and then divide the surplus by weight, with capped cells handing back
/// anything above their ceiling.
fn solve_widths(band: &Band, avail: i64, rules: &RuleSet) -> Result<Vec<i64>, TemplateError> {
    let mut out: Vec<i64> = band.cells.iter().map(|c| floor_width(rules, c)).collect();
    let need: i64 = out.iter().sum();
    if avail < need {
        return Err(TemplateError::TooNarrow {
            band: band.name,
            have_mm: avail / 1_000,
            need_mm: need / 1_000,
        });
    }
    if band.cells.iter().all(|c| c.width.weight() == 0) {
        // Nothing in this band can grow, so it cannot fill the plot, and quietly leaving
        // the remainder outside every room would put a gap between the last cell and the
        // external wall. A library authoring mistake, not a bad brief.
        return Err(TemplateError::BandCannotStretch { band: band.name });
    }

    // **A cap is a preference, and tiling is not.** Capped cells hand their surplus to an
    // uncapped neighbour — but if the band has no uncapped cell, there is nowhere for the
    // width to go, and honouring the cap would leave a strip of plot inside no room at
    // all. So the cap yields.
    //
    // The visible consequence: on a very wide plot the 2BHK's kitchen is still over-wide,
    // because that band holds two fixed toilets and the kitchen and nothing else. That is
    // a gap in the template library, not in the solver — the answer is a wide-plot 2BHK
    // with a utility off the kitchen, which is a template somebody should draw.
    let honour_caps = band
        .cells
        .iter()
        .any(|c| matches!(c.width, Width::Share(_)));

    let mut surplus = avail - need;
    let mut weights: Vec<i64> = band.cells.iter().map(|c| c.width.weight()).collect();

    if honour_caps {
        // Capped cells settle first, at their share or their ceiling, whichever is
        // smaller. What they hand back re-enters the pool, so a cap makes the room beside
        // it bigger rather than leaving a gap.
        for (i, c) in band.cells.iter().enumerate() {
            if let Width::Capped { weight, max_mm } = c.width {
                let total: i64 = weights.iter().sum::<i64>().max(1);
                let want = surplus * weight / total;
                let give = want.min((max_mm * 1_000 - out[i]).max(0));
                out[i] += give;
                surplus -= give;
                weights[i] = 0;
            }
        }
    }

    let total: i64 = weights.iter().sum::<i64>().max(1);
    // Whoever absorbs the rounding, so the cells sum to the band exactly.
    let last = band.cells.iter().rposition(|c| {
        if honour_caps {
            matches!(c.width, Width::Share(_))
        } else {
            c.width.weight() > 0
        }
    });
    let mut given = 0;
    for (i, c) in band.cells.iter().enumerate() {
        if weights[i] == 0 {
            continue;
        }
        if Some(i) == last {
            out[i] += surplus - given;
        } else {
            let g = surplus * c.width.weight() / total;
            out[i] += g;
            given += g;
        }
    }
    Ok(out)
}

/// How deep a room of this kind has to be at the width it was given.
fn depth_for(rules: &RuleSet, kind: &str, across: i64) -> i64 {
    match rules.minimum_for(kind) {
        Some(m) if across > 0 => {
            let by_area = (m.min_area_mm2 as i128 * 1_000_000 / across as i128) as i64;
            // `min_width` constrains the *short* side, so it is a floor on depth only
            // while the room is wider than it is deep.
            by_area.max(m.min_width_mm * 1_000)
        }
        _ => 0,
    }
}

impl Layout {
    pub fn envelope_width(&self) -> Length {
        Length::from_um(self.envelope_max.x.as_um() - self.envelope_min.x.as_um())
    }

    pub fn envelope_depth(&self) -> Length {
        Length::from_um(self.envelope_max.y.as_um() - self.envelope_min.y.as_um())
    }

    /// Footprint in mm², for the FAR check.
    pub fn footprint_mm2(&self) -> i64 {
        let w = self.envelope_width().as_um() as i128 / 1_000;
        let d = self.envelope_depth().as_um() as i128 / 1_000;
        (w * d) as i64
    }
}
