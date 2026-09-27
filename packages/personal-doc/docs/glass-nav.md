# The frosted nav — what each property is doing

The floating bottom nav (`BottomNav`) is glass: you can see the page move and
blur underneath it. This is the reference for how that is built, and for the
one place it is knowingly imperfect.

The rule lives in [`src/index.css`](../src/index.css) as `.site-glass`. The
component carries the class and nothing else — no inline styles — so both
themes and the no-support fallback are decided in one place.

---

## 1. The rule

```css
.site-glass {
  background: var(--site-nav);
  border: 1px solid var(--site-line);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  box-shadow:
    inset 0 1px 0 var(--site-nav-rim),
    var(--site-nav-shadow);
}
```

| Property | Value | What it is for |
| --- | --- | --- |
| `backdrop-filter` | `blur(22px)` | Blurs *what is behind* the element, not the element. This is the whole effect. |
| `backdrop-filter` | `saturate(180%)` | Blur alone greys out the page behind it. Pushing saturation back up is what makes it read as glass rather than fog. |
| `-webkit-backdrop-filter` | same | Still required for Safari. It must come *before* the unprefixed property. |
| `background` | `var(--site-nav)`, alpha `0.55` / `0.6` | The tint. It has to stay translucent or there is nothing for the blur to show through — see §3. |
| `box-shadow` inset | `0 1px 0 var(--site-nav-rim)` | The highlight a real edge catches along its top. One inset shadow rather than a `::before`, so it composes with the drop shadow and adds no stacking context. |
| `box-shadow` outer | `var(--site-nav-shadow)` | Lifts the bar off the page. Without it the glass looks painted on rather than floating. |
| `border` | `1px solid var(--site-line)` | Defines the edge where the blur stops. Glass with no edge reads as a smudge. |

## 2. The tokens

Both themes are declared in `src/index.css` alongside the other `--site-*`
values.

| Token | Dark | Light |
| --- | --- | --- |
| `--site-nav` | `rgb(30 40 39 / 0.55)` | `rgb(255 255 255 / 0.6)` |
| `--site-panel` | `rgb(24 32 31 / 0.93)` | `rgb(255 255 255 / 0.94)` |
| `--site-nav-solid` | `rgb(24 32 31 / 0.96)` | `rgb(255 255 255 / 0.96)` |
| `--site-nav-rim` | `rgb(255 255 255 / 0.1)` | `rgb(255 255 255 / 0.7)` |
| `--site-nav-shadow` | `0 14px 40px rgb(0 0 0 / 0.45)` | `0 14px 34px rgb(20 24 26 / 0.16)` |

The rim is much stronger in light mode because a white highlight on a white
surface only reads at all when it is nearly opaque.

### 2a. Why there are two fills

`--site-nav` is the glass. `--site-panel` is for surfaces that wear the same
recipe but cannot afford the translucency, and today that means the theme
drawer, which opts in with `.site-glass-panel`:

```css
.site-glass-panel { background: var(--site-panel); }
```

These were one token once, and it did not survive contact with the drawer. The
nav floats over body copy and earns its effect by being see-through; the drawer
is fourteen rows of 12px text that can open over a 64px headline, and a 22px
blur does very little to type that large — the hero read straight through it.
Raising the shared alpha fixed the drawer and flattened the nav, which is §3
happening to someone who had already written §3.

If a third surface ever needs this recipe, decide which of the two fills it
wants before adding a class. The question is always "does dense text sit on
it", not "should it look like glass".

## 3. Alpha is the whole trick

The nav had `backdrop-blur-lg` on it long before it looked like glass. The blur
was working the entire time; the background was `0.7` alpha, opaque enough that
none of the blur could be seen.

If this ever stops looking like glass, check the alpha before adding more blur.
It has since gone wrong a second time, from `--site-nav` being raised to `0.93`
for the drawer's sake while the nav was still sharing it — same symptom, same
cause, fixed by splitting the token rather than by touching the blur. See §2a.

## 4. The fallback

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .site-glass { background: var(--site-nav-solid); }
}
```

Where `backdrop-filter` is unavailable, the translucency has nothing to blur and
the labels end up sitting directly on page content. The fallback drops the
effect and takes the near-solid ground instead. Degrading to a plain bar is
correct here; degrading to unreadable labels is not.

## 5. `filter` on an ancestor will break this

`backdrop-filter` samples the backdrop of its containing block. An ancestor with
a `filter` establishes a new containing block, and the effect silently does
nothing — no error, no warning, it just goes flat.

Worth knowing because this codebase already has one: `[data-site-theme='light']
.site-invert-asset { filter: invert(1); }`. It does not sit over the nav, so
there is no conflict today. See §4cc of
[`design-system.md`](./design-system.md), which covers the same trap from the
theme side.

When debugging a dead glass effect, walk the ancestors for a computed `filter`
before touching anything else.

## 6. Known trade-off: label contrast over bright artwork

**This is not solved.** The inactive labels are `--site-fg-2` (`#96a09c`), a
mid-grey. Against a translucent nav the effective background depends on whatever
happens to be scrolling underneath.

Measured contrast for those labels, at 16px, where AA requires 4.5:1:

| nav alpha | over the page ground | over bright card artwork |
| --- | --- | --- |
| `0.55` (current) | 6.4:1 | **1.76:1** |
| `0.7` (before the glass work) | 6.12:1 | **2.6:1** |
| `0.8` | 5.98:1 | **3.37:1** |

Two things follow. It already failed before the nav was made glassy, so this is
not a regression the effect introduced — the effect made an existing problem
more visible. And **no alpha fixes it**: even at `0.8`, which no longer looks
like glass, it is still short of 4.5:1.

The cause is the ink, not the glass. A mid-grey cannot clear 4.5:1 against a
mid-tone composite in either direction. The fix is to take the inactive labels
toward white, so hierarchy comes from inversion — white text on glass against
dark text on the white active pill — rather than from dimming. That is a visual
change to the nav and has not been made.

In practice the nav is over the page ground most of the time, where it measures
6.4:1. The failure is real but intermittent, which is the least convenient kind.
