'use client';

/**
 * @cloud-march/motion/react - React presets built on motion.dev.
 *
 * Import variants from here instead of writing `initial`/`animate` objects by
 * hand. That is the whole point: five packages spelling the same fade five
 * different ways is how a monorepo stops feeling like one product.
 *
 * Every variant below is paired with `useMotionSafe()`, which collapses motion
 * to a plain opacity change when the user has asked for reduced motion. Nothing
 * is hidden from that user, it simply does not travel.
 */

import { useMemo } from 'react';
import * as mr from 'motion/react';
import { useReducedMotion } from 'motion/react';

import { duration, ease, spring, distance, staggerFor } from './tokens.js';

/**
 * motion.dev's entire React API, passed straight through.
 *
 * Wholesale rather than a hand-picked list. A whitelist here already cost us a
 * build: `useMotionTemplate` was not on it, and a component that needed it
 * failed to bundle. There are ~398 exports; curating them is not our job.
 *
 * `motion` and `m` are bound locally before re-export, matching what the motion
 * package itself does: a bare `export { motion } from 'motion/react'` sitting
 * next to `export *` is a duplicate-source re-export that has made Next.js
 * Turbopack run out of memory during module-graph analysis
 * (motiondivision/motion#3741). Local declarations shadow the wildcard per the
 * ES spec, so these two come from the explicit bindings and the rest from
 * `export *`.
 */
export * from 'motion/react';

const motion = mr.motion;
const m = mr.m;
export { motion, m };

/**
 * Our tokens, under one namespace: `tokens.spring.soft`, `tokens.stagger.normal`.
 *
 * Namespaced because `spring`, `stagger` and `distance` are real motion.dev
 * exports. The non-colliding names are also exported individually below.
 */
export * as tokens from './tokens.js';
export { duration, ease, staggerFor, defaultTransition } from './tokens.js';

/** Fade only. The safe default, and the reduced-motion fallback for everything else. */
export const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.brisk, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.quick, ease: ease.in } },
};

/**
 * Fade up from below. The workhorse entrance for content.
 *
 * @param {number} [y=distance.rise] travel distance in px
 */
export function rise(y = distance.rise) {
  return {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: { duration: duration.gentle, ease: ease.out } },
    exit: { opacity: 0, y: y / 2, transition: { duration: duration.quick, ease: ease.in } },
  };
}

/**
 * Scale in from slightly small. Popovers, tooltips, menus.
 *
 * Pair with a `transformOrigin` matching the trigger, or it reads as a zoom from
 * nowhere.
 */
export const pop = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.quick, ease: ease.in } },
};

/**
 * A sheet or drawer sliding in from an edge.
 *
 * @param {'bottom' | 'top' | 'left' | 'right'} [from='bottom']
 */
export function sheet(from = 'bottom') {
  const axis = from === 'left' || from === 'right' ? 'x' : 'y';
  const sign = from === 'bottom' || from === 'right' ? 1 : -1;
  const offset = `${sign * 100}%`;

  return {
    hidden: { [axis]: offset },
    visible: { [axis]: 0, transition: { duration: duration.gentle, ease: ease.drawer } },
    exit: { [axis]: offset, transition: { duration: duration.brisk, ease: ease.drawer } },
  };
}

/**
 * A parent variant that staggers its children.
 *
 * Put this on the list, `rise()` or `fade` on each item, and let the children
 * inherit `visible` rather than animating each one independently.
 *
 * @param {number} [count=6] how many children, so the sequence stays inside its budget
 * @param {number} [total=0.4] budget for the whole sequence, in seconds
 */
export function staggerChildren(count = 6, total = 0.4) {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerFor(count, total),
        delayChildren: duration.instant,
      },
    },
  };
}

/** Hover and press affordances for a button or card. Spread onto a `motion.*` element. */
export const tappable = {
  whileHover: { y: -distance.nudge / 2, transition: { duration: duration.quick, ease: ease.out } },
  whileTap: { scale: 0.97, transition: { duration: duration.instant, ease: ease.out } },
};

/**
 * Strip travel out of a variant set when the user has asked for reduced motion.
 *
 * Returns the variants unchanged normally, and a fade-only equivalent otherwise.
 * The element still appears; it just does not move or scale.
 *
 * @template T
 * @param {T} variants a variant object, e.g. `rise()` or `pop`
 * @returns {T} the variants, or a fade-only stand-in
 *
 * @example
 *   const variants = useMotionSafe(rise());
 *   return <motion.div variants={variants} initial="hidden" animate="visible" />;
 */
export function useMotionSafe(variants) {
  const reduced = useReducedMotion();
  return useMemo(() => (reduced ? /** @type {any} */ (fade) : variants), [reduced, variants]);
}

/**
 * Scroll-reveal props for a single element, ready to spread.
 *
 * Uses motion's `whileInView` (IntersectionObserver underneath), fires once, and
 * falls back to a fade under reduced motion.
 *
 * @param {object} [options]
 * @param {number} [options.y=distance.step] travel distance in px
 * @param {number} [options.amount=0.3] fraction visible before it fires
 *
 * @example
 *   <motion.section {...useReveal()}>…</motion.section>
 */
export function useReveal(options = {}) {
  const { y = distance.step, amount = 0.3 } = options;
  const reduced = useReducedMotion();

  return useMemo(
    () => ({
      initial: reduced ? { opacity: 0 } : { opacity: 0, y },
      whileInView: reduced ? { opacity: 1 } : { opacity: 1, y: 0 },
      viewport: { once: true, amount },
      transition: { duration: duration.gentle, ease: ease.out },
    }),
    [reduced, y, amount],
  );
}
