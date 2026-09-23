//! Document → GPU-ready buffers.
//!
//! # This module is where invariant I6 is actually won
//! The PRD asks for a pixel-tolerance comparison between the browser and headless paths.
//! That test is worth having, but it is not the strong guarantee: comparing images across
//! a developer's Metal driver and CI's software Vulkan rasteriser means tuning a
//! tolerance forever, and a test whose threshold gets relaxed under pressure guards
//! nothing.
//!
//! The property that actually matters is that both paths draw *the same geometry*. So
//! scene extraction is pure, deterministic, integer-driven and target-independent, and
//! the parity test asserts byte equality of the buffers it produces. The pixel test then
//! sits on top as a cheaper smoke check. Both live in `tests/parity.rs`.

use crate::camera::{Bounds, Camera, ViewMode};
use bytemuck::{Pod, Zeroable};
use tri_doc::component::{Polyline2d, Solid3d, WallProfile};
use tri_doc::{Component, ComponentKey, Document, EntityId, Point2};

/// One vertex of a stroked line, in document µm promoted to f32 at the last moment.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct LineVertex {
    pub position: [f32; 3],
    pub color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct MeshVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub color: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct Uniforms {
    pub view_proj: [[f32; 4]; 4],
    pub background: [f32; 4],
}

/// Everything needed to draw one frame. Deterministic given (document, camera, mode).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Scene {
    pub lines: Vec<LineVertex>,
    pub mesh: Vec<MeshVertex>,
    pub mesh_indices: Vec<u32>,
    pub uniforms: SceneUniforms,
    /// Entities that contributed, in document order. Used for picking and for the
    /// "what did the agent actually see" answer that `render_view` owes its caller.
    pub drawn: Vec<EntityId>,
    /// Should line work be occluded by solids?
    ///
    /// In plan the answer is no: every line sits at z=0 and must draw over the fill.
    /// In a 3D view the answer is yes, and getting it wrong is why an unshaded model
    /// reads as a translucent wireframe box instead of a building — you see every edge
    /// of the far side through the near wall.
    pub depth_test_lines: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct SceneUniforms {
    pub view_proj: [[f32; 4]; 4],
    pub background: [f32; 4],
}

impl Scene {
    /// The clear colour as it will actually appear in a readback buffer.
    ///
    /// The shader clears with a **linear** value, but the colour target is
    /// `Rgba8UnormSrgb`, so the bytes that come back are sRGB-encoded. Comparing readback
    /// pixels against the linear constant is off by the transfer function — 0.086 linear
    /// is 83, not 22 — which silently makes every pixel look like ink and any
    /// "did anything draw?" check vacuously true.
    pub fn background_srgb(&self) -> [u8; 4] {
        let e = |v: f32| -> u8 {
            let s = if v <= 0.003_130_8 {
                v * 12.92
            } else {
                1.055 * v.powf(1.0 / 2.4) - 0.055
            };
            (s.clamp(0.0, 1.0) * 255.0).round() as u8
        };
        let b = self.uniforms.background;
        [
            e(b[0]),
            e(b[1]),
            e(b[2]),
            (b[3].clamp(0.0, 1.0) * 255.0).round() as u8,
        ]
    }

    pub fn uniform_bytes(&self) -> Uniforms {
        Uniforms {
            view_proj: self.uniforms.view_proj,
            background: self.uniforms.background,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.lines.is_empty() && self.mesh.is_empty()
    }

    /// A stable fingerprint of the draw data, for the parity test.
    pub fn fingerprint(&self) -> String {
        let mut h = blake3_like(&[]);
        h = blake3_like(&[h, hash_slice(bytemuck::cast_slice(&self.lines))].concat());
        h = blake3_like(&[h, hash_slice(bytemuck::cast_slice(&self.mesh))].concat());
        h = blake3_like(&[h, hash_slice(bytemuck::cast_slice(&self.mesh_indices))].concat());
        h.iter().map(|b| format!("{b:02x}")).collect()
    }
}

fn hash_slice(bytes: &[u8]) -> Vec<u8> {
    // FNV-1a: no dependency, and every operation is exact integer arithmetic, so the
    // fingerprint is identical on wasm32 and native.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h.to_le_bytes().to_vec()
}

fn blake3_like(bytes: &[u8]) -> Vec<u8> {
    hash_slice(bytes)
}

/// Default palette. Layer colour wins when the layer defines one.
const BACKGROUND: [f32; 4] = [0.086, 0.094, 0.106, 1.0];
const DEFAULT_LINE: [f32; 4] = [0.85, 0.87, 0.90, 1.0];
const WALL_FILL: [f32; 4] = [0.72, 0.74, 0.78, 1.0];
/// Silhouette lines over the shaded solids. Without them a white-on-grey model reads as
/// a flat blob at small viewport sizes, which is exactly the size these are drawn at.
const EDGE: [f32; 4] = [0.13, 0.15, 0.18, 1.0];
/// A hard rule failure. Paired with a glyph in the panel, never colour alone.
const FAIL: [f32; 4] = [0.94, 0.33, 0.31, 1.0];
/// A soft warning.
const WARN: [f32; 4] = [0.98, 0.75, 0.18, 1.0];

/// Entities a rule flagged, so the canvas can show a breach on the geometry rather than
/// in a list the architect has to map back onto the drawing.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Highlights {
    /// Hard failures. Drawn red.
    pub failing: Vec<EntityId>,
    /// Soft warnings. Drawn amber.
    pub warning: Vec<EntityId>,
}

