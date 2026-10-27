'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { LANDMARKS } from '@/lib/landmarks';
import { layoutCrowd, type Placement } from '@/lib/stickers';

/**
 * The sticker crowd, as DOM rather than a background image, so each sticker can
 * react to the pointer (CSS :hover) and be clicked for its label.
 *
 * Each sticker is a cut-out PNG from public/stickers/. The crowd is laid out in a
 * fixed field, centred on the viewport and scaled by CSS. The server lays it out
 * with a fixed seed for the first paint; on mount the client re-lays it with a
 * random one, so every reload is a different arrangement.
 *
 * Two layers: `back` sits behind the card, `front` in front of it. Which stickers
 * are in front is worked out here from the real card on the real screen (and
 * again on resize): the ones in the row under the card whose tops enter its
 * bottom edge a little, so they clip the border, never the words, and lift above
 * the card on hover. On phones everything stays behind.
 */

export const FIELD = { width: 4000, height: 2400 };
// Row pitch 2400/18 = 133 units against stickers ~270 tall: each row covers half the one above.
const GRID = { cols: 26, rows: 18 };
// The card at desktop, in field units: the server's first guess for the front layer.
const CARD_HALF = { x: 600, y: 450 };
const SERVER_SEED = 7;
/** How far a sticker's top may enter the card's bottom edge and still sit in front, in CSS px. */
const MAX_IN = 60;

type CrowdState = { placements: Placement[]; front: Set<number> };

const CrowdContext = createContext<CrowdState>({ placements: [], front: new Set() });

export function CrowdProvider({ children }: { children: React.ReactNode }) {
  const [seed, setSeed] = useState(SERVER_SEED);
  const placements = useMemo(
    () => layoutCrowd({ ...FIELD, ...GRID, seed, cardHalf: CARD_HALF }),
    [seed],
  );
  const [front, setFront] = useState<Set<number>>(() => new Set(placements.flatMap((p, i) => (p.front ? [i] : []))));

  // A new arrangement on every load, after hydration so the first paint matches the server.
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 2 ** 31));
  }, []);

  // Which stickers sit in front: measured against the real card and screen.
  useEffect(() => {
    const measure = () => {
      const card = document.querySelector('[data-card]');
      const crowd = document.querySelector('.crowd');
      if (!card || !crowd) return;
      if (window.matchMedia('(max-width: 640px)').matches) {
        setFront(new Set());
        return;
      }
      const k = parseFloat(getComputedStyle(crowd).getPropertyValue('--crowd-scale')) || 0.56;
      const c = card.getBoundingClientRect();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const next = new Set<number>();
      placements.forEach((p, i) => {
        const sx = cx + (p.x - FIELD.width / 2) * k;
        const sy = cy + (p.y - FIELD.height / 2) * k;
        // 1.1: a rotated sticker's box is a little taller than its scale.
        const half = (100 * p.scale * k * 1.1) / 2;
        const top = sy - half;
        const below = sy > c.top + c.height / 2;
        const touches = top < c.bottom && top > c.bottom - MAX_IN && sx + half > c.left && sx - half < c.right;
        if (below && touches) next.add(i);
      });
      setFront(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [placements]);

  const value = useMemo(() => ({ placements, front }), [placements, front]);
  return <CrowdContext.Provider value={value}>{children}</CrowdContext.Provider>;
}

export function Crowd({ layer }: { layer: 'back' | 'front' }) {
  const { placements, front } = useContext(CrowdContext);
  return (
    <div aria-hidden className={`crowd crowd-${layer}`}>
      <div className="crowd-field">
        {placements.map((p, i) =>
          front.has(i) === (layer === 'front') ? <Sticker key={`${p.name}-${i}`} p={p} /> : null,
        )}
      </div>
    </div>
  );
}

function Sticker({ p }: { p: Placement }) {
  const src = `/stickers/${p.name}.png`;
  const landmark = LANDMARKS[p.name];
  return (
    <span
      className="sticker"
      data-name={landmark.name}
      data-place={landmark.place}
      style={
        {
          '--x': p.x,
          '--y': p.y,
          '--rot': `${p.rot.toFixed(1)}deg`,
          '--s': p.scale.toFixed(2),
          '--src': `url(${src})`,
          '--fill-src': `url(/stickers/fill/${p.name}.png)`,
          '--sticker-fill': landmark.color,
        } as React.CSSProperties
      }
    >
      {/* Plain <img>, not next/image: hundreds of them, all tiny, all from one
          folder, and the optimiser would add a request per size for each. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={100} height={100} loading="lazy" decoding="async" draggable={false} />
      {/* The hover fill: the painted regions from public/stickers/fill/, multiplied
          over the drawing so the colour sits inside the lines and the lines stay black. */}
      <i className="sticker-fill" aria-hidden />
    </span>
  );
}
