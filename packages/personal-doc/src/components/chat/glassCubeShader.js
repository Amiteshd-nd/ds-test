/* GLSL for the refractive cube.
 *
 * Kept in its own module so the renderer file stays readable. The cube is not
 * geometry — there is no mesh, no scene graph, no 3D library. Every pixel casts
 * a ray at an analytically-defined box, refracts it through the solid, and
 * samples a procedural light environment on the way out.
 *
 * Dispersion is the whole trick: red, green and blue are refracted at three
 * slightly different indices, so they exit along diverging paths and land on
 * different parts of the environment. That separation is what produces the
 * amber and cyan bleed along the edges rather than a colour ramp faked on top.
 */

export const VERT = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID — no vertex buffer needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform mat3  uRot;     // body -> world
uniform vec3  uPos;     // body centre, world space
uniform float uEnergy;  // conversation intensity
uniform float uGrab;    // 0 idle, 1 held
uniform float uFlat;    // 0 refractive glass, 1 posterised ink
uniform vec3  uTint;    // the ink the flat pass is printed in

out vec4 outColor;

const vec3  BOX = vec3(0.60);   // half-extents of the straight part
const float RND = 0.30;         // corner radius
const vec3  HULL = BOX + RND;   // analytic bound used to skip empty pixels

/* ----------------------------------------------------------- environment */

// A black studio lit by broad softboxes plus narrow strip lights. Wide fields
// matter more than tight speculars: a refracted ray leaves in almost any
// direction, so anything too narrow means most rays exit into black. The strip
// lights are what streak across the faces as the cube turns.
vec3 env(vec3 d) {
  vec3 c = vec3(0.010, 0.013, 0.026);

  c += vec3(1.00, 0.50, 0.12) * smoothstep(-0.35, 1.0, -d.x) * 0.42;
  c += vec3(0.16, 0.52, 1.00) * smoothstep(-0.35, 1.0,  d.x) * 0.48;
  c += vec3(0.10, 0.92, 0.86) * smoothstep(-0.10, 1.0, -d.y) * 0.20;
  c += vec3(0.55, 0.30, 0.95) * smoothstep(-0.10, 1.0, -d.z) * 0.16;

  c += vec3(1.00, 0.98, 0.94) * pow(smoothstep(0.10, 1.0, d.y), 3.2) * 0.55;

  c += vec3(1.00, 0.97, 0.92) * exp(-pow((d.y - 0.55) * 10.0, 2.0)) * 1.75;
  c += vec3(1.00, 0.62, 0.22) * exp(-pow((d.x + 0.60) * 12.0, 2.0)) * 1.55;
  c += vec3(0.35, 0.75, 1.00) * exp(-pow((d.z - 0.50) * 11.0, 2.0)) * 1.45;
  c += vec3(0.25, 0.95, 0.90) * exp(-pow((d.y + 0.30) * 15.0, 2.0)) * 0.80;
  c += vec3(1.00, 0.85, 0.55) * exp(-pow((d.x - 0.35) * 14.0, 2.0)) * 0.70;

  return c;
}

/* ------------------------------------------------------------- the solid */

// Rounded box. The rounding is the point: a sharp cube refracts each face
// along one near-constant direction and reads as a flat coloured panel, while
// a curved edge sweeps the exit direction across a wide arc and produces the
// smeared caustic bands.
float sdf(vec3 p) {
  vec3 d = abs(p) - BOX;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - RND;
}

vec3 grad(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(k.xyy * sdf(p + k.xyy * h) + k.yyx * sdf(p + k.yyx * h) +
                   k.yxy * sdf(p + k.yxy * h) + k.xxx * sdf(p + k.xxx * h));
}

// Cheap analytic bound, so only pixels that can possibly hit pay for marching.
vec2 hull(vec3 ro, vec3 rd) {
  vec3 m = 1.0 / rd;
  vec3 n = m * ro;
  vec3 k = abs(m) * HULL;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  return tN > tF || tF < 0.0 ? vec2(-1.0) : vec2(tN, tF);
}

// March until the surface is crossed from outside.
float hit(vec3 ro, vec3 rd, float tMin, float tMax) {
  float t = tMin;
  for (int i = 0; i < 64; i++) {
    float d = sdf(ro + rd * t);
    if (d < 0.0008) return t;
    t += d;
    if (t > tMax) break;
  }
  return -1.0;
}

