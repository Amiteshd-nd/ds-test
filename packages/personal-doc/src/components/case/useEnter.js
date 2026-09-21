import { useReducedMotion, duration, tokens } from '@cloud-march/motion/react';

/*
 * The one enter recipe the 2.0 case studies share.
 *
 * Jakub's: opacity, a short travel, and a 4px blur that resolves, on a spring
 * with no bounce. The blur is what makes it read as materialising rather than
 * fading, and it is the reason this is worth having as a shared thing instead of
 * five slightly different fades.
 *
 * Reduced motion collapses it to a plain opacity change. The element still
 * arrives; it just stops travelling.
 *
 * Lives in its own module so the component files stay fast-refresh clean.
 */

export const revealSpring = { ...tokens.spring.firm, visualDuration: 0.45 };

export function useEnter(delay = 0) {
  const reduced = useReducedMotion();

  if (reduced) {
    return {
      initial: { opacity: 0 },
      whileInView: { opacity: 1 },
      viewport: { once: true, amount: 0.15 },
      transition: { duration: duration.brisk },
    };
  }

  return {
    initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
    whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
    viewport: { once: true, margin: '0px 0px -12% 0px' },
    transition: { ...revealSpring, delay },
  };
}
