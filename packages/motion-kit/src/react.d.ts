/**
 * Types for @cloud-march/motion/react.
 *
 * Hand-written, same as the root entry: no build step, so these declarations are
 * the contract. Keep them in step with `react.js`.
 */

import type { Variants, MotionProps } from 'motion/react';

/** motion.dev's entire React API, passed straight through. */
export * from 'motion/react';

export type {
  Easing,
  SpringPreset,
  DurationTokens,
  EaseTokens,
  SpringTokens,
  DistanceTokens,
  StaggerTokens,
} from './index.js';

export { tokens, duration, ease, staggerFor, defaultTransition } from './index.js';

/** Fade only. The safe default, and the reduced-motion fallback for everything else. */
export declare const fade: Variants;

/** Fade up from below. The workhorse entrance for content. */
export declare function rise(y?: number): Variants;

/** Scale in from slightly small. Popovers, tooltips, menus. */
export declare const pop: Variants;

/** A sheet or drawer sliding in from an edge. */
export declare function sheet(from?: 'bottom' | 'top' | 'left' | 'right'): Variants;

/** A parent variant that staggers its children inside a fixed time budget. */
export declare function staggerChildren(count?: number, total?: number): Variants;

/** Hover and press affordances. Spread onto a `motion.*` element. */
export declare const tappable: Pick<MotionProps, 'whileHover' | 'whileTap'>;

/** Strip travel out of a variant set when the user has asked for reduced motion. */
export declare function useMotionSafe(variants: Variants): Variants;

/** Scroll-reveal props for a single element, ready to spread. */
export declare function useReveal(options?: {
  y?: number;
  amount?: number;
}): Pick<MotionProps, 'initial' | 'whileInView' | 'viewport' | 'transition'>;
