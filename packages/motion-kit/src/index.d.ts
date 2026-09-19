/**
 * Types for @cloud-march/motion (root, framework-free entry).
 *
 * Hand-written: the package ships plain ESM with no build step, so these
 * declarations are the contract. Keep them in step with `index.js`.
 */

/** motion.dev's entire vanilla API, passed straight through. */
export * from 'motion';

export type Easing = [number, number, number, number];

export interface SpringPreset {
  type: 'spring';
  visualDuration: number;
  bounce: number;
}

export interface DurationTokens {
  instant: number;
  quick: number;
  brisk: number;
  gentle: number;
  slow: number;
  deliberate: number;
}

export interface EaseTokens {
  out: Easing;
  in: Easing;
  inOut: Easing;
  drawer: Easing;
  overshoot: Easing;
}

export interface SpringTokens {
  firm: SpringPreset;
  snappy: SpringPreset;
  soft: SpringPreset;
  playful: SpringPreset;
}

export interface DistanceTokens {
  nudge: number;
  rise: number;
  step: number;
  far: number;
}

export interface StaggerTokens {
  tight: number;
  normal: number;
  loose: number;
}

/**
 * Every token under one namespace.
 *
 * Namespaced because `spring`, `stagger` and `distance` are real motion.dev
 * exports (an easing generator, a delay function, a math util) and must not be
 * shadowed. Reach for `tokens.spring.soft`, `tokens.stagger.normal`,
 * `tokens.distance.rise`.
 */
export declare const tokens: {
  duration: DurationTokens;
  ease: EaseTokens;
  spring: SpringTokens;
  distance: DistanceTokens;
  stagger: StaggerTokens;
  staggerFor(count: number, total?: number): number;
  defaultTransition: { duration: number; ease: Easing };
};

// The token names that do not collide with motion's own exports, for convenience.
export declare const duration: DurationTokens;
export declare const ease: EaseTokens;
export declare const defaultTransition: { duration: number; ease: Easing };
export declare function staggerFor(count: number, total?: number): number;

/**
 * Whether the user has asked for reduced motion, right now.
 *
 * Not named `prefersReducedMotion`: motion.dev exports its own binding under
 * that name and it is a mutable state object, not a getter.
 */
export declare function isReducedMotion(): boolean;

export type MotionTarget = string | Element | Element[] | NodeListOf<Element>;

export interface RevealOptions {
  /** Travel distance in px. Defaults to `tokens.distance.step`. */
  y?: number;
  /** Seconds. Defaults to `tokens.duration.gentle`. */
  duration?: number;
  /** Seconds between siblings. Auto-budgeted when omitted. */
  stagger?: number;
  /** How much of the element must be visible before it fires. */
  amount?: 'some' | 'all' | number;
}

/** Reveal elements as they scroll into view, once each. Returns a teardown function. */
export declare function revealOnScroll(
  target: MotionTarget,
  options?: RevealOptions,
): () => void;

/** A press affordance: the element dips while held. Returns a teardown function. */
export declare function pressable(
  target: MotionTarget,
  options?: { scale?: number },
): () => void;

/** Cross-fade one element out and another in, in place. */
export declare function crossfade(
  outgoing: Element,
  incoming: Element,
  options?: { duration?: number },
): Promise<void>;
