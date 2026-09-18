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
  {
    id: 'chaos',
    name: 'Maximalism',
    hint: 'Stickers, tilt, overprint',
    icon: 'chaos',
    swatch: ['#ffff00', '#ff00ff', '#00ff00'],
    /* Pure magenta, four bands. The loudest ink in the set, and the cube is the
     * one thing on this surface that was already moving. */
    material: { flat: 1, tint: [0.95, 0.05, 0.9], bands: 4, pixel: 0 },
    fonts: 'https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap',
  },
  {
    id: 'raw',
    name: 'Anti-Polish / Raw',
    hint: 'Paper, sketch, unfinished',
    icon: 'sketch',
    swatch: ['#fafaf8', '#8b4513', '#d4c4a8'],
    /* Sepia and five bands: the cube reads as something photocopied rather
     * than rendered, which is the only honest way for it to be here at all. */
    material: { flat: 1, tint: [0.42, 0.32, 0.22], bands: 5, pixel: 0 },
    fonts: 'https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap',
  },
  {
    id: 'mag',
    name: 'Magazine',
    hint: 'Rules, kickers, drop caps',
    icon: 'columns',
    swatch: ['#ffffff', '#000000', '#dc2626'],
    /* The press red, six bands. A magazine prints photographs, so the cube gets
     * enough steps to still look photographed rather than stencilled. */
    material: { flat: 1, tint: [0.86, 0.15, 0.15], bands: 6, pixel: 0 },
    fonts: 'https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap',
  },
  {
    id: 'swiss',
    name: 'Swiss International',
    hint: 'Grid, air, numerals',
    icon: 'swiss',
    swatch: ['#f5f1e8', '#000000', '#b38b6d'],
    /* Tan, six bands. The one object on the page is allowed to be an object;
     * it just does not get to be louder than the grid it sits in. */
    material: { flat: 1, tint: [0.7, 0.55, 0.43], bands: 6, pixel: 0 },
    /* No `fonts`: index.css already loads Inter at 400-600, and the display
     * line here wants 400. A Swiss headline is large, not heavy. */
  },
  {
    id: 'real',
    name: 'Realism',
    hint: 'Keycaps, paper, metal',
    icon: 'keycap',
    swatch: ['#d6d7d9', '#f3f1ed', '#f0621b'],
    /* flat 0 — the only theme besides glass to keep the refraction, and the
     * one place where that is the *point*. Every other theme re-inks the cube
     * because a flat surface cannot host a physically-rendered object; this
     * one is built on the opposite premise, so the cube stays a real material
     * and becomes the glass paperweight on the desk. */
    material: { flat: 0, tint: [1, 1, 1], bands: 6, pixel: 0 },
  },
];

export const DEFAULT_THEME = THEMES[0].id;

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const isTheme = (id) => THEMES.some((t) => t.id === id);
