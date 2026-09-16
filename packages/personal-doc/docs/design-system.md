# Home 2.2 — a design system for a surface that can change its mind

The `/home-2.2` page is Amitesh's portfolio rendered as a chat surface. As of
this change it can also render as a **different design** — same components,
same elements, same copy, different material — chosen by the visitor from a
drawer in the header.

This document is the reference: what the system is made of, why it is built
this way, and what the rules are. The one-page working contract lives next to
the code at [`src/design/README.md`](../src/design/README.md).

---

## 1. The premise

Two ways to let a user change the look of a product:

1. **Fork the UI.** Write the components twice, switch between trees.
2. **Change the material.** Write the components once, express every visual
   decision as a named value, and swap the values.

The first is how most "theme" features die: two trees drift, a fix lands in one
of them, and the second design quietly rots. The second is how design systems
are supposed to work, and it is what is implemented here — strictly: no
component outside `src/design/` branches on a theme id, or knows one exists.

The constraint that produced it was explicit: **add a second look without
changing the components or the elements.** That is a stronger constraint than it
sounds, and it is what forced the interesting part of the architecture (§4).

## 2. The themes

| | Ground | Surfaces & edges | Type | Material |
| --- | --- | --- | --- | --- |
| **Liquid Glass** (default) | near-black `#060609`, bloom, vignette | translucent, `blur(20px)`, 1px gradient rim, soft `0 20px 50px` | Outfit, medium, `-0.03em` | physical refraction |
| **Neo Brutalism** | bone `#efede6`, cut shapes, dot-grid | opaque white, 2px ink, offset `4px 4px 0` | Outfit, bold, `-0.02em` | six ink bands, blue |
| **16-Bit Handheld** | yellow `#fbdd65`, clouds, scanlines | cream, 3px plum + bone inner ring, offset `5px 5px 0` | Pixelify Sans / Silkscreen | four bands, 56-block pixel grid |
| **Neubrutalism** | ivory `#fefce8`, four hard colour blocks | white, 3px black, offset `5px 5px 0`, **radius 0** | Inter 900 | five bands, saturated pink |
| **Brutalism** | white, exposed 1px column rules | white, 4px black, **no shadow**, **radius 0**, **no transitions** | system mono + Helvetica 900, uppercase | four bands, near-black |
| **Minimal & Direct** | white, nothing on it at all | white, 1px `#e5e7eb`, no shadow, **640px single column**, `1.75` leading | Inter, four colours total | eight bands, graphite |

The neo theme follows the reference the work was briefed against: white cards,
black outlines, hard offset shadows, an electric blue primary, and yellow /
violet shapes cut into the ground.

The 16-bit theme's rule is that **nothing feathers**: every gradient in it is a
two-stop with both stops at the same position, which is the shading grammar of
the era's sprite art. Its cream panels carry a double ring — plum outside, bone
inside — which is how the reference draws a window frame, and it costs nothing
because `--lg-surface-shadow` can hold an inset and an offset at once.

**Three brutalisms, on purpose.** They are three readings of one movement, and
the drawer is meant to let you feel the difference rather than read about it:

- **Neo Brutalism** — the paper-and-ink reading. One accent, a quiet ground,
  rounding as authored.
