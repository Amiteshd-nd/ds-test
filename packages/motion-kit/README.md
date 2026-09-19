# @cloud-march/motion

The repo's shared motion language, built on [motion.dev](https://motion.dev) (the
`motion` package, successor to Framer Motion by the same author).

There is no build step. The package ships plain ESM with hand-written `.d.ts`
files, so Vite, Next, and a bare `<script type="module">` all consume it directly.

## Why it exists

`motion` on its own is a library, not a decision. Left to itself, every package
picks its own 300ms and its own ease curve, and five surfaces that were meant to
feel like one product stop matching. This package holds the decisions: a duration
scale, five easings, four springs, travel distances, and stagger budgets. Reach
for a token before inventing a number.

It also makes `prefers-reduced-motion` the default rather than a thing to
remember. Every helper here collapses to a fade or an instant state change when
the user has asked for less motion. Nothing disappears for that user; it just
stops travelling.

## Three entries

| Import | For |
| --- | --- |
| `@cloud-march/motion` | Framework-free. Tokens plus DOM helpers. Vanilla TS/JS, Phaser, MapLibre. |
| `@cloud-march/motion/react` | Tokens plus React variants and hooks. Re-exports `motion/react`. |
| `@cloud-march/motion/tokens.css` | The same numbers as CSS custom properties, for stylesheet-driven motion. |

Take the dependency once. Each entry re-exports what you would otherwise import
from `motion` directly, so a component needs one import line, and the whole repo
stays on one pinned version.

## React

```jsx
import { motion, rise, staggerChildren, useMotionSafe, tappable } from '@cloud-march/motion/react';

function ProjectList({ projects }) {
  const item = useMotionSafe(rise());

  return (
    <motion.ul
      variants={staggerChildren(projects.length)}
      initial="hidden"
      animate="visible"
    >
      {projects.map((project) => (
        <motion.li key={project.id} variants={item}>
          <motion.a href={project.href} {...tappable}>
            {project.title}
          </motion.a>
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

Scroll reveal on a single section, without a scroll listener:

```jsx
import { motion, useReveal } from '@cloud-march/motion/react';

export function Section({ children }) {
  return <motion.section {...useReveal()}>{children}</motion.section>;
}
```

In a Next App Router package, the component that imports this must be a client
component. `react.js` carries `'use client'`, but the boundary belongs in your
component, not in the library.

Available variants: `fade`, `rise(y)`, `pop`, `sheet(from)`, `staggerChildren(count, total)`,
`tappable`. Hooks: `useMotionSafe(variants)`, `useReveal(options)`, plus everything
`motion/react` exports.

## Vanilla

```js
import { revealOnScroll, pressable, animate, duration, ease } from '@cloud-march/motion';

const stopReveal = revealOnScroll('.card');   // IntersectionObserver, fires once each
const stopPress = pressable('button.primary');

// Anything bespoke: use the tokens rather than fresh numbers.
animate('.badge', { scale: [0.9, 1] }, { duration: duration.quick, ease: ease.out });

// On teardown:
stopReveal();
stopPress();
```

Both helpers return a cleanup function. Call it. A `revealOnScroll` left running
after its DOM is gone holds observers on detached nodes.

Use `isReducedMotion()` to branch by hand. It is deliberately not named
`prefersReducedMotion` — motion.dev exports its own binding under that name and
it is a mutable state object (`{ current }`), not a getter.

Both entries re-export motion.dev's **entire** API (`export *`), so anything in
the motion docs is importable from here. That is on purpose: a hand-picked
re-export list breaks the first time someone needs the symbol you left off.

## CSS

```css
@import '@cloud-march/motion/tokens.css';

.card {
  transition: transform var(--motion-transition), opacity var(--motion-transition);
}

