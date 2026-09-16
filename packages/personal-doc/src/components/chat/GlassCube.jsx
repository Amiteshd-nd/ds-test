import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FRAG, VERT } from './glassCubeShader';

/* The glass cube above the prompt bar.
 *
 * Rendered by a single fragment shader in raw WebGL2 — no 3D library, no mesh.
 * See glassCubeShader.js for how the refraction works.
 *
 * The motion is a real rigid-body simulation rather than a looping animation:
 *
 *   Rotation  Orientation is a quaternion integrated from an angular velocity,
 *             q' = q + ½·ω⊗q·dt. A cube's inertia tensor is isotropic (all
 *             three principal moments are equal), so a torque-free cube cannot
 *             precess or tumble — ω stays fixed in direction on its own. That
 *             is why integrating ω directly is not an approximation here; for
 *             any other shape it would be, and Euler's equations would apply.
 *
 *   Throwing  Dragging rotates it and records ω. Releasing simply stops
 *             applying torque, so it carries on at the ω it had — angular
 *             momentum is conserved, and a flick spins it exactly as hard as
 *             you flicked. Air drag then bleeds it off exponentially.
 *
 *   Position  A damped spring with gravity. It hangs slightly below centre
 *             because weight and spring balance below the rest length, and it
 *             bobs when disturbed instead of sliding linearly.
 *
 * One deliberate departure from pure physics: drag decays toward a slow
 * ambient spin rather than to a dead stop, so an untouched cube keeps drifting.
 * A real cube in air would halt.
 */

const DRAG_PER_PX = 0.0085;   // radians of rotation per pixel dragged
const AIR_DRAG = 0.85;        // exponential decay of ω, per second
const AMBIENT_PULL = 0.5;     // how fast ω is drawn back to the idle drift
const GRAVITY = 1.35;
const SPRING_K = 26.0;
const SPRING_C = 3.4;
const GRAB_PULL = 14.0;       // spring coupling toward a held pointer
const MAX_SPIN = 14.0;        // rad/s, so a violent flick stays legible

const ENERGY = { idle: 0.55, typing: 0.85, thinking: 1.5, answering: 0.95 };

/* The theme's ink, defaulted to "none" so the component still renders as pure
 * glass when nobody passes one. */
const GLASS = { flat: 0, tint: [1, 1, 1], bands: 6, pixel: 0 };

/* ------------------------------------------------------------ quaternions */

function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function qAxisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

/** Body-to-world rotation matrix, column-major for uniformMatrix3fv. */
function qToMat3(q, out) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  out[0] = 1 - (yy + zz); out[1] = xy + wz;       out[2] = xz - wy;
  out[3] = xy - wz;       out[4] = 1 - (xx + zz); out[5] = yz + wx;
  out[6] = xz + wy;       out[7] = yz - wx;       out[8] = 1 - (xx + yy);
  return out;
}

/* ------------------------------------------------------------------ setup */

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || 'shader compile failed');
  }
  return sh;
}

function buildProgram(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(log || 'program link failed');
  }
  return prog;
}

