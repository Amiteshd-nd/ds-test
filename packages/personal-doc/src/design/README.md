# Home 2.2 design system — working contract

Short version for anyone (human or agent) changing this surface. The reasoning
behind each rule is in [`docs/design-system.md`](../../docs/design-system.md).

## What this is

The `/home-2.2` chat surface is one set of components that can render as more
than one design. Themes are **materials**, not variants: no component branches
on the theme, no component is duplicated per theme, and no markup changes when
the theme does. A theme is a block of CSS custom properties plus two numbers
for the WebGL cube.

Files:

| File | Owns |
| --- | --- |
| `themes.js` | which themes exist; metadata; canvas `material`; optional `fonts` |
| `themes.css` | every visual value, per theme (the tokens) |
| `ThemeProvider.jsx` | state, persistence, the single `data-lg-theme` DOM write |
| `useTheme.js` | the context + hook (split out for Fast Refresh) |
| `ThemeSwitcher.jsx` | the header control: trigger, tooltip, drawer |
| `../styles/liquid-glass.css` | the primitives (`.lg-surface`, `.lg-hairline`, …) |

## The three layers

1. **Tokens** — `themes.css`. Selected by `[data-lg-theme='<id>']` on `<html>`.
2. **Primitives** — `liquid-glass.css`. Classes that read tokens. No literals.
3. **Utility remap** — `--color-white` is rebound per theme inside `.lg-root`,
   so Tailwind's `text-white/60`-style utilities follow the surface's ink.
   Two companion blocks: the low-alpha steps are re-mapped for light themes,
   where the same alpha reads far weaker than it does on black, and a theme
   built on sharp corners zeroes `border-radius` on every rounding utility.
   These three blocks are the *only* places the system touches Tailwind's
   generated class names. Do not add a fourth without reading §4 of the docs.
   A theme may also reset transitions across its subtree, which overrides the
   utility layer without naming any of it.

## Rules

- **Never** put a colour, shadow, blur or radius literal in a component or in
  `liquid-glass.css`. Add a token, give it a value in **every** theme, then use
  `var(--lg-…)`.
- Inline `style` beats a utility class, so a value that must survive the ink
  remap (`--lg-on-accent`, `--lg-on-well`) goes in `style`, not in a class.
- The theme reaches JS only through `useTheme()`. Nothing imports a theme id to
  branch on — `if (themeId === 'neo')` in a component is the failure mode this
  system exists to prevent.
- Anything driven per-frame (the cube) reads the theme through a **ref**, not a
  dependency, so a theme change never tears down a running loop.
- Framer resolves CSS variables for colours but not for transform numerics;
  keep `x`/`y`/`scale` targets as plain numbers.

## Adding a theme

1. Add an entry to `THEMES` in `themes.js`: id, name, hint (keep it under ~24
   characters or the drawer truncates it), icon key, 3-colour swatch, and
   `material: { flat, tint, bands, pixel }` — see §7 of the docs for what those
   four do to the cube. Add `fonts` if the theme ships a typeface; the provider
   loads it only while that theme is selected.
2. Copy the `[data-lg-theme='gba']` block in `themes.css`, rename the selector,
   and give **every** token a value. A missing token does not fall back to
   something sensible — it inherits the previous theme and looks broken in one
   state you will not find until later.
3. If the theme is light, add its selector to the `:is()` list on the
   opacity-floor block, and rebind `--color-white` to its ink. If it wants
   sharp corners, join the `:is()` list on the radius override. If it wants no
   motion, set `--lg-theme-transition: none` and add it to the transition
   reset.
4. If the icon key is new, add the icon to `components/chat/Icons.jsx` and map
   it in `ThemeSwitcher.jsx`'s `THEME_ICONS`.

Nothing else. If step 5 involves editing a component, the component is wrong.

## Checking your work

Every theme, at 375px and 1280px, in these four states: empty, typing, an
answer streaming, an answer complete (cards + follow-ups + copy/retry). Then
switch themes mid-stream — the cube must keep spinning and the answer must keep
streaming.

Read the running text, do not just look at it. A theme that ships a typeface
can ship a broken ligature with it (`--lg-ligatures`), and muted copy that
survived on black can fall under contrast on paper (the opacity floor).

Watch what a wider face does to fixed-width furniture, too: the monospace theme
is what finally exposed a `line-clamp` that had never worked, and it needed the
theme drawer 28px wider than proportional type did.

Two component bugs have surfaced this way so far — that clamp, and an accent
bloom painting over a thumbnail it was supposed to sit behind, which a 24px
blur had hidden for as long as there was only one theme. Both were pre-existing
and both were fixed for every theme. Expect a new theme to find one: rendering
the same markup through a genuinely different set of values is the cheapest
test this surface has.
