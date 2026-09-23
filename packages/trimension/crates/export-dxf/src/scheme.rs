//! Mapping document entities onto DXF layers and colours.

use tri_params::LayerScheme;

/// AutoCAD Color Index values for the default layers.
///
/// ACI rather than true colour: it is what a layer table normally carries, and it is what
/// an architect's plot-style table is keyed on. Sending true colour would override the
/// office's pen settings, which is rude in a file they have to print.
pub fn colour_for(scheme: &LayerScheme, layer: &str) -> i16 {
    match layer {
        l if l == scheme.walls => 7,      // white/black — the fabric
        l if l == scheme.wall_hatch => 8, // dark grey — reference
        l if l == scheme.doors => 3,      // green
        l if l == scheme.windows => 4,    // cyan
        l if l == scheme.dimensions => 2, // yellow
        l if l == scheme.text => 2,
        l if l == scheme.furniture => 9,
        l if l == scheme.grid => 8,
        _ => 7,
    }
}

/// Text height in millimetres for a plan at the given scale denominator.
///
/// A label has to be about 2.5mm tall on paper to be readable, so at 1:100 it is 250mm in
/// the drawing. Exporting text at a fixed drawing height is why so many DXFs open with
/// either invisible or enormous labels.
pub fn text_height_mm(scale_denominator: i64) -> f64 {
    2.5 * scale_denominator as f64
}
