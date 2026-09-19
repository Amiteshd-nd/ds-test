import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '@cloud-march/motion/react';

/* The living material that sits above the prompt bar.
 *
 * A point cloud on a 2D canvas rather than WebGL: ~2,200 points distributed on
 * a Fibonacci sphere, displaced each frame by a sum-of-sines field, rotated,
 * projected with a cheap perspective divide and drawn as additive squares.
 * No 3D dependency, ~1.5ms a frame on a laptop, and it degrades to a single
 * static frame when the OS asks for reduced motion.
 */

const COUNT = 2200;
const BUCKETS = 16;

// Magenta into violet into deep indigo, matching the orb in the reference.
const RAMP = [
  [255, 96, 222],
  [232, 82, 238],
  [178, 88, 255],
  [124, 88, 246],
  [ 74, 78, 198],
];

/** Sample the ramp into fixed rgb strings so the loop sets fillStyle 16 times
 *  a frame instead of 2,200 times. */
function buildPalette() {
  const out = [];
  for (let i = 0; i < BUCKETS; i++) {
    const t = (i / (BUCKETS - 1)) * (RAMP.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(RAMP.length - 1, lo + 1);
    const f = t - lo;
    const c = RAMP[lo].map((v, k) => Math.round(v + (RAMP[hi][k] - v) * f));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
}

const PALETTE = buildPalette();

/** Points spread evenly over a unit sphere via the golden-angle spiral. */
function buildSphere() {
  const pts = new Float32Array(COUNT * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts[i * 3] = Math.cos(th) * r;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = Math.sin(th) * r;
  }
  return pts;
}

/** Cheap organic field. Four offset sines beat a real simplex here because it
 *  runs 2,200 times a frame and nobody can tell the difference at this scale. */
function field(x, y, z, t) {
  return (
    Math.sin(x * 1.7 + t) * 0.5 +
    Math.sin(y * 2.3 - t * 0.83) * 0.36 +
    Math.sin(z * 1.9 + t * 0.61) * 0.3 +
    Math.sin((x + y + z) * 1.31 + t * 1.17) * 0.24
  );
}

// How agitated the material is per conversation phase.
const ENERGY = {
  idle: 0.55,
  typing: 0.92,
  thinking: 1.5,
  answering: 0.8,
};

function DynamicMaterial({ phase = 'idle', className = '', style }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const phaseRef = useRef(phase);
  const reduce = useReducedMotion();

  phaseRef.current = phase;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: true });
    const pts = buildSphere();

    // Reused bucket lists — allocating 16 arrays a frame would churn the GC.
    const buckets = Array.from({ length: BUCKETS }, () => []);

    let w = 0;
    let h = 0;
    let dpr = 1;
    let glow = null;

    // Animated state, lerped rather than snapped so phase changes feel physical.
    let energy = ENERGY[phaseRef.current] ?? ENERGY.idle;
    let tiltX = 0;
    let tiltY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let clock = 0;
    let yaw = 0;
    let raf = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The soft core behind the points. Cached: gradients are not free.
      const radius = Math.min(w, h) * 0.5;
      glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, radius);
      glow.addColorStop(0, 'rgba(214,96,255,0.30)');
      glow.addColorStop(0.42, 'rgba(160,74,246,0.13)');
      glow.addColorStop(1, 'rgba(90,50,200,0)');
    };

    const onPointer = (e) => {
      const rect = host.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Clamped so the parallax stays a hint, never a spin.
      targetTiltY = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.5))) * 0.34;
      targetTiltX = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.5))) * 0.2;
    };

    const draw = (dt) => {
      const targetEnergy = ENERGY[phaseRef.current] ?? ENERGY.idle;
      energy += (targetEnergy - energy) * Math.min(1, dt * 2.6);
      tiltX += (targetTiltX - tiltX) * Math.min(1, dt * 3.2);
      tiltY += (targetTiltY - tiltY) * Math.min(1, dt * 3.2);
      clock += dt * (0.34 + energy * 0.5);
      yaw += dt * (0.1 + energy * 0.16);

      ctx.clearRect(0, 0, w, h);

      if (glow) {
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }

      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.355;
      const amp = 0.17 + energy * 0.13;
      const breathe = 1 + Math.sin(clock * 0.6) * 0.035;

      const ay = yaw + tiltY;
      const ax = Math.sin(clock * 0.21) * 0.28 + tiltX;
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);

      for (let i = 0; i < BUCKETS; i++) buckets[i].length = 0;

      for (let i = 0; i < COUNT; i++) {
        const x0 = pts[i * 3];
        const y0 = pts[i * 3 + 1];
        const z0 = pts[i * 3 + 2];

        const d = field(x0 * 1.55, y0 * 1.55, z0 * 1.55, clock);
        const r = base * breathe * (1 + d * amp);

        let x = x0 * r;
        let y = y0 * r;
        let z = z0 * r;

        // Yaw about Y, then pitch about X.
        const xr = x * cosY + z * sinY;
        const zr = -x * sinY + z * cosY;
        const yr = y * cosX - zr * sinX;
        const zf = y * sinX + zr * cosX;

        // Perspective divide. depth 0 (far) .. 1 (near).
        const persp = 620 / (620 - zf);
        const px = cx + xr * persp;
        const py = cy + yr * persp;
        if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;

        const depth = (zf / base + 1.35) / 2.7;
        // Displacement drives hue, depth drives brightness and size.
        const bucket = Math.max(
          0,
          Math.min(BUCKETS - 1, Math.round(((d + 1) / 2) * 0.62 * (BUCKETS - 1) + depth * 0.38 * (BUCKETS - 1))),
        );
        const size = Math.max(0.65, (0.8 + depth * 1.85) * persp * 0.85);
        const alpha = 0.14 + depth * depth * 0.95;

        const b = buckets[bucket];
        b.push(px, py, size, alpha);
      }

      // Additive so overlapping points bloom into the bright core.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < BUCKETS; i++) {
        const b = buckets[i];
        if (!b.length) continue;
        ctx.fillStyle = PALETTE[i];
        for (let k = 0; k < b.length; k += 4) {
          ctx.globalAlpha = b[k + 3];
          ctx.fillRect(b[k], b[k + 1], b[k + 2], b[k + 2]);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();

    if (reduce) {
      // One representative frame, then stop. No loop, no listeners.
      draw(0.6);
      const ro = new ResizeObserver(() => {
        resize();
        draw(0.6);
      });
      ro.observe(host);
      return () => ro.disconnect();
    }

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduce]);

  return (
    <div ref={hostRef} className={`relative ${className}`} style={style} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

// Only `phase` should ever reach the canvas; the page's streaming re-renders
// must not churn this component.
export default memo(DynamicMaterial);
