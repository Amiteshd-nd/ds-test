import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FRAG, VERT } from './waterGelShader';

/* The water gel.
 *
 * A liquid drop held together by surface tension does not wobble arbitrarily.
 * It oscillates in spherical-harmonic modes, and Rayleigh's result fixes how
 * fast each one goes:
 *
 *     omega_l^2  =  l(l-1)(l+2) * sigma / (rho * R^3)
 *
 * so the l=3 modes run sqrt(30/8) — about 1.94x — faster than the l=2
 * fundamental. Viscosity damps them at a rate going as (l-1)(2l+1), so those
 * same l=3 modes also die 2.8x sooner. Both ratios are derived from the mode
 * order here rather than dialled in by eye, which is why a poke settles into a
 * slow two-lobed sway: the fine structure drains away first.
 *
 * Poking projects the impulse onto the mode basis, so where you press decides
 * which modes light up — press a pole and the axisymmetric mode dominates,
 * press off-axis and the sectoral ones do.
 *
 * Every mode carried here has l >= 2, and those conserve volume to first
 * order, so the drop changes shape without appearing to inflate.
 *
 * One departure from pure physics, same as the cube: a faint ambient forcing
 * keeps it breathing instead of coming fully to rest.
 */

const MODES = 8;
// Mode order per slot: five l=2 modes, then three l=3.
const L = [2, 2, 2, 2, 2, 3, 3, 3];

const OMEGA_2 = 5.6;      // rad/s for the fundamental
const GAMMA_2 = 0.55;     // damping rate for the fundamental
const AMP_BUDGET = 0.5;   // total |amplitude|, keeps the radius positive

const OMEGA = L.map((l) => OMEGA_2 * Math.sqrt((l * (l - 1) * (l + 2)) / 8));
const GAMMA = L.map((l) => (GAMMA_2 * ((l - 1) * (2 * l + 1))) / 5);

const ENERGY = { idle: 0.55, typing: 0.85, thinking: 1.5, answering: 0.95 };

/** Mode shapes, normalised to peak 1 — must match disp() in the shader. */
function basis(x, y, z) {
  return [
    (3 * z * z - 1) * 0.5,
    x * z * 2,
    y * z * 2,
    x * x - y * y,
    x * y * 2,
    z * (5 * z * z - 3) * 0.5,
    x * (5 * z * z - 1) * 0.72,
    x * (x * x - 3 * y * y),
  ];
}

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