.card:hover {
  transform: translateY(calc(-1 * var(--motion-distance-nudge)));
}
```

The reduced-motion block in `tokens.css` collapses every duration to `1ms` and
every distance to `0`, so a stylesheet that uses the tokens gets the behaviour
for free. It collapses duration rather than removing the transition, so state
still lands cleanly instead of being left mid-animation.

For `packages/carcinogen`, which has no bundler and no `node_modules`, copy the
`:root` block into its stylesheet and note where it came from.

## The tokens

```
duration   instant .12  quick .18  brisk .24  gentle .32  slow .5  deliberate .8   (seconds)
ease       out  in  inOut  drawer  overshoot                                        (cubic-bezier)
spring     firm  snappy  soft  playful                            (visualDuration + bounce)
distance   nudge 4  rise 8  step 16  far 32                                         (px)
stagger    tight .03  normal .05  loose .08                                         (seconds)
```

Three of those names (`spring`, `distance`, `stagger`) are also real motion.dev
exports: an easing generator, a math util, and a delay function. So the tokens
live under a `tokens` namespace rather than shadowing them:

```js
import { tokens, duration, ease } from '@cloud-march/motion';

tokens.spring.soft;      // our preset          spring()   // motion's easing generator
tokens.stagger.normal;   // our interval        stagger()  // motion's delay function
tokens.distance.rise;    // our travel distance distance() // motion's math util
duration.gentle;         // no collision, so also a plain named export
```

`duration`, `ease`, `staggerFor` and `defaultTransition` do not collide, so they
are exported both individually and on `tokens`.

`staggerFor(count, total)` returns a per-child delay that keeps a whole list
inside `total` seconds. Use it instead of a fixed interval for anything longer
than about eight items, or a ten-item list reads as a slow load.

`spring` presets use motion's `visualDuration` + `bounce` form rather than
stiffness and damping, because those two are the ones you can actually tune by
eye.

## Choosing

- **CSS transition** for hover, focus, and press on a single property. Cheapest thing that works.
- **`@cloud-march/motion` (vanilla)** for scroll reveals and imperative sequences outside React.
- **`@cloud-march/motion/react`** for enter/exit (`AnimatePresence`), layout animation, gestures, and anything driven by React state.
- **GSAP or Three.js** only for full-page scrolltelling or canvas work, isolated in a leaf component. Never in the same component tree as `motion` — they fight over the same frames.

## Related

- `.claude/skills/design-motion-principles` — the craft of a specific interaction, and audit mode for reviewing motion that already exists.
- `.claude/skills/taste-skill` — whether the motion is motivated at all, and the pre-flight check that catches motion-for-show.
- `.claude/skills/ui-ux-pro-max` — the decision: should this move, how fast, does it respect reduced motion.

## `framer-motion` and `motion` are the same library

Worth stating plainly, because the two names invite the opposite assumption.

Framer Motion was Matt Perry's library, built while he was at Framer
(framer.com). It later went independent and was rebranded **Motion**, at
motion.dev, under the same author. The rename is the whole difference. You can
see it in the installed packages:

- `motion@13.4.0` **depends on** `framer-motion@^13.4.0`
- both declare `author: "Matt Perry"` and `repository: motiondivision/motion`
- `motion/react` is, verbatim, `export * from 'framer-motion'`

So `motion` is a thin renaming shell over `framer-motion`, released in lockstep.
There is nothing to choose between them on features, and nothing to gain by
adding one alongside the other.

What that ruled out, and what it cost: `packages/personal-doc` was on
`framer-motion@12`. Once it also depended on this package (`motion@13` →
`framer-motion@13`), the app would have bundled **two majors of one library**.
Separate module instances mean separate React contexts, so an `AnimatePresence`
from one copy would not coordinate with a `motion` component from the other.

personal-doc has since been migrated: 27 files moved from `framer-motion` to
`@cloud-march/motion/react`, and the direct `framer-motion` dependency was
dropped. The only breaking change across 12 → 13 is the removal of
`@emotion/is-prop-valid`, which affects Styled Components and Emotion users;
personal-doc uses Tailwind, so it did not apply.

**Do not add `framer-motion` back to any package.** Import through
`@cloud-march/motion` so the repo resolves exactly one copy.
