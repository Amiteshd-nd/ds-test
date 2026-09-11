//! Stage 7 of PRD §4.5: mesh → the `Solid3d` component the renderer consumes.
//!
//! There is deliberately no float conversion here. `Solid3d` stores integer µm and
//! `tri_render::scene` converts to f32 at the last possible moment, so two targets
//! building the same wall store identical bytes and the document hash holds.

use crate::mesh::Mesh;
use tri_doc::component::Solid3d;

pub fn to_solid(mesh: &Mesh) -> Solid3d {
    mesh.to_component()
}

/// Total triangle count, for the "is this document going to render" question that
/// `describe_region` needs to answer without dumping geometry (invariant **I5**).
pub fn triangle_count(solid: &Solid3d) -> usize {
    solid.indices.len() / 3
}
