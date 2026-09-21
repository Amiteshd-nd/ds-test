import { useId, useMemo } from 'react';
import { MARK_PALETTES } from './markPalettes';

/*
 * The artwork on a project card.
 *
 * This replaces the clay-render icons. Those were a set of unrelated objects at
 * unrelated scales (a truck, a screenshot, a logo), which is why the old list
 * read as a pile rather than a body of work. This draws the same kind of thing
 * every time: a long-exposure smear of one palette, seeded off the project's
 * name so a project always gets its own image and never a random one.
 *
 * It is SVG rather than a bitmap because it has to hold up as a 140px tile and
 * as a 400px card header, and because a gradient that ships as 900 bytes does
 * not need a loading state.
 */

/* FNV-1a. Small, stable across reloads, and good enough to decorrelate the few
   values pulled out of it below. */
function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

export default function ProjectMark({ palette = 'ember', seed = '', className = '', label }) {
  const uid = useId().replace(/:/g, '');
  const colors = MARK_PALETTES[palette] || MARK_PALETTES.ember;

  const streaks = useMemo(() => {
    const random = rng(seedOf(`${palette}:${seed}`));
    /* A fixed tilt with a little jitter reads as one exposure. Randomising the
       angle per streak reads as noise. */
    const tilt = -38 + random() * 16;

    return Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return {
        cx: 40 + random() * 340,
        cy: 20 + random() * 200,
        rx: 60 + random() * 170,
        ry: 8 + random() * 30,
        rot: tilt + (random() - 0.5) * 22,
        fill: colors[1 + Math.min(2, Math.floor(t * 3))],
        opacity: 0.45 + random() * 0.45,
      };
    });
  }, [palette, seed, colors]);

  const sparks = useMemo(() => {
    const random = rng(seedOf(`spark:${seed}`));
    return Array.from({ length: 3 }, () => ({
      cx: 90 + random() * 260,
      cy: 40 + random() * 150,
      r: 10 + random() * 26,
      opacity: 0.5 + random() * 0.4,
    }));
  }, [seed]);

  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <defs>
        <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={colors[0]} />
          <stop offset="55%" stopColor={colors[1]} />
          <stop offset="100%" stopColor={colors[0]} />
        </linearGradient>
        {/* One blur for the body of the smear, a tighter one for the highlights,
            so the sparks stay bright instead of dissolving into the streaks. */}
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id={`${uid}-tight`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <rect width="400" height="240" fill={`url(#${uid}-ground)`} />

      <g filter={`url(#${uid}-soft)`}>
        {streaks.map((s, i) => (
          <ellipse
            key={i}
            cx={s.cx}
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            fill={s.fill}
            opacity={s.opacity}
            transform={`rotate(${s.rot} ${s.cx} ${s.cy})`}
          />
        ))}
      </g>

      <g filter={`url(#${uid}-tight)`}>
        {sparks.map((s, i) => (
          <ellipse
            key={i}
            cx={s.cx}
            cy={s.cy}
            rx={s.r * 1.9}
            ry={s.r * 0.55}
            fill={colors[3]}
            opacity={s.opacity}
            transform={`rotate(-34 ${s.cx} ${s.cy})`}
          />
        ))}
      </g>

      {/* Corner falloff, so the art sits under the tab rather than fighting it. */}
      <rect width="400" height="240" fill={`url(#${uid}-vignette)`} opacity="0.5" />
      <defs>
        <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.35" r="0.85">
          <stop offset="55%" stopColor={colors[0]} stopOpacity="0" />
          <stop offset="100%" stopColor={colors[0]} stopOpacity="0.9" />
        </radialGradient>
      </defs>
    </svg>
  );
}
