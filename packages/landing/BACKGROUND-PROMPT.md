# Hero render prompt

> Used by iteration 1 (`/v1`) only. Iteration 2 draws its own background,
> the sticker crowd in `public/stickers/`, generated from `src/lib/landmarks.ts`.

The hero image is `public/bg.jpg` (the name is historical; it is no longer a background).
It sits inside a drafting-sheet frame on the right of the page and doubles as the teaser
thumbnail. The current file is a drawn placeholder (flat SVG hill, mountains, computer
and flowers) that stands in for the real render. Generate the render with the prompt below (Gemini image generation),
save it over `public/bg.jpg`, and rebuild. No code changes.

## Prompt (as written)

> A single rounded grassy hill in the centre of frame under a clear pale sky, distant
> blue-grey mountains, out-of-focus red wildflowers in the extreme foreground. On the
> hilltop sits a cream-coloured 1980s all-in-one personal computer, slightly oversized,
> its CRT screen glowing softly and displaying a hand-drafted architectural floor plan in
> thin dark ink on white — walls, door swings, a staircase. Photoreal 3D render, soft
> daylight, shallow depth of field, lots of empty sky in the upper third for headline text.

## Suggested addition

The image is shown whole, in a 3:2 frame, on a dark page. Two things help it there:

> Compose for a 3:2 landscape crop with the computer slightly above centre. Keep the sky
> pale and even rather than bright white, so it does not glare against a dark surround.

## Output spec

| | |
| --- | --- |
| Aspect | Landscape, 3:2 or 16:9 |
| Size | At least 2400px on the long edge |
| Format | JPEG, quality around 80 (aim for under 400 KB) |
| File | `public/bg.jpg`, same name, overwrite the placeholder |

## After swapping

- The frame keeps a 3:2 ratio. A 16:9 render is cropped at the sides; `object-cover`
  centres it. Export at 3:2 if you can.
- Update `hero.imageAlt` in `src/content.ts` if the render differs from the description.
- The blur placeholder and the social share card regenerate from the file on build.

## Reference

`assets/reference/crate-hero.webp` is the reference the layout was matched against.
It is kept for comparison and is not served by the site.
