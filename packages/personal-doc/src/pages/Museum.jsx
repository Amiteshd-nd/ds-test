import { useEffect, useRef, useState } from 'react';
import { motion } from '@cloud-march/motion/react';
import { Link } from 'react-router-dom';

import GlassCube from '../components/chat/GlassCube';
import DynamicMaterial from '../components/chat/DynamicMaterial';
import WaterGel from '../components/chat/WaterGel';
import { IconChevron } from '../components/chat/Icons';
import '../styles/liquid-glass.css';

/* Museum — the rendering assets built for Home 2.2, shown on their own.
 *
 * On the page itself these sit behind a conversation and are easy to miss.
 * Here each one gets a plinth, its construction written down, and the same
 * state controls the live surface drives it with, so you can push it through
 * every mode it has rather than waiting for a chat to do it for you.
 *
 * To add an exhibit, add one entry to SPECIMENS. Nothing else changes.
 */

const PHASES = ['idle', 'typing', 'thinking', 'answering'];

const SPECIMENS = [
  {
    id: 'glass-cube',
    name: 'Glass Cube',
    status: 'In use',
    where: 'Home 2.2 — above the prompt bar',
    tech: 'WebGL2 · raymarched SDF · chromatic dispersion',
    blurb:
      'No mesh and no 3D library. Every pixel marches a rounded-box distance field, refracts through the solid and samples a procedural studio of softboxes and strip lights on the way out.',
    detail:
      'Red, green and blue refract at three different indices (1.39 / 1.48 / 1.60), so they leave along diverging paths and land on different lights — that separation is the rainbow fringing on the bevels, not a colour ramp painted on top. Rays past the critical angle cannot escape, so they reflect internally and run to a second face before getting another chance out.',
    specs: [
      ['Edges', 'Rounded — a sharp box refracts each face along one near-constant direction and reads as a flat panel'],
      ['Rotation', 'Quaternion integrated from angular velocity; a cube’s inertia tensor is isotropic, so it cannot precess'],
      ['Release', 'No impulse — torque simply stops, so angular momentum carries the spin you gave it'],
      ['Position', 'Damped spring under gravity; it hangs slightly below centre where weight and spring balance'],
    ],
    grabbable: true,
    render: (phase) => <GlassCube phase={phase} className="h-full w-full" />,
  },
  {
    id: 'water-gel',
    name: 'Water Gel',
    status: 'New',
    where: 'Unplaced — built for the collection',
    tech: 'WebGL2 · Rayleigh modes · thin-film interference',
    blurb:
      'A drop held together by surface tension. Poke it and it deforms, then settles through the oscillation modes an actual liquid drop has — not a decorative wobble on a timer.',
    detail:
      'Rayleigh fixes the frequencies: omega squared goes as l(l-1)(l+2), so the l=3 modes run about 1.94x faster than the l=2 fundamental. Viscosity damps them as (l-1)(2l+1), so those same modes also die 2.8x sooner. Both ratios come out of the mode order rather than being tuned, which is why a poke collapses into a slow two-lobed sway as the fine structure drains away first.',
    specs: [
      ['Shape', 'Sphere radius modulated by real spherical harmonics, l = 2 and l = 3'],
      ['Volume', 'Every mode has l >= 2, and those preserve volume to first order — it changes shape without inflating'],
      ['Poking', 'The impulse is projected onto the mode basis, so where you press decides which modes light up'],
      ['Colour', 'Thin-film interference computed against RGB wavelengths, not sampled from a gradient'],
    ],
    grabbable: true,
    grabHint: 'Press and drag to poke it',
    render: (phase) => <WaterGel phase={phase} className="h-full w-full" />,
  },
  {
    id: 'point-cloud',
    name: 'Point-Cloud Material',
    status: 'Retired',
    where: 'Home 2.2 — the original element above the prompt bar',
    tech: 'Canvas 2D · 2,200 points · sum-of-sines field',
    blurb:
      'The first material built for this surface, replaced by the cube. A Fibonacci sphere of points, displaced each frame by a field of offset sines, rotated and projected with a perspective divide.',
    detail:
      'Four offset sines beat a real simplex here: it runs 2,200 times a frame and at this scale nobody can tell the difference. Points are sorted into 16 colour buckets so the render loop sets fillStyle sixteen times a frame rather than 2,200 times, and they are drawn as additive squares so overlaps bloom into the bright core.',
    specs: [
      ['Distribution', 'Golden-angle spiral — even coverage without clustering at the poles'],
      ['Colour', 'Displacement drives hue, depth drives brightness and point size'],
      ['Blending', 'Additive, so density reads as light rather than as overdraw'],
      ['Parallax', 'Tilts toward the pointer, lerped rather than snapped'],
    ],
    grabbable: false,
    render: (phase) => <DynamicMaterial phase={phase} className="h-full w-full" />,
  },
];