impl Highlights {
    fn colour_for(&self, id: EntityId) -> Option<[f32; 4]> {
        if self.failing.contains(&id) {
            Some(FAIL)
        } else if self.warning.contains(&id) {
            Some(WARN)
        } else {
            None
        }
    }
}

/// Build a scene. Pure: no GPU, no allocation of device resources, no I/O.
pub fn build(doc: &Document, camera: Camera, mode: ViewMode) -> Scene {
    build_with(doc, camera, mode, &Highlights::default())
}

/// Build a scene, colouring flagged geometry.
pub fn build_with(
    doc: &Document,
    camera: Camera,
    mode: ViewMode,
    highlights: &Highlights,
) -> Scene {
    let mut scene = Scene {
        depth_test_lines: mode.shows_solids(),
        uniforms: SceneUniforms {
            view_proj: match mode {
                ViewMode::TwoPointPerspective => two_point_perspective(camera),
                orthographic => ortho(camera, orthographic),
            },
            background: BACKGROUND,
        },
        ..Default::default()
    };

    for (id, set) in doc.iter_entities() {
        // A flagged entity overrides its layer colour: a breach has to be visible even
        // on a layer the architect has coloured to taste.
        let colour = highlights
            .colour_for(id)
            .or_else(|| layer_colour(doc, set))
            .unwrap_or(DEFAULT_LINE);
        if !layer_visible(doc, set) {
            continue;
        }

        let mut contributed = false;

        if let Some(Component::Polyline2d(p)) = set.get(&ComponentKey::Polyline2d) {
            push_polyline(&mut scene.lines, &p.points, p.closed, colour, 0.0);
            contributed |= !p.points.is_empty();
        }

        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            if mode == ViewMode::PlanView2d {
                push_wall_plan(&mut scene.lines, w, colour);
            } else if !set.has(&ComponentKey::Solid3d) {
                // No solid built yet: draw the centreline so a 3D view is not blank while
                // the extrusion is pending, rather than silently showing nothing.
                push_polyline(&mut scene.lines, &w.centreline, false, colour, 0.0);
            }
            contributed = true;
        }

        if mode.shows_solids() {
            if let Some(Component::Solid3d(s)) = set.get(&ComponentKey::Solid3d) {
                push_solid(&mut scene, s, WALL_FILL);
                push_solid_edges(&mut scene.lines, s, EDGE);
                contributed = true;
            }
        }

        if contributed {
            scene.drawn.push(id);
        }
    }

    scene
}

fn layer_visible(doc: &Document, set: &tri_doc::ComponentSet) -> bool {
    match set.get(&ComponentKey::LayerRef) {
        Some(Component::LayerRef(l)) => doc.layers().get(*l).is_none_or(|l| l.visible),
        _ => true,
    }
}

fn layer_colour(doc: &Document, set: &tri_doc::ComponentSet) -> Option<[f32; 4]> {
    let Some(Component::LayerRef(l)) = set.get(&ComponentKey::LayerRef) else {
        return None;
    };
    let c = doc.layers().get(*l)?.color;
    Some([
        c[0] as f32 / 255.0,
        c[1] as f32 / 255.0,
        c[2] as f32 / 255.0,
        c[3] as f32 / 255.0,
    ])
}

/// µm → world units (metres) as f32. Done once, here, at the boundary: everything
/// upstream is exact integers (see `tri_doc::units`) and everything downstream is the
/// GPU's problem.
fn to_world(p: Point2, z_um: i64) -> [f32; 3] {
    [
        p.x.as_um() as f32 / 1_000_000.0,
        p.y.as_um() as f32 / 1_000_000.0,
        z_um as f32 / 1_000_000.0,
    ]
}