- **Neubrutalism** — [the guide's](https://www.uistyleguide.com/style/neubrutalism)
  2020s product reading, "think Figma and Notion": the whole primary palette at
  once, 3px black outlines, `5px 5px 0` shadows, sharp corners. Two tokens
  deviate from it for contrast — the active-state pink is darkened to `#db2777`
  (5.0:1 on white against the reference's 2.2:1), and the send button takes the
  reference's own black-on-white button rather than a mid-tone primary.
- **Brutalism** — [the guide's](https://www.uistyleguide.com/style/brutalism)
  raw reading, and the one the other two are softenings of. Take neubrutalism's
  drop shadow and its warmth away and this is what is left: white, black,
  hairline structure, unmixed primaries, and type nobody art-directed. Its CSS
  line is `border-radius: 0px, transition: none, font-weight: 700+, border:
  2-4px solid`, and all four are literal here.

Brutalism is also the only theme that loads **no webfont at all**. "Default
fonts" is in the style's own description, so it asks for the system's own mono
and grotesque rather than downloading a face that imitates them. That is a
design position, not an optimisation, and it should stay that way.

**One deliberate departure from the neo reference.** The reference puts a
full-bleed blue band behind its header and hero. Ink on `#0a6cff` measures
about 3.4:1, which fails AA for the 11–16px copy that covers most of this
surface, and there is no per-theme markup hook to give the header its own
on-band colour without breaking rule §5.1. So the blue survives as fills,
edges, the cube's ink and corner blocks — everywhere it never has small text on
top of it — and the running text always sits on paper. The look holds; the
contrast holds with it.

**Minimal & Direct** is the odd one out, and usefully so. Every theme before it
changed how the surface *looks*; this one changes how it is *laid out*. Its own
CSS line is `max-width: 640px, line-height: 1.75, single-column` — no colour in
it at all — which is what finally made measure and leading into tokens rather
than literals sitting in the markup. It also holds itself to exactly the four
colours the guide lists: the "listening" state and the live dot are the same
blue as everything else, because a fifth colour is the thing the style exists
to remove.

## 3. The layers

```
                       data-lg-theme on <html>          ← one DOM write, ThemeProvider
                                │
   ┌────────────────────────────┴────────────────────────────┐
   │  Layer 1   tokens            design/themes.css          │  ~60 custom properties,
   │                                                         │  declared identically per theme
   ├─────────────────────────────────────────────────────────┤
   │  Layer 2   primitives        styles/liquid-glass.css    │  .lg-surface, .lg-hairline,
   │                              + inline style={{ }}       │  .lg-focus, .lg-scroll …
   ├─────────────────────────────────────────────────────────┤
   │  Layer 3   utility remap     --color-white, per theme   │  retargets Tailwind's
   │                              + opacity floor + radius   │  white-alpha utilities
   └─────────────────────────────────────────────────────────┘
                                │
                     components — unchanged, theme-blind
```

JavaScript participates in exactly one place: `useTheme()` hands the WebGL cube
two numbers that CSS cannot deliver into a shader.

## 4. The mechanism worth knowing about

The components were full of Tailwind utilities like `text-white/45`,
`bg-white/10`, `placeholder:text-white/35` — the correct vocabulary for a dark
glass surface, and completely wrong for paper. Rewriting them was off the table.

Tailwind v4 compiles those utilities to

```css
.text-white\/45 { color: color-mix(in oklab, var(--color-white) 45%, transparent) }
```

— a **variable**, not a baked hex. So:

```css
[data-lg-theme='neo'] .lg-root { --color-white: #0b0b0f; }
```

retargets every white-alpha utility in the subtree in one line. "White" stops
meaning white and starts meaning *the ink of this surface*, which is what those
utilities were always expressing.

Two consequences, both handled:

- **Things that must stay light.** The send button's icon and the prism well's
  icon sit on a dark fill in every theme. They name `--lg-on-accent` /
  `--lg-on-well` in an inline `style`, which beats the class.
- **Alpha is not perceptually symmetric.** White at 28% on near-black is
  readable fine print; ink at 28% on paper is a smudge. Light themes therefore
  re-map the low-alpha ladder (`/20`…`/75`) to stronger values. This is the one
  place the system reaches into Tailwind's generated class names, it is
  quarantined to a single labelled block in `themes.css`, and it is what buys
  the rest of the surface the right to keep its markup. Every light theme joins
  the block's `:is()` list — `:is()` takes the specificity of its strongest
  argument, so adding one never quietly outranks the others.

**Corner radius** is the second — and so far last — reach into the utility
layer. Tailwind compiles the named steps (`rounded-2xl`) to `var(--radius-*)`,
which could be rebound the way `--color-white` was, but `rounded-full` and
`rounded-[26px]` compile to literals and would not follow. A theme rebinding
only half of them would come out half-sharp, which looks like a bug rather than
a decision. So a theme whose premise *is* sharp corners zeroes them outright:

```css
[data-lg-theme='neub'] .lg-root [class*='rounded'] { border-radius: 0 }
```

The substring match catches every rounding utility regardless of spelling, and
squares the circles too — avatar, status dot, icon wells — which is the correct
reading of that style rather than a casualty of it.

Browsers without `color-mix()` fall back to Tailwind's baked `#fff` — i.e. to
the behaviour that shipped before this change, not to a new bug.

## 5. Rules

### 5.1 No component knows a theme's name

There is no `themeId === 'neo'` anywhere outside the design folder, and there
never should be. A component that branches on a theme has to be edited for
every future theme; a component that reads a token does not.

### 5.2 No literals below Layer 1

`liquid-glass.css` and every component `style` object read `var(--lg-…)`.
Adding a value means adding a token to **every** theme first. A token declared
in one theme and not the other does not fall back to something sensible — it
inherits whatever the cascade last set, and breaks in one state nobody checks.

### 5.3 Per-frame code reads the theme through a ref

`GlassCube` takes `material` and stores it in a ref, exactly as it already did
with `phase`. Making it an effect dependency would drop the WebGL context and
restart the rigid-body simulation every time someone opened the drawer. The
same instinct applies to anything else that owns a loop.

### 5.4 Framer Motion resolves CSS variables for colours, not for transforms

`animate={{ backgroundColor: 'var(--x)' }}` works; `animate={{ y: 'var(--x)' }}`
is not reliable. Hover lifts stay plain numbers.

### 5.5 Themes cross-fade unless a theme refuses

`background-color`, `color` and `border-color` transition over 280ms on the
root and both surface primitives — enough to read as a material change rather
than a page reload. `box-shadow` and `backdrop-filter` are deliberately *not*
transitioned: animating either across a page of glass is expensive and looks
worse than the cut it replaces. Everything stops under
`prefers-reduced-motion`.

The duration is `--lg-theme-transition` rather than a fixed rule, because a
theme is allowed to say no. `transition: none` is a stated requirement of the
brutal theme, and a surface that cuts on every other state change should not
dissolve into view. That theme also resets the utility layer's transitions
across its whole subtree — `transition-colors` sits on most interactive
elements, and a theme that declares no transitions has to mean it.

The limit worth knowing: Framer's spring-driven layout motion is JavaScript and
keeps running. Stopping it would mean branching a component on a theme id,
which rule §5.1 forbids, so `prefers-reduced-motion` remains the only thing
that halts it. A theme can flatten CSS, not physics.

## 6. The control

The Home button in the header became the appearance control, which is what the
brief asked for and is also the better use of the slot — on a surface with its
own shell, "go home" was the least interesting thing a visitor could do there.

- **Trigger** — the same `PrismButton`, now icon-only: the half-filled disc
  that means *appearance* from iOS to VS Code. No label; a tooltip on hover and
  an `aria-label` for everyone else. The prism ring itself is tokenised, so in
  the neo theme it becomes a hard four-stop wheel with no bloom.
- **Drawer** — opens downward, right-aligned, spring-in. Each row is previewed
  by its own three-colour swatch rather than described, because a swatch is the
  only honest description of a theme.
- **Semantics** — `role="menu"` with `menuitemradio` rows, `aria-expanded`,
  `aria-controls`, Escape to close, click-away to close, focus-leaves to close
  (but not on window blur, or alt-tabbing would dismiss it).
- **Densities** — the full pill above `sm`, a plain round button below, which
  is exactly the arrangement the header already used.

Choice persists to `localStorage` under `ad:home-2.2:theme` and is applied in a
layout effect, so a returning visitor never sees a frame of the wrong theme.
The attribute is removed on unmount: the rest of the site is a separate design
and must never inherit these tokens.

## 7. The material

The cube is the one live object on the page, so a flat theme cannot simply hide
it. Instead it is re-inked. A theme's `material` in `themes.js` is four numbers
that become shader uniforms:

| | `flat` | `tint` | `bands` | `pixel` |
| --- | --- | --- | --- | --- |
| Glass | 0 | — | — | 0 |
| Neo | 1 | blue | 6 | 0 |
| 16-bit | 1 | handheld blue | 4 | 56 |
| Neubrutalism | 1 | saturated pink | 5 | 0 |
| Brutalism | 1 | near-black | 4 | 0 |
| Minimal | 1 | graphite | 8 | 0 |

Minimal is the only flat theme that wants *more* bands, not fewer. Its
restraint is about decoration, not about crudeness — eight steps is the
quietest the cube can be while still reading as a solid.

Three bands was the first value tried for the neubrutalism cube, on the logic
that "flat colours" means as few steps as possible. It was wrong in practice:
below about five steps the bevels stop separating and the cube reads as a blob
rather than a solid. Flatness is a property of the *shading*, not of the form.

A flat material also loses the miss-path halo — `a *= 1.0 - uFlat`. The halo is
light bleeding around a refractive solid; a printed one is not emitting
anything, and on a light ground it read as a smudge rather than a glow.

**The poster pass** runs last, after the render:

```glsl
float steps = max(uBands, 1.0);
float lum   = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
float band  = floor(lum * steps + 0.5) / steps;
vec3  ink   = uTint * (0.30 + 1.15 * band) + vec3(band * band * 0.55);
col = mix(col, ink, uFlat);
a   = mix(a, smoothstep(0.20, 0.42, a), uFlat);      // hard silhouette, no halo
```

Fewer bands read as older hardware.

**The pixel grid** runs first, and this is the part that matters. It snaps the
*ray's origin*, not the finished image:

```glsl
vec2 frag = gl_FragCoord.xy;
if (uPixel > 0.0) {
  float block = min(uRes.x, uRes.y) / uPixel;
  frag = (floor(frag / block) + 0.5) * block;
}
```

Every block therefore traces exactly one ray: edges land on block boundaries
and the refraction inside a block is a single honest sample. That is a genuine
low-resolution render rather than a full-resolution render downsampled to look
like one — the difference between a sprite and a blur. The grid is counted
across the canvas' short side rather than sized in device pixels, so the cube
keeps the same apparent resolution on any display density and as the canvas
resizes between the hero and chat layouts.

The physics above both passes is untouched: the same refraction, the same
quaternion integration, the same throwable rigid body. They are the last things
that happen to the pixel, the way a screen print is the last thing that happens
to a photograph.

## 8. Token reference

Every theme declares all of these. Grouped as they appear in `themes.css`.

**Ground** `--lg-bg` `--lg-wash` `--lg-vignette` `--lg-scrim`

**Ink & accents** `--lg-ink` `--lg-on-accent` `--lg-on-well` `--lg-accent`
`--lg-accent-soft` `--lg-accent-warm` `--lg-live` `--lg-live-glow`

**Surfaces** `--lg-surface-bg` `--lg-surface-blur` `--lg-surface-shadow`
`--lg-flat-bg` `--lg-flat-blur` `--lg-flat-shadow`

**Edges** `--lg-border` `--lg-line` `--lg-rim-a` `--lg-rim-b` `--lg-rim-warm`
`--lg-rim-cool` `--lg-rim-hot` `--lg-hairline-display` `--lg-specular-display`

**Fills** `--lg-send-fill` `--lg-send-shadow` `--lg-busy-fill`
`--lg-focus-bloom` `--lg-avatar-fill` `--lg-avatar-shadow` `--lg-bullet-fill`
`--lg-bloom-blur` `--lg-bloom-saturation` `--lg-quote-line`

**Layout** `--lg-measure` `--lg-measure-wide` `--lg-leading`

The layout group arrived with the minimal theme and is the system's answer to a
style whose argument is spacing rather than surface. `--lg-measure` is the
column the conversation reads in, `--lg-measure-wide` the landing dock's; a
theme that wants a single column sets both to the same value. These replaced
`max-w-[720px]`, `max-w-[840px]` and `leading-[1.68]` — literals that had been
sitting in the markup in violation of §5.2 since before there were themes.

`--lg-bloom-saturation` is a smaller version of the same idea. A project's
accent colour is *content*, not theme, so a theme cannot choose it — but it can
decide how saturated content is allowed to be on its surface, which is how a
four-colour theme avoids gaining a fifth through the back door.

**Prism well** `--lg-spectrum` `--lg-spectrum-blur` `--lg-spectrum-blur-hover`
`--lg-well-fill` `--lg-well-shadow`

**A11y & motion** `--lg-focus-ring` `--lg-scroll-thumb`
`--lg-scroll-thumb-hover` `--lg-theme-transition`

**Type** `--lg-font` `--lg-font-display` `--lg-ligatures`
`--lg-tracking-tight` `--lg-display-transform` `--lg-weight-strong`
`--lg-label-transform` `--lg-label-tracking`

A theme that ships its own typeface names it in `--lg-font` and lists the
stylesheet as `fonts` in `themes.js`; `ThemeProvider` injects the `<link>` the
first time that theme is selected, so a face nobody picks is never downloaded.
`--lg-ligatures` exists because faces built for pixel grids often ship an
`fi`/`fl` ligature that is unreadable at UI sizes — Pixelify Sans draws "first"
as something closer to "Arst". A face like that turns ligatures off through its
own token instead of being ruled out.

The rim stops (`--lg-rim-warm/cool/hot`) are bare channel triplets, e.g.
`255 122 61`, because the prompt bar's conic rim mixes a spring-driven alpha
into them with `rgb(… / a)` — a variable cannot be spliced into the middle of a
legacy `rgba(r,g,b,a)`.

## 9. Accessibility

- Focus rings are tokenised and re-coloured per theme; every interactive
  element keeps `.lg-focus`.
- The drawer is keyboard-complete: Escape, click-away, focus-out, and radio
  semantics that announce the current theme.
- The light theme's alpha ladder is compressed (§4) so muted text keeps its
  contrast on paper rather than inheriting a ratio tuned for black.
- `prefers-reduced-motion` already stopped the canvas loop and the CSS
  animations; it now also stops the theme cross-fade.
- Nothing in the system communicates through colour alone — the active theme
  carries a check mark as well as a highlight.

## 10. Adding a theme

See [`src/design/README.md`](../src/design/README.md). It is two files, and if
a third file needs editing, the change belongs in a token instead.