/* Heavy renderers: each exhibit holds its own canvas and animation loop, and a
 * WebGL one holds a context the browser counts against a hard per-page cap.
 * Mounting only once a card is near the viewport keeps that cost proportional
 * to what is actually being looked at as the grid grows. */
function useNearViewport() {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, near];
}

function Specimen({ item, index }) {
  const [ref, near] = useNearViewport();
  const [phase, setPhase] = useState('idle');

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: (index % 2) * 0.08 }}
      className="lg-surface relative flex flex-col overflow-hidden rounded-3xl"
    >
      <span
        className="lg-hairline"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.03))' }}
      />

      {/* plinth */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(90% 70% at 50% 40%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 70%), #08080b',
          }}
        />
        <div className="absolute inset-0">{near ? item.render(phase) : null}</div>

        <span className="absolute left-4 top-4 rounded-full bg-white/[0.07] px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/55">
          {item.status}
        </span>
        {item.grabbable && (
          <span className="absolute bottom-4 left-4 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/50">
            {item.grabHint || 'Drag to spin · release to throw'}
          </span>
        )}
      </div>

      {/* state control — the same modes the live surface drives it with */}
      <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-4 py-3">
        {PHASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            aria-pressed={phase === p}
            className={`lg-focus rounded-full px-3 py-1.5 text-[12.5px] capitalize transition-colors ${
              phase === p ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* label */}
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-white">{item.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-white/40">{item.where}</p>
        </div>

        <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-[#c98bff]">{item.tech}</p>

        <p className="text-[14.5px] leading-[1.6] text-white/70">{item.blurb}</p>
        <p className="text-[14px] leading-[1.6] text-white/50">{item.detail}</p>

        <dl className="mt-1 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          {item.specs.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[86px_1fr] gap-3">
              <dt className="text-[12px] uppercase tracking-[0.08em] text-white/30">{k}</dt>
              <dd className="text-[13px] leading-[1.5] text-white/60">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </motion.article>
  );
}

export default function Museum() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Museum — rendering assets';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="lg-root relative min-h-screen"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 60% at 20% 0%, rgba(167,88,255,0.12) 0%, rgba(0,0,0,0) 55%),' +
              'radial-gradient(90% 50% at 85% 10%, rgba(82,146,255,0.10) 0%, rgba(0,0,0,0) 55%)',
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[1180px] px-5 pb-24 pt-8 md:px-8 md:pt-10">
        <Link
          to="/works"
          className="lg-focus inline-flex items-center gap-2 rounded-lg py-2 text-[14px] text-white/50 transition-colors hover:text-white"
        >
          <span className="rotate-90">
            <IconChevron size={16} />
          </span>
          Works
        </Link>

        <header className="mb-10 mt-6 max-w-[680px]">
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white md:text-[46px]">
            Museum
          </h1>
          <p className="mt-4 text-[16px] leading-[1.6] text-white/60">
            The rendering assets built for{' '}
            <Link to="/home-2.2" className="text-white/85 underline decoration-white/25 underline-offset-2">
              Home 2.2
            </Link>
            , on their own plinths. Each one is live, not a recording — push it through its states,
            and grab the ones that let you.
          </p>
          <p className="mt-3 text-[13px] text-white/35">
            {SPECIMENS.length} exhibits · everything drawn in the browser, no 3D library
          </p>
        </header>

        {/* The grid: one column on narrow, two from md up. Two is the ceiling on
            purpose — each cell runs its own render loop, and a third column
            would shrink every exhibit below the size its detail needs. */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          {SPECIMENS.map((item, i) => (
            <Specimen key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>
    </motion.main>
  );
}