function GlassCube({ phase = 'idle', material = GLASS, className = '', style }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const phaseRef = useRef(phase);
  // Through a ref, like phase: the theme changing must not re-run the effect,
  // which would drop the GL context and restart the simulation mid-spin.
  const materialRef = useRef(material);
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [held, setHeld] = useState(false);

  phaseRef.current = phase;
  materialRef.current = material;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      setFailed(true);
      return undefined;
    }

    let prog;
    try {
      prog = buildProgram(gl);
    } catch (err) {
      console.warn('[GlassCube] falling back — ', err.message);
      setFailed(true);
      return undefined;
    }

    const U = {
      res: gl.getUniformLocation(prog, 'uRes'),
      rot: gl.getUniformLocation(prog, 'uRot'),
      pos: gl.getUniformLocation(prog, 'uPos'),
      energy: gl.getUniformLocation(prog, 'uEnergy'),
      grab: gl.getUniformLocation(prog, 'uGrab'),
      flat: gl.getUniformLocation(prog, 'uFlat'),
      tint: gl.getUniformLocation(prog, 'uTint'),
      bands: gl.getUniformLocation(prog, 'uBands'),
      pixel: gl.getUniformLocation(prog, 'uPixel'),
    };

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied source

    const mat = new Float32Array(9);

    // ---- simulation state -------------------------------------------------
    const s = {
      q: qnorm([0.28, 0.36, 0.1, 0.88]),
      w: [0.32, 0.62, 0.1],
      pos: [0, 0, 0],
      vel: [0, 0, 0],
      grab: 0,
      target: [0, 0],
    };

    let dragging = false;
    let lastPt = null;
    let width = 0;
    let height = 0;
    let raf = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      // Capped below the display's DPR on purpose. Every fragment raymarches
      // the solid three times over (once per dispersed channel), so this is the
      // cheapest available lever and a soft refractive object hides the
      // resolution loss almost completely.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const step = (dt) => {
      const energy = ENERGY[phaseRef.current] ?? ENERGY.idle;

      if (!reduce) {
        // Angular: exponential air drag, then a gentle pull toward the drift.
        const drag = Math.exp(-AIR_DRAG * dt);
        const ambient = [0.10 * energy, 0.26 * energy, 0.05 * energy];
        const pull = 1 - Math.exp(-AMBIENT_PULL * dt);

        for (let i = 0; i < 3; i++) {
          if (!dragging) {
            s.w[i] *= drag;
            s.w[i] += (ambient[i] - s.w[i]) * pull;
          }
          s.w[i] = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, s.w[i]));
        }

        // q' = q + ½·ω⊗q·dt, renormalised to stay a unit quaternion.
        const wq = [s.w[0], s.w[1], s.w[2], 0];
        const dq = qmul(wq, s.q);
        s.q = qnorm([
          s.q[0] + 0.5 * dq[0] * dt,
          s.q[1] + 0.5 * dq[1] * dt,
          s.q[2] + 0.5 * dq[2] * dt,
          s.q[3] + 0.5 * dq[3] * dt,
        ]);

        // Linear: gravity + spring to origin, plus the grab coupling.
        for (let i = 0; i < 3; i++) {
          let f = -SPRING_K * s.pos[i] - SPRING_C * s.vel[i];
          if (i === 1) f -= GRAVITY;
          if (dragging && i < 2) f += (s.target[i] - s.pos[i]) * GRAB_PULL;
          s.vel[i] += f * dt;
          s.pos[i] += s.vel[i] * dt;
        }
      }

      s.grab += ((dragging ? 1 : 0) - s.grab) * Math.min(1, dt * 9);
    };

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniformMatrix3fv(U.rot, false, qToMat3(s.q, mat));
      gl.uniform3f(U.pos, s.pos[0], s.pos[1], s.pos[2]);
      gl.uniform1f(U.energy, ENERGY[phaseRef.current] ?? ENERGY.idle);
      gl.uniform1f(U.grab, s.grab);
      const ink = materialRef.current || GLASS;
      gl.uniform1f(U.flat, ink.flat);
      gl.uniform3f(U.tint, ink.tint[0], ink.tint[1], ink.tint[2]);
      gl.uniform1f(U.bands, ink.bands ?? GLASS.bands);
      gl.uniform1f(U.pixel, ink.pixel ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    /* ---- interaction ---------------------------------------------------- */

    const onDown = (e) => {
      dragging = true;
      setHeld(true);
      lastPt = { x: e.clientX, y: e.clientY, t: performance.now() };
      canvas.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e) => {
      if (!dragging || !lastPt) return;
      const now = performance.now();
      const dx = e.clientX - lastPt.x;
      const dy = e.clientY - lastPt.y;
      const dt = Math.max(0.001, (now - lastPt.t) / 1000);
      lastPt = { x: e.clientX, y: e.clientY, t: now };

      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        // Screen-space drag maps to a world axis: horizontal spins about +Y,
        // vertical about +X, so the face under the cursor follows it.
        const angle = dist * DRAG_PER_PX;
        const ax = dy / dist;
        const ay = dx / dist;
        s.q = qnorm(qmul(qAxisAngle(ax, ay, 0, angle), s.q));

        // Record ω so releasing hands the cube the spin it already had.
        const inst = angle / dt;
        s.w[0] = s.w[0] * 0.45 + ax * inst * 0.55;
        s.w[1] = s.w[1] * 0.45 + ay * inst * 0.55;
        s.w[2] *= 0.45;
      }

      const rect = host.getBoundingClientRect();
      const span = Math.min(rect.width, rect.height) || 1;
      s.target[0] = ((e.clientX - (rect.left + rect.width / 2)) / span) * 0.5;
      s.target[1] = (-(e.clientY - (rect.top + rect.height / 2)) / span) * 0.5;
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      setHeld(false);
      lastPt = null;
      canvas.releasePointerCapture?.(e.pointerId);
      // No impulse on release — ω simply stops being driven and is conserved.
    };

    resize();

    if (reduce) {
      // One still frame, and grabbing still works — it just carries no inertia.
      draw();
      const ro = new ResizeObserver(() => { resize(); draw(); });
      ro.observe(host);
      const redraw = () => { step(0); draw(); };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', (e) => { onMove(e); redraw(); });
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      return () => {
        ro.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }

    let last = performance.now();
    const loop = (now) => {
      // Clamp dt: a backgrounded tab resumes with a huge gap that would
      // otherwise explode the integrator on the first frame back.
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    const onLost = (e) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('webglcontextlost', onLost);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(prog);
      gl.deleteVertexArray(vao);
    };
  }, [reduce]);

  return (
    <div ref={hostRef} className={`relative ${className}`} style={style}>
      {failed ? (
        // No WebGL2: a quiet CSS stand-in rather than an empty slot.
        <div aria-hidden="true" className="grid h-full w-full place-items-center">
          <div
            className="lg-spin h-1/2 w-1/2 max-h-24 max-w-24 rotate-45 rounded-[22%] opacity-70"
            style={{
              background: 'var(--lg-spectrum)',
              filter: 'blur(var(--lg-spectrum-blur))',
            }}
          />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className={`block h-full w-full touch-none select-none ${held ? 'cursor-grabbing' : 'cursor-grab'}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default memo(GlassCube);