fn push_polyline(
    out: &mut Vec<LineVertex>,
    pts: &[Point2],
    closed: bool,
    color: [f32; 4],
    z_um: f32,
) {
    let z = z_um as i64;
    for w in pts.windows(2) {
        out.push(LineVertex {
            position: to_world(w[0], z),
            color,
        });
        out.push(LineVertex {
            position: to_world(w[1], z),
            color,
        });
    }
    if closed && pts.len() > 2 {
        out.push(LineVertex {
            position: to_world(pts[pts.len() - 1], z),
            color,
        });
        out.push(LineVertex {
            position: to_world(pts[0], z),
            color,
        });
    }
}

/// Plan view of a wall: both faces offset from the centreline by half the thickness.
/// This is a *drawing* of the wall, not the extrusion — `solid` owns that.
/// The two faces of a wall in plan, as the canvas draws them.
///
/// Public because the PDF sheet draws the same walls and must not compute them
/// differently. A sheet whose wall faces sat a few millimetres off the screen's would be
/// wrong in the one way an architect checks with a scale rule, and nothing would catch it.
pub fn wall_faces(w: &WallProfile) -> (Vec<Point2>, Vec<Point2>) {
    let half = w.thickness.get().as_um() / 2;
    (
        offset_polyline(&w.centreline, half),
        offset_polyline(&w.centreline, -half),
    )
}

fn push_wall_plan(out: &mut Vec<LineVertex>, w: &WallProfile, color: [f32; 4]) {
    let (left, right) = wall_faces(w);
    for offset in [left, right] {
        push_polyline(out, &offset, false, color, 0.0);
    }
    push_polyline(
        out,
        &w.centreline,
        false,
        [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 1.0],
        0.0,
    );
}

/// Naive per-segment offset. Adequate for a plan drawing; the real mitred offset lives
/// in `geom2d` for M4, where it feeds actual geometry rather than pixels.
fn offset_polyline(pts: &[Point2], by_um: i64) -> Vec<Point2> {
    if pts.len() < 2 {
        return pts.to_vec();
    }
    let mut out = Vec::with_capacity(pts.len());
    for i in 0..pts.len() {
        let (a, b) = if i + 1 < pts.len() {
            (pts[i], pts[i + 1])
        } else {
            (pts[i - 1], pts[i])
        };
        let dx = (b.x.as_um() - a.x.as_um()) as i128;
        let dy = (b.y.as_um() - a.y.as_um()) as i128;
        let len = tri_doc::validate::isqrt_i128(dx * dx + dy * dy).max(1);
        // Left normal, scaled. Integer division keeps this reproducible.
        let nx = (-dy * by_um as i128) / len;
        let ny = (dx * by_um as i128) / len;
        out.push(Point2::new(
            tri_doc::Length::from_um(pts[i].x.as_um() + nx as i64),
            tri_doc::Length::from_um(pts[i].y.as_um() + ny as i64),
        ));
    }
    out
}

fn push_solid(scene: &mut Scene, s: &Solid3d, color: [f32; 4]) {
    let base = scene.mesh.len() as u32;
    for tri in s.indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let p: Vec<[f32; 3]> = tri
            .iter()
            .map(|i| {
                let v = s.positions.get(*i as usize).copied().unwrap_or([0; 3]);
                [
                    v[0] as f32 / 1_000_000.0,
                    v[1] as f32 / 1_000_000.0,
                    v[2] as f32 / 1_000_000.0,
                ]
            })
            .collect();
        let n = face_normal(p[0], p[1], p[2]);
        for pos in p {
            scene.mesh.push(MeshVertex {
                position: pos,
                normal: n,
                color,
            });
        }
    }
    for i in 0..(scene.mesh.len() as u32 - base) {
        scene.mesh_indices.push(base + i);
    }
}

