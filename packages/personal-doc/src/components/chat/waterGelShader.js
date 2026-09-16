/* GLSL for the water gel.
 *
 * The body is a sphere whose radius is modulated by real spherical harmonics.
 * The JS side drives those harmonic amplitudes as damped oscillators, so the
 * shape you see is the drop's actual mode shape at that instant rather than a
 * noise field pretending to wobble.
 *
 * Colour is thin-film interference, computed rather than sampled: the optical
 * path difference through a film of varying thickness is evaluated against the
 * wavelengths of red, green and blue, so the banding shifts with both film
 * thickness and viewing angle the way a soap film does.
 *
 * Fresnel does the heavy lifting for the overall read. Facing the viewer the
 * surface is mostly transmissive, so you see the milky scattered core; toward
 * the rim reflectance climbs and the interference colours take over. That is
 * why a real gel bead is pale in the middle and saturated around the edge.
 */

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform mat3  uRot;      // body -> world
uniform vec3  uPos;
uniform float uAmp[8];   // spherical-harmonic mode amplitudes
uniform float uTime;
uniform float uGrab;

out vec4 outColor;

const float R0 = 0.80;

/* ------------------------------------------------------------ the surface */

// Real spherical harmonics, l = 2 (five modes) and l = 3 (three modes),
// unnormalised. These are the shapes a drop actually oscillates in. Every
// term here has l >= 2, and those are volume-preserving to first order, which
// is why the gel wobbles without appearing to breathe in and out.
float disp(vec3 n) {
  float x = n.x, y = n.y, z = n.z;
  float s = 0.0;
  // Each term is scaled so its peak magnitude is 1. With the amplitudes then
  // budgeted on the JS side, the radius can never reach zero and turn the body
  // inside out.
  s += uAmp[0] * (3.0 * z * z - 1.0) * 0.5;
  s += uAmp[1] * (x * z) * 2.0;
  s += uAmp[2] * (y * z) * 2.0;
  s += uAmp[3] * (x * x - y * y);
  s += uAmp[4] * (x * y) * 2.0;
  s += uAmp[5] * (z * (5.0 * z * z - 3.0)) * 0.5;
  s += uAmp[6] * (x * (5.0 * z * z - 1.0)) * 0.72;
  s += uAmp[7] * (x * (x * x - 3.0 * y * y));
  return s;
}

// Radially modulated sphere. Not a true distance field once deformed, so the
// march is stepped short of the estimate to stay conservative.
float sdf(vec3 p) {
  float r = length(p);
  vec3 n = r > 1e-5 ? p / r : vec3(0.0, 1.0, 0.0);
  return (r - R0 * (1.0 + disp(n))) * 0.55;
}

vec3 grad(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0022;
  return normalize(k.xyy * sdf(p + k.xyy * h) + k.yyx * sdf(p + k.yyx * h) +
                   k.yxy * sdf(p + k.yxy * h) + k.xxx * sdf(p + k.xxx * h));
}

// Bounding sphere, generous enough to contain the deformed body.
vec2 bound(vec3 ro, vec3 rd, float rad) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - rad * rad;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float march(vec3 ro, vec3 rd, float tMin, float tMax) {
  float t = tMin;
  for (int i = 0; i < 96; i++) {
    float d = sdf(ro + rd * t);
    if (d < 0.0006) return t;
    t += max(d, 0.0035);
    if (t > tMax) break;
  }
  return -1.0;
}

float exitT(vec3 ro, vec3 rd) {
  float t = 0.004;
  for (int i = 0; i < 72; i++) {
    float d = sdf(ro + rd * t);
    if (d > -0.0006) return t;
    t -= min(d, -0.0035);
    if (t > 5.0) break;
  }
  return t;
}

/* ------------------------------------------------------------ thin film */

// Interference from a film of thickness d (nanometres) at refraction angle
// cosT. Two surfaces, one round trip, half-wave shift at the denser boundary.
vec3 interference(float d, float cosT) {
  const vec3 LAMBDA = vec3(680.0, 550.0, 440.0);   // R, G, B in nm
  float opd = 2.0 * 1.33 * d * cosT;
  vec3 phase = 6.28318530718 * opd / LAMBDA + 3.14159265;
  vec3 band = 0.5 + 0.5 * cos(phase);
  return band * band * (3.0 - 2.0 * band);   // steepen: deepen the troughs
}

