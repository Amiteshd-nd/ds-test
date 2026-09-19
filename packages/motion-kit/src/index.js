/**
 * @cloud-march/motion - the repo's shared motion language.
 *
 * The root entry is framework-free: it works in Vite, Next, a Phaser game, a
 * MapLibre page, or a plain <script type="module">. React presets live in
 * `@cloud-march/motion/react`; CSS custom properties in
 * `@cloud-march/motion/tokens.css`.
 *
 * Everything here respects `prefers-reduced-motion` by default. That is not a
 * nicety bolted on at the end: the helpers below go to the final state
 * immediately rather than skipping the effect, so nothing disappears for a user
 * who asked for less motion.
 */

import { animate, inView, scroll } from 'motion';
import { duration, ease, distance, staggerFor } from './tokens.js';

/**
 * motion.dev's entire vanilla API, passed straight through.
 *
 * Re-exported wholesale rather than as a hand-picked list: a whitelist silently
 * breaks the day someone needs the 328th export. Take the dependency here and
 * the repo stays on one pinned version.
 */
export * from 'motion';

/**
 * Our tokens, under one namespace: `tokens.spring.soft`, `tokens.stagger.normal`.
 *
 * Namespaced on purpose. `spring`, `stagger` and `distance` are real motion.dev
 * APIs (an easing generator, a delay function, and a math util), and shadowing
 * them with same-named token objects is a trap. The names below that do not
 * collide are also exported individually, for convenience.
 */
export * as tokens from './tokens.js';
export { duration, ease, staggerFor, defaultTransition } from './tokens.js';

/**
 * Whether the user has asked for reduced motion, right now.
 *
 * Safe to call during SSR: returns `false` when there is no `window`.
 *
 * Deliberately not called `prefersReducedMotion` - motion.dev exports its own
 * binding under that name, and it is a mutable state object (`{ current }`),
 * not a getter. Shadowing it would be a trap.
 *
 * @returns {boolean}
 */
export function isReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveal elements as they scroll into view, once each.
 *
 * Uses IntersectionObserver via motion's `inView` - never a scroll listener.
 * Under reduced motion the elements are simply made visible, with no transition.
 *
 * @param {string | Element | Element[] | NodeListOf<Element>} target
 * @param {object}  [options]
 * @param {number}  [options.y=distance.step]   travel distance in px
 * @param {number}  [options.duration]          seconds; defaults to `duration.gentle`
 * @param {number}  [options.stagger]           seconds between siblings; auto-budgeted if omitted
 * @param {string}  [options.amount='some']     how much must be visible: 'some' | 'all' | 0-1
 * @returns {() => void} stop function - call it on unmount
 *
 * @example
 *   import { revealOnScroll } from '@cloud-march/motion';
 *   const stop = revealOnScroll('.card');
 */
export function revealOnScroll(target, options = {}) {
  const {
    y = distance.step,
    duration: dur = duration.gentle,
    stagger: gap,
    amount = 'some',
  } = options;

  const elements = resolve(target);
  if (elements.length === 0) return () => {};

  if (isReducedMotion()) {
    for (const el of elements) el.style.opacity = '1';
    return () => {};
  }

  const step = gap ?? staggerFor(elements.length);

  for (const el of elements) el.style.opacity = '0';

  const stops = elements.map((el, i) => {
    let stop;
    let fired = false;

    stop = inView(
      el,
      () => {
        if (fired) return;
        fired = true;
        animate(
          el,
          { opacity: [0, 1], transform: [`translateY(${y}px)`, 'translateY(0px)'] },
          { duration: dur, ease: ease.out, delay: i * step },
        );
        // Reveal once. IntersectionObserver callbacks are always async, so `stop`
        // is assigned by the time this runs, but guard anyway.
        if (stop) stop();
      },
      { amount },
    );

    return stop;
  });

  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * A press affordance: the element dips slightly while held.
 *
 * Pointer-driven, so it also fires for touch. No-op under reduced motion.
 *
 * @param {string | Element | Element[] | NodeListOf<Element>} target
 * @param {object} [options]
 * @param {number} [options.scale=0.97]
 * @returns {() => void} cleanup
 */
export function pressable(target, options = {}) {
  const { scale = 0.97 } = options;
  const elements = resolve(target);
  if (elements.length === 0 || isReducedMotion()) return () => {};

  const cleanups = elements.map((el) => {
    const down = () => animate(el, { scale }, { duration: duration.instant, ease: ease.out });
    const up = () => animate(el, { scale: 1 }, { duration: duration.quick, ease: ease.out });

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
    };
  });

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/**
 * Cross-fade one element out and another in, in place.
 *
 * Returns the animation so the caller can await it. Under reduced motion the
 * swap is instant rather than skipped.
 *
 * @param {Element} outgoing
 * @param {Element} incoming
 * @param {object} [options]
 * @param {number} [options.duration]
 * @returns {Promise<void>}
 */
export async function crossfade(outgoing, incoming, options = {}) {
  const dur = isReducedMotion() ? 0 : (options.duration ?? duration.brisk);

  await animate(outgoing, { opacity: 0 }, { duration: dur, ease: ease.in });
  outgoing.style.display = 'none';
  incoming.style.display = '';
  await animate(incoming, { opacity: [0, 1] }, { duration: dur, ease: ease.out });
}

/**
 * Normalise a selector, element, NodeList or array into an Element[].
 *
 * @param {string | Element | Element[] | NodeListOf<Element>} target
 * @returns {Element[]}
 */
function resolve(target) {
  if (typeof target === 'string') {
    if (typeof document === 'undefined') return [];
    return Array.from(document.querySelectorAll(target));
  }
  if (target instanceof Element) return [target];
  if (target && typeof target.length === 'number') return Array.from(target);
  return [];
}