/// Feature edges of a solid: the creases and boundaries, not the triangulation.
///
/// Drawing *every* triangle edge is the obvious version and it looks wrong — each
/// rectangular face gets a diagonal across it, so an elevation reads as a mesh debug view
/// rather than a drawing. An edge is kept only when it is a boundary (one adjacent face)
/// or a crease (its two faces point in materially different directions), which leaves the
/// box outlines and the reveals around each opening and drops every coplanar diagonal.
fn push_solid_edges(out: &mut Vec<LineVertex>, s: &Solid3d, color: [f32; 4]) {
    use std::collections::BTreeMap;

    // Quantised normals so that two faces of the same plane compare equal despite the
    // float arithmetic that produced them.
    let mut edges: BTreeMap<(u32, u32), Vec<[i32; 3]>> = BTreeMap::new();

    for tri in s.indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let p: Vec<[f32; 3]> = tri
            .iter()
            .map(|i| {
                let v = s.positions.get(*i as usize).copied().unwrap_or([0; 3]);
                [
                    v[0] as f32 / 1_000_000.0,
                    v[1] as f32 / 1_000_000.0,
                    v[2] as f32 / 1_000_000.0,
                ]
            })
            .collect();
        let n = face_normal(p[0], p[1], p[2]);
        let key = [
            (n[0] * 64.0).round() as i32,
            (n[1] * 64.0).round() as i32,
            (n[2] * 64.0).round() as i32,
        ];
        for (a, b) in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
            edges.entry((a.min(b), a.max(b))).or_default().push(key);
        }
    }

    let world = |i: u32| {
        let v = s.positions.get(i as usize).copied().unwrap_or([0; 3]);
        [
            v[0] as f32 / 1_000_000.0,
            v[1] as f32 / 1_000_000.0,
            v[2] as f32 / 1_000_000.0,
        ]
    };

    for ((a, b), normals) in edges {
        let feature = match normals.as_slice() {
            [_] => true,      // boundary edge
            [x, y] => x != y, // crease
            many => many.windows(2).any(|w| w[0] != w[1]),
        };
        if !feature {
            continue;
        }
        out.push(LineVertex {
            position: world(a),
            color,
        });
        out.push(LineVertex {
            position: world(b),
            color,
        });
    }
}

fn face_normal(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> [f32; 3] {
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];
    let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
    if len == 0.0 {
        [0.0, 0.0, 1.0]
    } else {
        [n[0] / len, n[1] / len, n[2] / len]
    }
}

/// Orthographic projection for the three parallel views.
///
/// The view direction is stated outright for each mode rather than derived from a cross
/// product of the screen basis. Deriving it is how the two elevations ended up swapped:
/// the handedness is easy to get backwards and the result still renders, just from the
/// opposite side, which is a hard thing to notice on a symmetrical building.
fn ortho(c: Camera, mode: ViewMode) -> [[f32; 4]; 4] {
    let (hx, hy) = c.half_extent_um();
    let m = 1e6f32; // µm → metres
    let cx = c.centre.x.as_um() as f32 / m;
    let cy = c.centre.y.as_um() as f32 / m;
    let cz = (c.z_min_um + c.z_max_um) as f32 / 2.0 / m;

    // (target, view direction, up) per mode.
    let (target, forward, up) = match mode {
        // Straight down, north up.
        ViewMode::PlanView2d => ([cx, cy, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]),
        // Standing to the west, looking east.
        ViewMode::ElevationLeft => ([cx, cy, cz], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]),
        // Standing to the east, looking west.
        ViewMode::ElevationRight => ([cx, cy, cz], [-1.0, 0.0, 0.0], [0.0, 0.0, 1.0]),
        ViewMode::TwoPointPerspective => unreachable!("perspective has its own matrix"),
    };

    let (hw, hh) = (hx as f32 / m, hy as f32 / m);

    // Depth range fitted to the model's extent along the *view axis*, not an arbitrary
    // multiple of the screen size. Two reasons. A loose range wastes almost the whole
    // [0,1] depth buffer on empty space, and the fragment shader uses that depth for
    // distance shading — with an 8× range everything in the building lands within a few
    // percent of each other and an elevation renders as one flat grey shape, which is
    // exactly how a window stops looking like a hole.
    let along_view = match mode {
        ViewMode::PlanView2d => (c.z_max_um - c.z_min_um) as f32 / m,
        _ => (c.half_extent_um().0 as f32 / m).max(hw) * 2.0,
    };
    let depth = (along_view.max(0.5) * 1.5).max(1.0);
    let eye = [
        target[0] - forward[0] * depth,
        target[1] - forward[1] * depth,
        target[2] - forward[2] * depth,
    ];

    let view = look_at(eye, target, up);

    // Depth maps view-space z into WebGPU's [0, 1] clip range, near at 0.
    //
    // `look_at` follows the usual convention where the camera looks down −Z, so a point
    // `d` in front has view-space z of −d and the mapping is `-view_z / far`. The obvious
    // form — `view_z / far + 0.5` — puts everything beyond the target plane at a negative
    // clip z, and the rasteriser quietly discards it. The elevations still looked
    // plausible, because the half of the building that survived was the half facing the
    // camera.
    let far = 2.0 * depth;
    let proj = [
        [1.0 / hw, 0.0, 0.0, 0.0],
        [0.0, 1.0 / hh, 0.0, 0.0],
        [0.0, 0.0, -1.0 / far, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ];
    mul(proj, view)
}

