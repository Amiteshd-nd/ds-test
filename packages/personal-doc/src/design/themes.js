/* The theme registry — the single source of truth for *which* themes exist.
 *
 * Visual values do NOT live here. Every colour, shadow, radius and blur is a
 * CSS custom property declared in themes.css under `[data-lg-theme='<id>']`,
 * because tokens have to cascade to reach markup this file never sees.
 *
 * What does live here is everything CSS cannot express:
 *   - metadata for the theme picker (name, hint, swatch)
 *   - `material`, the handful of numbers the WebGL cube needs as uniforms.
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
     * to be. tint is unused at flat 0 but kept whole for uniform shape. */
    material: { flat: 0, tint: [1, 1, 1] },
  },
  {
    id: 'neo',
    name: 'Neo Brutalism',
    hint: 'Flat ink, hard shadows',
    icon: 'slab',
    swatch: ['#ffffff', '#0a6cff', '#f6a93b'],
    /* flat 1 posterises the cube to four luminance steps and tints it, so the
     * same shader reads as printed ink rather than refracted light. */
    material: { flat: 1, tint: [0.04, 0.42, 1.0] },
  },
];

export const DEFAULT_THEME = THEMES[0].id;

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const isTheme = (id) => THEMES.some((t) => t.id === id);
