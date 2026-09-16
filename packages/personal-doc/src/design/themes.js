/* The theme registry — the single source of truth for *which* themes exist.
 *
 * Visual values do NOT live here. Every colour, shadow, radius and blur is a
 * CSS custom property declared in themes.css under `[data-lg-theme='<id>']`,
 * because tokens have to cascade to reach markup this file never sees.
 *
 * What does live here is everything CSS cannot express:
 *   - metadata for the theme picker (name, hint, swatch)
 *   - `material`, the handful of numbers the WebGL cube needs as uniforms
 *   - `fonts`, a stylesheet the provider loads only while the theme is active,
 *     so a face nobody has selected is never downloaded.
 *
 * Adding a theme is two edits: an entry here and a token block in themes.css.
 * Nothing else in the app should ever need to know a theme by name.
 */

export const STORAGE_KEY = 'ad:home-2.2:theme';

export const THEMES = [
  {
    id: 'glass',
    name: 'Liquid Glass',
    hint: 'Dark, refractive, blurred',
    icon: 'glass',
    swatch: ['#0c0c14', '#a758ff', '#5292ff'],
    /* flat 0 = the cube renders as the physically-based glass it was written
     * to be. The rest is unused at flat 0 but kept whole for uniform shape. */
    material: { flat: 0, tint: [1, 1, 1], bands: 6, pixel: 0 },
  },
  {
    id: 'neo',
    name: 'Neo Brutalism',
    hint: 'Flat ink, hard shadows',
    icon: 'slab',
    swatch: ['#ffffff', '#0a6cff', '#f6a93b'],
    /* flat 1 posterises the cube's luminance into bands and tints them, so the
     * same shader reads as printed ink rather than refracted light. */
    material: { flat: 1, tint: [0.04, 0.42, 1.0], bands: 6, pixel: 0 },
  },
  {
    id: 'gba',
    name: '16-Bit Handheld',
    hint: 'Chunky pixels, sunlit',
    icon: 'pixel',
    swatch: ['#fbdd65', '#3e9bd8', '#e23b2e'],
    /* Four bands and a 56-block grid: the cube is re-rendered at handheld
     * resolution rather than filtered down to look like it was. */
    material: { flat: 1, tint: [0.22, 0.58, 0.84], bands: 4, pixel: 56 },
    fonts: 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=Silkscreen:wght@400;700&display=swap',
  },
  {
    id: 'neub',
    name: 'Neubrutalism',
    hint: 'Primary colours, no radius',
    icon: 'blocks',
    swatch: ['#fde047', '#f472b6', '#2196f3'],
    /* Five bands and a saturated ink. Three was truer to "flat colours" on
     * paper and wrong in practice: with so few steps the cube's bevels stop
     * separating and it reads as a blob rather than a solid. */
    material: { flat: 1, tint: [0.86, 0.22, 0.56], bands: 5, pixel: 0 },
    /* index.css loads Inter at 400-600; the display line here is 900. */
    fonts: 'https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap',
  },
  {
    id: 'brutal',
    name: 'Brutalism',
    hint: 'Raw, mono, no shadow',
    icon: 'raw',
    swatch: ['#ffffff', '#000000', '#ff0000'],
    /* A black monolith on white. Four bands rather than the six a soft theme
     * wants: enough for the form to read, few enough to stay crude. */
    material: { flat: 1, tint: [0.08, 0.08, 0.1], bands: 4, pixel: 0 },
    /* No `fonts` on purpose — see the token block in themes.css. */
  },
  {
    id: 'min',
    name: 'Minimal & Direct',
    hint: 'One column, all whitespace',
    icon: 'measure',
    swatch: ['#ffffff', '#111827', '#3b82f6'],
    /* Eight bands and a graphite ink: the quietest the cube can be while still
     * being a solid. This is the only flat theme that wants *more* steps, not
     * fewer — the style's restraint is about decoration, not about crudeness. */
    material: { flat: 1, tint: [0.34, 0.38, 0.44], bands: 8, pixel: 0 },
    fonts: 'https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap',
  },
];

export const DEFAULT_THEME = THEMES[0].id;

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const isTheme = (id) => THEMES.some((t) => t.id === id);
