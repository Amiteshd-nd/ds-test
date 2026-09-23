//! `tri-export-obj` — the extrusion, as a mesh anybody can open.
//!
//! The PRD is careful about what this is for: "The 3D extrusion exports as a simple solid,
//! **useful for massing only**." It is not a BIM model, it carries no materials and no
//! openings as separate objects, and saying otherwise would set an expectation the
//! geometry cannot meet.
//!
//! Wavefront OBJ, written by hand: a text format of `v` and `f` lines that SketchUp, Blender,
//! Rhino, Revit and every online viewer read without a plugin. Nothing here needs a
//! dependency, and the file is diffable, which matters more than it sounds for a format
//! whose failures are all "the model is inside out" or "the model is a kilometre wide".
//!
//! # Units
//! OBJ has no unit header — a consumer assumes whatever it likes, and the usual assumption
//! is metres. The document is in micrometres, so everything is divided by a million on the
//! way out and the header says so in a comment. Exporting raw micrometres is why a model
//! sometimes opens as a speck at the origin or a continent.

use std::fmt::Write as _;
use tri_doc::component::{Component, ComponentKey};
use tri_doc::Document;

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ObjError {
    #[error("the document has no solids; run the 2D→3D pipeline first")]
    NoSolids,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ObjStats {
    pub solids: usize,
    pub vertices: usize,
    pub triangles: usize,
    pub bytes: usize,
}

impl ObjStats {
    pub fn summary(&self) -> String {
        format!(
            "{} solid(s), {} triangles, {:.0} KB",
            self.solids,
            self.triangles,
            self.bytes as f64 / 1024.0
        )
    }
}

/// Micrometres per metre. OBJ consumers assume metres, so this is the divisor.
const UM_PER_M: f64 = 1_000_000.0;

pub fn export(doc: &Document) -> Result<(Vec<u8>, ObjStats), ObjError> {
    let mut out = String::new();
    // ASCII only. OBJ comments are skipped by every parser, but a byte-oriented one
    // has no reason to be handed UTF-8 it did not ask for.
    out.push_str("# trimension - massing export\n");
    out.push_str("# units: metres. The document is in micrometres; positions are /1e6.\n");
    out.push_str("# Massing only: no materials, no openings as objects, not a BIM model.\n");

    let mut vertices = 0usize;
    let mut triangles = 0usize;
    let mut solids = 0usize;

    for (id, set) in doc.iter_with(ComponentKey::Solid3d) {
        let Some(Component::Solid3d(solid)) = set.get(&ComponentKey::Solid3d) else {
            continue;
        };
        if solid.positions.is_empty() || solid.indices.is_empty() {
            continue;
        }
        solids += 1;
        let _ = writeln!(out, "o entity_{}", id.raw());
        for p in &solid.positions {
            let _ = writeln!(
                out,
                "v {:.6} {:.6} {:.6}",
                p[0] as f64 / UM_PER_M,
                p[1] as f64 / UM_PER_M,
                p[2] as f64 / UM_PER_M
            );
        }
        // OBJ indices are 1-based and **global to the file**, not per-object. Writing
        // them per-object is the single most common way to produce a file that opens as
        // a tangle of triangles reaching back to the origin.
        let base = vertices as u32;
        for tri in solid.indices.as_chunks::<3>().0 {
            let _ = writeln!(
                out,
                "f {} {} {}",
                base + tri[0] + 1,
                base + tri[1] + 1,
                base + tri[2] + 1
            );
            triangles += 1;
        }
        vertices += solid.positions.len();
    }

    if solids == 0 {
        return Err(ObjError::NoSolids);
    }
    let bytes = out.into_bytes();
    let stats = ObjStats {
        solids,
        vertices,
        triangles,
        bytes: bytes.len(),
    };
    Ok((bytes, stats))
}
