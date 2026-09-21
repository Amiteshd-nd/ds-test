/* The design system's public surface. Import from here, not from the files —
 * the split between registry, provider and control is an implementation
 * detail and has already changed once. */

export { ThemeProvider } from './ThemeProvider';
export { useTheme } from './useTheme';
export { default as ThemeSwitcher } from './ThemeSwitcher';
export { DEFAULT_THEME, DEFAULT_BY_MODE, THEMES, getTheme, isTheme } from './themes';
