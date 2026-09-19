/**
 * The repo's motion vocabulary.
 *
 * One set of numbers, shared by every package, so a hover in personal-doc and a
 * hover in blockmodel feel like they came from the same hand. Reach for a token
 * before inventing a duration.
 *
 * The same values are mirrored as CSS custom properties in `tokens.css`, for the
 * packages that animate in stylesheets rather than in JS.
 */

/**
 * Durations, in seconds (motion.dev's unit).
 *
 * The scale is perceptual, not arithmetic: the jump from `instant` to `quick` is
 * the difference between "the UI responded" and "the UI moved", and everything
 * above `gentle` reads as deliberate staging rather than feedback.
 */
export const duration = {
  /** 0.12s - state flips the eye should not track: checkbox, toggle, focus ring. */
  instant: 0.12,
  /** 0.18s - hover and press feedback. The default for anything under the cursor. */
  quick: 0.18,
  /** 0.24s - small elements entering or leaving: tooltip, dropdown, toast. */
  brisk: 0.24,
  /** 0.32s - panels, sheets, accordions. The workhorse. */
  gentle: 0.32,
  /** 0.5s - full-surface transitions: route change, modal over a backdrop. */
  slow: 0.5,
  /** 0.8s - staged reveals and hero choreography only. Rarely correct. */
  deliberate: 0.8,
};

/**
 * Easing curves, as cubic-bezier control points.
 *
 * `out` is the default for anything the user triggered: it leaves fast and
 * settles, which reads as responsive. `in` is only for exits. `inOut` is for
 * movement with a start and an end on screen, never for a fade.
 */
export const ease = {
  /** Expo-out. Fast departure, long settle. The default for entrances. */
  out: [0.16, 1, 0.3, 1],
  /** Quad-in. Exits only: slow to leave looks like a stall. */
  in: [0.4, 0, 1, 1],
  /** Symmetric. For things that travel across the screen and stop. */
  inOut: [0.65, 0, 0.35, 1],
  /** Emil Kowalski's drawer curve. Heavy, physical, no overshoot. Sheets and drawers. */
  drawer: [0.32, 0.72, 0, 1],
  /** A small deliberate overshoot. Confirmations and "it landed" moments only. */
  overshoot: [0.34, 1.56, 0.64, 1],
};

/**
 * Spring presets, in motion.dev's `visualDuration` + `bounce` form.
 *
 * `visualDuration` is how long the motion *looks* like it takes (time to reach
 * the target), which is what you actually want to tune. `bounce` is 0 to 1.
 * Prefer these over raw stiffness/damping.
 */
export const spring = {
  /** No bounce. A spring that behaves like a good ease-out. Layout and position. */
  firm: { type: 'spring', visualDuration: 0.3, bounce: 0 },
  /** A trace of bounce. Buttons, chips, anything that should feel alive on press. */
  snappy: { type: 'spring', visualDuration: 0.22, bounce: 0.18 },
  /** Soft and slightly loose. Sheets, cards, drag release. */
  soft: { type: 'spring', visualDuration: 0.45, bounce: 0.22 },
  /** Obvious bounce. Success states and playful surfaces. Use once per screen. */
  playful: { type: 'spring', visualDuration: 0.5, bounce: 0.4 },
};

/**
 * Travel distances, in pixels.
 *
 * Entrances move a short distance, not a dramatic one. Anything over `far` reads
 * as a slide transition, which is a different decision.
 */
export const distance = {
  /** 4px - a nudge. Press states, hover lifts. */
  nudge: 4,
  /** 8px - the default rise for content entering. */
  rise: 8,
  /** 16px - list items and cards. */
  step: 16,
  /** 32px - section-level reveals. */
  far: 32,
};

/**
 * Stagger intervals, in seconds, for lists and grids.
 *
 * Above ~0.08s per child a list of ten starts to feel like it is loading slowly.
 * For anything longer than eight items, cap the total with `staggerFor()`.
 */
export const stagger = {
  tight: 0.03,
  normal: 0.05,
  loose: 0.08,
};

/**
 * A stagger interval that keeps a whole list inside `total` seconds.
 *
 * @param {number} count  number of children
 * @param {number} [total=0.4]  budget for the whole sequence, in seconds
 * @returns {number} per-child delay in seconds
 */
export function staggerFor(count, total = 0.4) {
  if (!Number.isFinite(count) || count <= 1) return 0;
  return Math.min(stagger.loose, total / (count - 1));
}

/** The default transition: what you get when you have no reason to pick another. */
export const defaultTransition = {
  duration: duration.gentle,
  ease: ease.out,
};