/// A true two-point perspective.
///
/// The eye sits at `eye_height_um` above the base and looks **level** at a target at the
/// same height. Because the view direction has no vertical component and the up vector is
/// world +Z, vertical edges of the building project to parallel vertical lines on screen
/// and the scene resolves to exactly two vanishing points — the architectural convention.
///
/// Tilting the camera would add a third vanishing point and make every vertical converge.
/// That is why there is no pitch parameter to pass in.
#[allow(clippy::let_and_return)]
fn two_point_perspective(c: Camera) -> [[f32; 4]; 4] {
    let m = 1e6f32;
    let yaw = (c.yaw_mdeg as f32 / 1000.0).to_radians();
    let d = c.distance_um as f32 / m;
    let eye_z = (c.z_min_um + c.eye_height_um) as f32 / m;

    let cx = c.centre.x.as_um() as f32 / m;
    let cy = c.centre.y.as_um() as f32 / m;

    // Target is at eye height, so the view ray is horizontal. This is the whole trick.
    let target = [cx, cy, eye_z];
    let eye = [cx + d * yaw.cos(), cy + d * yaw.sin(), eye_z];

    let view = look_at(eye, target, [0.0, 0.0, 1.0]);
    let far = (d + (c.z_max_um - c.z_min_um) as f32 / m) * 6.0;
    let fov = (crate::camera::PERSPECTIVE_FOV_DEG as f32).to_radians();
    let proj = perspective_matrix(fov, c.aspect(), (d * 0.02).max(0.05), far);
    mul(proj, view)
}

fn look_at(eye: [f32; 3], at: [f32; 3], up: [f32; 3]) -> [[f32; 4]; 4] {
    let f = normalise(sub(at, eye));
    let s = normalise(cross(f, up));
    let u = cross(s, f);
    [
        [s[0], u[0], -f[0], 0.0],
        [s[1], u[1], -f[1], 0.0],
        [s[2], u[2], -f[2], 0.0],
        [-dot(s, eye), -dot(u, eye), dot(f, eye), 1.0],
    ]
}

fn perspective_matrix(fovy: f32, aspect: f32, near: f32, far: f32) -> [[f32; 4]; 4] {
    let t = 1.0 / (fovy / 2.0).tan();
    [
        [t / aspect, 0.0, 0.0, 0.0],
        [0.0, t, 0.0, 0.0],
        [0.0, 0.0, far / (near - far), -1.0],
        [0.0, 0.0, near * far / (near - far), 0.0],
    ]
}

fn mul(a: [[f32; 4]; 4], b: [[f32; 4]; 4]) -> [[f32; 4]; 4] {
    let mut o = [[0.0f32; 4]; 4];
    for (i, row) in o.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            *cell = (0..4).map(|k| a[k][j] * b[i][k]).sum();
        }
    }
    o
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn normalise(v: [f32; 3]) -> [f32; 3] {
    let l = dot(v, v).sqrt();
    if l == 0.0 {
        v
    } else {
        [v[0] / l, v[1] / l, v[2] / l]
    }
}

/// Bounds of everything drawable, for `Camera::fit`.
pub fn document_bounds(doc: &Document) -> Option<Bounds> {
    let mut b: Option<Bounds> = None;
    let mut add = |pts: &[Point2]| {
        for p in pts {
            match &mut b {
                Some(bb) => bb.include(*p),
                None => b = Some(Bounds { min: *p, max: *p }),
            }
        }
    };
    for (_, set) in doc.iter_entities() {
        if let Some(Component::Polyline2d(Polyline2d { points, .. })) =
            set.get(&ComponentKey::Polyline2d)
        {
            add(points);
        }
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            add(&w.centreline);
        }
    }
    b
}

/// The model's vertical extent in µm, for framing an elevation.
///
/// Falls back to a single storey rather than zero: an elevation fitted to a zero-height
/// model divides by nothing useful and shows an empty frame, which reads as "the
/// renderer is broken" rather than "nothing is extruded yet".
pub fn document_height(doc: &Document) -> (i64, i64) {
    let mut min = i64::MAX;
    let mut max = i64::MIN;

    for (_, set) in doc.iter_entities() {
        if let Some(Component::Solid3d(s)) = set.get(&ComponentKey::Solid3d) {
            for p in &s.positions {
                min = min.min(p[2]);
                max = max.max(p[2]);
            }
        }
        if let Some(Component::WallProfile(w)) = set.get(&ComponentKey::WallProfile) {
            let base = w.base_elevation.get().as_um();
            min = min.min(base);
            max = max.max(base + w.height.get().as_um());
        }
    }

    if min > max {
        (0, 2_700_000)
    } else {
        (min, max.max(min + 1))
    }
}
