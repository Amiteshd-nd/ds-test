'use client';

import { useEffect } from 'react';

import { motion, useMotionValue, useSpring } from '@cloud-march/motion/react';

/**
 * The page's light. Three slow aurora blobs (CSS, see globals.css) and one light
 * that follows the pointer on a spring, so the scene brightens where you look.
 *
 * The pointer light is a transform on a single element: nothing repaints but it.
 * It is hidden for touch pointers and under reduced motion in CSS.
 */
export function Aurora() {
  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);
  // Deliberately slower than a cursor: the light should trail the hand, not stick to it.
  const sx = useSpring(x, { stiffness: 60, damping: 20, mass: 0.8 });
  const sy = useSpring(y, { stiffness: 60, damping: 20, mass: 0.8 });

  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const move = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [x, y]);

  return (
    <div aria-hidden className="aurora">
      <div className="aurora-blob aurora-mint" />
      <div className="aurora-blob aurora-ice" />
      <div className="aurora-blob aurora-gold" />
      <motion.div className="pointer-light" style={{ x: sx, y: sy }} />
      <div className="grain" />
    </div>
  );
}