function WaterGel({ phase = 'idle', className = '', style }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const phaseRef = useRef(phase);
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [held, setHeld] = useState(false);

  phaseRef.current = phase;

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
      console.warn('[WaterGel] falling back — ', err.message);
      setFailed(true);
      return undefined;
    }

    const U = {
      res: gl.getUniformLocation(prog, 'uRes'),
      rot: gl.getUniformLocation(prog, 'uRot'),
      pos: gl.getUniformLocation(prog, 'uPos'),
      amp: gl.getUniformLocation(prog, 'uAmp'),
      time: gl.getUniformLocation(prog, 'uTime'),
      grab: gl.getUniformLocation(prog, 'uGrab'),
    };

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const amp = new Float32Array(MODES);
    const vel = new Float32Array(MODES);
    const mat = new Float32Array(9);

    const sim = { yaw: 0.3, pitch: 0.15, pos: [0, 0, 0], lin: [0, 0, 0], grab: 0, clock: 0 };

    let dragging = false;
    let lastPt = null;
    let width = 0;
    let height = 0;
    let raf = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      // Same reasoning as the cube: this marches a deformed field per pixel.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const rotMatrix = () => {
      const cy = Math.cos(sim.yaw), sy = Math.sin(sim.yaw);
      const cx = Math.cos(sim.pitch), sx = Math.sin(sim.pitch);
      // Ry then Rx, column-major.
      mat[0] = cy;       mat[1] = sx * sy;   mat[2] = -cx * sy;
      mat[3] = 0;        mat[4] = cx;        mat[5] = sx;
      mat[6] = sy;       mat[7] = -sx * cy;  mat[8] = cx * cy;
      return mat;
    };

    /** Screen point -> a direction on the body, for projecting a poke. */
    const pokeDir = (clientX, clientY) => {
      const r = host.getBoundingClientRect();
      const span = Math.min(r.width, r.height) * 0.56;
      const sx = (clientX - (r.left + r.width / 2)) / span;
      const sy = -(clientY - (r.top + r.height / 2)) / span;
      const d2 = sx * sx + sy * sy;
      if (d2 > 1) return null;                       // outside the body
      const sz = Math.sqrt(1 - d2);

      // World -> body is the transpose of the rotation.
      const cy = Math.cos(sim.yaw), sny = Math.sin(sim.yaw);
      const cx = Math.cos(sim.pitch), snx = Math.sin(sim.pitch);
      const bx = cy * sx + sny * sz;
      const by = sny * snx * sx + cx * sy - cy * snx * sz;
      const bz = -sny * cx * sx + snx * sy + cy * cx * sz;
      return [bx, by, bz];
    };

    const poke = (dir, strength) => {
      const b = basis(dir[0], dir[1], dir[2]);
      for (let i = 0; i < MODES; i++) vel[i] -= b[i] * strength;
    };

    const step = (dt) => {
      const energy = ENERGY[phaseRef.current] ?? ENERGY.idle;
      sim.clock += dt;

      if (!reduce) {
        for (let i = 0; i < MODES; i++) {
          // Faint ambient forcing so it never settles to a dead sphere.
          const drive =
            0.0075 * energy * Math.sin(sim.clock * (0.7 + i * 0.31) + i * 2.1);

          // Damped harmonic oscillator, semi-implicit Euler.
          const acc = -OMEGA[i] * OMEGA[i] * amp[i] - 2 * GAMMA[i] * vel[i] + drive;
          vel[i] += acc * dt;
          amp[i] += vel[i] * dt;
        }

        // Budget the total deformation rather than clipping modes one by one,
        // which would distort the mode shape instead of scaling it.
        let total = 0;
        for (let i = 0; i < MODES; i++) total += Math.abs(amp[i]);
        if (total > AMP_BUDGET) {
          const k = AMP_BUDGET / total;
          for (let i = 0; i < MODES; i++) {
            amp[i] *= k;
            vel[i] *= k;
          }
        }

        sim.yaw += dt * 0.16 * energy;
        sim.pitch = Math.sin(sim.clock * 0.21) * 0.22;

        for (let i = 0; i < 3; i++) {
          let f = -24 * sim.pos[i] - 3.6 * sim.lin[i];
          if (i === 1) f -= 1.1;                       // gravity sag
          sim.lin[i] += f * dt;
          sim.pos[i] += sim.lin[i] * dt;
        }
      }

      sim.grab += ((dragging ? 1 : 0) - sim.grab) * Math.min(1, dt * 9);
    };

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniformMatrix3fv(U.rot, false, rotMatrix());
      gl.uniform3f(U.pos, sim.pos[0], sim.pos[1], sim.pos[2]);
      gl.uniform1fv(U.amp, amp);
      gl.uniform1f(U.time, sim.clock);
      gl.uniform1f(U.grab, sim.grab);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const onDown = (e) => {
      const dir = pokeDir(e.clientX, e.clientY);
      dragging = true;
      setHeld(true);
      lastPt = { x: e.clientX, y: e.clientY, t: performance.now() };
      canvas.setPointerCapture?.(e.pointerId);
      if (dir) poke(dir, 0.9);
    };

    const onMove = (e) => {
      if (!dragging || !lastPt) return;
      const now = performance.now();
      const dx = e.clientX - lastPt.x;
      const dy = e.clientY - lastPt.y;
      const dt = Math.max(0.004, (now - lastPt.t) / 1000);
      lastPt = { x: e.clientX, y: e.clientY, t: now };

      const speed = Math.hypot(dx, dy) / dt;          // px per second
      const dir = pokeDir(e.clientX, e.clientY);
      if (dir && speed > 1) poke(dir, Math.min(2.2, speed * 0.0016));

      // Dragging also shoves the body; the spring pulls it back.
      const r = host.getBoundingClientRect();
      const span = Math.min(r.width, r.height) || 1;
      sim.lin[0] += (dx / span) * 2.4;
      sim.lin[1] += (-dy / span) * 2.4;
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      setHeld(false);
      lastPt = null;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    resize();

    if (reduce) {
      draw();
      const ro = new ResizeObserver(() => { resize(); draw(); });
      ro.observe(host);
      return () => ro.disconnect();
    }

    let last = performance.now();
    const loop = (now) => {
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
    const onLost = (e) => { e.preventDefault(); cancelAnimationFrame(raf); };

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
        <div aria-hidden="true" className="grid h-full w-full place-items-center">
          <div
            className="h-1/2 w-1/2 max-h-28 max-w-28 rounded-[46%] opacity-80 blur-[3px]"
            style={{
              background:
                'radial-gradient(circle at 38% 32%, rgba(255,255,255,.95), rgba(170,230,255,.9) 40%, rgba(120,150,255,.75) 62%, rgba(80,220,200,.6) 100%)',
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

export default memo(WaterGel);