// March from inside until the surface is crossed outward.
float leave(vec3 ro, vec3 rd) {
  float t = 0.002;
  for (int i = 0; i < 48; i++) {
    float d = sdf(ro + rd * t);
    if (d > -0.0008) return t;
    t -= d;                      // d is negative inside
    if (t > 6.0) break;
  }
  return t;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);

  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv * 0.52, -1.0));

  mat3 toBody = transpose(uRot);
  vec3 rol = toBody * (ro - uPos);
  vec3 rdl = toBody * rd;

  vec3 col = vec3(0.0);
  float a = 0.0;

  vec2 hb = hull(rol, rdl);
  float t = hb.x < 0.0 ? -1.0 : hit(rol, rdl, max(hb.x, 0.0), hb.y + 0.2);

  if (t > 0.0) {
    vec3 p = rol + rdl * t;
    vec3 n = grad(p);

    float c = clamp(dot(-rdl, n), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);

    // Three indices — this is the dispersion.
    vec3 ior = vec3(1.39, 1.48, 1.60);
    vec3 refr = vec3(0.0);

    for (int i = 0; i < 3; i++) {
      vec3 dir;
      vec3 rd2 = refract(rdl, n, 1.0 / ior[i]);

      if (dot(rd2, rd2) < 1e-6) {
        dir = reflect(rdl, n);
      } else {
        vec3 q  = p + rd2 * 0.002;
        float e = leave(q, rd2);
        vec3 pe = q + rd2 * e;
        vec3 ne = grad(pe);
        vec3 rd3 = refract(rd2, -ne, ior[i]);

        if (dot(rd3, rd3) < 1e-6) {
          // Total internal reflection: stays inside and runs to another face.
          vec3 rb = reflect(rd2, -ne);
          vec3 q2 = pe + rb * 0.002;
          float e2 = leave(q2, rb);
          vec3 pe2 = q2 + rb * e2;
          vec3 ne2 = grad(pe2);
          vec3 rd4 = refract(rb, -ne2, ior[i]);
          dir = dot(rd4, rd4) < 1e-6 ? reflect(rb, -ne2) : rd4;
        } else {
          dir = rd3;
        }
      }
      refr[i] = env(uRot * dir)[i];
    }

    vec3 refl = env(uRot * reflect(rdl, n));
    col = mix(refr, refl, F);

    // Curvature term: 1 on the rounded edges, 0 across the flats. Gives the
    // bevels their bright rim without drawing a wireframe.
    vec3 dd = abs(p) - BOX;
    float curv = clamp(length(max(dd, 0.0)) / RND, 0.0, 1.0);
    col += vec3(1.0) * pow(curv, 3.0) * F * (0.55 + uGrab * 0.30);

    a = clamp(dot(col, vec3(0.36)) * 1.85 + F * 0.32, 0.05, 1.0);
  } else {
    // Halo from the SDF at the ray's closest approach to the centre.
    float tc = max(dot(-rol, rdl), 0.0);
    float d  = sdf(rol + rdl * tc);
    float g  = exp(-d * 4.0) * (0.40 + uEnergy * 0.15);
    col = mix(vec3(1.00, 0.52, 0.20), vec3(0.28, 0.62, 1.00), 0.5 + 0.5 * uv.x) * g;
    a   = clamp(g * 0.8, 0.0, 1.0);
  }

  /* Poster pass.
   *
   * A flat theme cannot simply hide the cube — it is the one live object on
   * the page — so the same physics is re-inked instead of re-rendered. Six
   * luminance steps turn continuous refraction into flat bands, the bands are
   * printed in the theme's ink, and the alpha ramp is tightened to a near-hard
   * silhouette. The simulation above is untouched: this is the last thing that
   * happens to the pixel, the way a screen print is the last thing that
   * happens to a photograph.
   */
  if (uFlat > 0.0) {
    float lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float band = floor(lum * 6.0 + 0.5) / 6.0;
    vec3 ink = uTint * (0.30 + 1.15 * band) + vec3(band * band * 0.55);
    col = mix(col, ink, uFlat);
    a = mix(a, smoothstep(0.20, 0.42, a), uFlat);  // drop the soft halo: ink has an edge
  }

  outColor = vec4(col * a, a);
}`;
