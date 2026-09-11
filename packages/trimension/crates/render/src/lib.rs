//! `tri-render` — wgpu renderer: browser surface and headless surface, one API.
//!
//! # Responsibility
//! Invariant **I6**: `view(&doc, camera, mode)` is the single entry point and runs with
//! no window, no canvas and no display server as readily as it runs on a browser canvas.
//!
//! # Must NOT depend on
//! `commit`, `import-dxf`, `api`, `wasm`, `server`. Only `tri-doc` and `tri-solid`.
//! No three.js, Babylon or any JS 3D library anywhere near this crate — a JS renderer
//! silently kills headless parity.

pub mod camera;
pub mod scene;
pub mod surface;
pub mod view;

pub use camera::{Bounds, Camera, ViewMode};
pub use scene::Scene;
pub use surface::{Rgba8Image, Target};
pub use view::{render, scene_for, view, RenderError, Renderer};

/// # Text rendering
///
/// Not implemented in M3, deliberately, and here is the note PRD Prompt 4 asked for so
/// that nobody walks into it later:
///
/// **MSDF is the obvious choice and it does not work for us.** Multi-channel signed
/// distance field text needs a pre-rendered glyph atlas, which means committing in
/// advance to a fixed set of codepoints. That is fine for a Latin UI and breaks
/// completely for the scripts our drawings actually carry — Devanagari, Tamil, Arabic —
/// where shaping is contextual, ligatures are mandatory, and the glyph set is not
/// enumerable from the string. An atlas built from "the characters we saw at build time"
/// silently renders tofu for the first drawing from a new office.
///
/// The realistic options when text lands: rasterise runs on the CPU with a shaper
/// (rustybuzz + swash) and upload them as textures, accepting the reflow cost on zoom;
/// or render text as vector outlines through the existing line pipeline, accepting worse
/// small-size legibility. Both are more work than MSDF. Neither is a reason to ship MSDF
/// and discover the problem in a customer's drawing.
///
/// Until then, `TEXT` and `MTEXT` entities are imported, classified as annotation and
/// carried in the document — they simply are not drawn.
pub mod text_note {}
