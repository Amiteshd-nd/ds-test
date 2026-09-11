// One shader, both surfaces. WGSL compiles to Metal, Vulkan, DX12, WebGPU and — via
// naga's GLSL backend — WebGL2, which is what lets I6 hold with a single source.

struct Uniforms {
    view_proj: mat4x4<f32>,
    background: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct LineIn {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
};

struct LineOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_line(in: LineIn) -> LineOut {
    var out: LineOut;
    out.clip = u.view_proj * vec4<f32>(in.position, 1.0);
    out.color = in.color;
    return out;
}

@fragment
fn fs_line(in: LineOut) -> @location(0) vec4<f32> {
    return in.color;
}

struct MeshIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
};

struct MeshOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
};

@vertex
fn vs_mesh(in: MeshIn) -> MeshOut {
    var out: MeshOut;
    out.clip = u.view_proj * vec4<f32>(in.position, 1.0);
    out.color = in.color;
    out.normal = in.normal;
    return out;
}

@fragment
fn fs_mesh(in: MeshOut) -> @location(0) vec4<f32> {
    // Fixed headlight. Deliberately not physically based: the job of this view is to
    // let a human or an agent read the geometry, not to look like a photograph.
    let l = normalize(vec3<f32>(0.4, -0.6, 0.7));
    let lambert = max(dot(normalize(in.normal), l), 0.0);
    let shade = 0.35 + 0.65 * lambert;

    // Depth cueing. Without it a straight-on elevation is a single flat tone: the far
    // face seen through a window opening has the same normal as the near wall, so it
    // takes the same lambert term and the opening vanishes. Receding surfaces fade
    // toward the background, which is how an elevation is drawn by hand and the reason
    // the reveal reads as a recess.
    let fog = clamp(in.clip.z, 0.0, 1.0);
    let lit = in.color.rgb * shade;
    return vec4<f32>(mix(lit, u.background.rgb, fog * 0.55), in.color.a);
}