// Film thickness varies over the body and rides along with the deformation,
// so the bands travel across the surface as it oscillates instead of sitting
// still like a decal.
float filmDepth(vec3 n, float wob) {
  float f = sin(n.x * 4.1 + n.y * 2.7) * 0.5
          + sin(n.y * 3.3 - n.z * 4.7) * 0.3
          + sin(n.z * 5.2 + n.x * 2.1) * 0.2;
  return 430.0 + 520.0 * f + 900.0 * wob;
}

/* ---------------------------------------------------------------- lights */

vec3 env(vec3 d) {
  vec3 c = vec3(0.030, 0.034, 0.052);
  c += vec3(1.00, 0.98, 0.95) * pow(max(d.y, 0.0), 3.0) * 1.10;
  c += vec3(0.30, 0.80, 1.00) * pow(max(-d.x, 0.0), 2.0) * 0.55;
  c += vec3(1.00, 0.55, 0.75) * pow(max(d.x, 0.0), 2.0) * 0.45;
  c += vec3(0.55, 1.00, 0.85) * pow(max(-d.y, 0.0), 2.5) * 0.35;
  c += vec3(1.0) * pow(max(dot(d, normalize(vec3(0.35, 0.85, 0.40))), 0.0), 60.0) * 2.4;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = vec3(0.0, 0.0, 3.3);
  vec3 rd = normalize(vec3(uv * 0.56, -1.0));

  mat3 toBody = transpose(uRot);
  vec3 rol = toBody * (ro - uPos);
  vec3 rdl = toBody * rd;

  vec3 col = vec3(0.0);
  float a = 0.0;

  vec2 bs = bound(rol, rdl, R0 * 1.75);
  float t = bs.x < 0.0 ? -1.0 : march(rol, rdl, max(bs.x, 0.0), bs.y);

  if (t > 0.0) {
    vec3 p = rol + rdl * t;
    vec3 n = grad(p);

    float cosI = clamp(dot(-rdl, n), 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);

    // How far the ray travels inside — the scattering path length.
    vec3 into = refract(rdl, n, 1.0 / 1.33);
    if (dot(into, into) < 1e-6) into = reflect(rdl, n);
    vec3 q = p + into * 0.004;
    float thick = exitT(q, into);

    // Interference, tinted by how deformed this patch currently is.
    vec3 nb = normalize(p);
    float wob = disp(nb);
    vec3 film = interference(filmDepth(nb, wob), cosI);

    // Reflected side: the studio, coloured by the film.
    vec3 refl = env(uRot * reflect(rdl, n)) * (0.10 + 1.30 * film);

    // Transmitted side: milky scatter, reddening with path length the way a
    // turbid medium does, plus a trace of the film so the core stays opaline.
    vec3 deep = vec3(0.62, 0.80, 1.00);
    vec3 shallow = vec3(1.00, 0.97, 1.00);
    float k = clamp(thick / (R0 * 2.2), 0.0, 1.0);
    vec3 sss = mix(shallow, deep, k) * (0.55 + 0.85 * film);
    sss *= 0.55 + 0.75 * exp(-k * 1.4);

    col = mix(sss, refl, F);

    // Grazing rim, where the film is seen almost edge-on and saturates.
    float rim = pow(1.0 - cosI, 3.5);
    col += film * rim * (1.7 + uGrab * 0.5);

    a = clamp(dot(col, vec3(0.42)) * 1.7 + F * 0.45 + 0.12, 0.08, 1.0);
  } else {
    float tc = max(dot(-rol, rdl), 0.0);
    float d = sdf(rol + rdl * tc);
    float g = exp(-d * 5.0) * 0.38;
    col = mix(vec3(0.45, 0.95, 1.00), vec3(1.00, 0.60, 0.90), 0.5 + 0.5 * uv.y) * g;
    a = clamp(g * 0.8, 0.0, 1.0);
  }

  outColor = vec4(col * a, a);
}`;
