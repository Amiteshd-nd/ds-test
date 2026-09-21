import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  rise,
  staggerChildren,
  useMotionSafe,
  useReducedMotion,
} from '@cloud-march/motion/react';
import './bangalore-times-coming-soon.css';

/*
 * Holding screen shown instead of the Phaser build on /game/bangalore-times.
 *
 * The game bundle is no longer imported by the route, so parking it here also
 * takes Phaser (~1MB) back out of the build entirely rather than lazy-loading
 * something nobody can reach.
 */

// Darkest to brightest. Same ramp the Works card paints its gradient from.
const PALETTE = [
  [4, 20, 13],
  [7, 32, 22],
  [12, 58, 36],
  [15, 81, 50],
  [31, 138, 77],
  [61, 220, 132],
];

// 4x4 ordered dither. Breaks the bands between palette steps into the stippled
// edge that reads as pixel art rather than as a blurry gradient.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16);

const COLS = 128;
const FRAME_MS = 1000 / 30; // Pixel art at 30fps. 60 costs twice as much and reads no smoother.

// Hoisted so the variant objects keep a stable identity across renders.
const GROUP = staggerChildren(5, 0.5);
const ITEM = rise(14);

/**
 * Paint one frame of the field into `image`, then blit it.
 *
 * Two of the four waves are separable, so their sines are computed once per row
 * or column instead of once per cell.
 */
function paintField(ctx, image, cols, rows, t) {
  const data = image.data;

  const colWave = new Float32Array(cols);
  for (let x = 0; x < cols; x += 1) {
    colWave[x] = Math.sin((x / cols) * 9 + t * 0.7);
  }

  for (let y = 0; y < rows; y += 1) {
    const ny = y / rows;
    const rowWave = Math.sin(ny * 11 - t * 0.5);

    for (let x = 0; x < cols; x += 1) {
      const nx = x / cols;

      let v = colWave[x] + rowWave;
      v += Math.sin((nx + ny) * 7 + t * 0.35);
      v += Math.sin(Math.hypot(nx - 0.5, ny - 0.5) * 16 - t * 0.9);
      v = (v / 4 + 1) / 2; // -1..1 -> 0..1

      // Hold the middle dark so the copy sitting on top keeps its contrast.
      const d = Math.hypot((nx - 0.5) * 1.55, ny - 0.5);
      v *= Math.min(1, Math.max(0, (d - 0.16) / 0.42));

      // Squaring biases the field toward the dark end of the ramp, so the
      // bright greens stay occasional rather than carpeting the screen.
      v = v * v + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) / PALETTE.length;

      const step = PALETTE[Math.min(PALETTE.length - 1, Math.max(0, Math.floor(v * PALETTE.length)))];
      const i = (y * cols + x) * 4;
      data[i] = step[0];
      data[i + 1] = step[1];
      data[i + 2] = step[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

function PixelField({ reduced }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    let cols = 0;
    let rows = 0;
    let image = null;
    let frame = 0;
    let last = 0;
    let t = 0;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      cols = COLS;
      rows = Math.max(40, Math.min(180, Math.round(COLS * (height / width))));
      canvas.width = cols;
      canvas.height = rows;
      image = ctx.createImageData(cols, rows);
      paintField(ctx, image, cols, rows, t);
    };

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      t += 0.05;
      if (image) paintField(ctx, image, cols, rows, t);
    };

    const start = () => {
      if (reduced || frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    // Reduced motion still gets the texture, it just stops travelling.
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="bts-field" aria-hidden="true" />;
}

export default function BangaloreTimesComingSoon() {
  const reduced = useReducedMotion();
  const item = useMotionSafe(ITEM);

  return (
    <main className="bts">
      <PixelField reduced={reduced} />
      <div className="bts-scan" aria-hidden="true" />
      <div className="bts-vignette" aria-hidden="true" />

      <motion.div className="bts-content" variants={GROUP} initial="hidden" animate="visible">
        <motion.p className="bts-eyebrow" variants={item}>
          Namma Quest
        </motion.p>

        <motion.h1 className="bts-title" variants={item}>
          Coming soon
        </motion.h1>

        <motion.p className="bts-sub" variants={item}>
          The playable demo is offline while Bangalore gets rebuilt. New streets, new traffic, and a
          reason to be out in them.
        </motion.p>

        <motion.div variants={item}>
          <span className="bts-status">Status: in development</span>
        </motion.div>

        <motion.div variants={item}>
          <Link to="/works" className="bts-back">
            Back to works
          </Link>
        </motion.div>
      </motion.div>
    </main>
  );
}
