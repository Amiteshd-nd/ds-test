import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { DEFAULT_BY_MODE, DEFAULT_THEME, STORAGE_KEY, THEMES, getTheme, isTheme } from './themes';
import { SITE_THEME_EVENT, applyTheme, currentTheme } from '../hooks/useSiteTheme';
import { ThemeContext } from './useTheme';
import './themes.css';

/* Theme state for the Home 2.2 surface.
 *
 * The provider owns exactly one DOM write — `data-lg-theme` on <html> — and
 * everything visual falls out of the cascade from there. Nothing re-renders to
 * repaint a colour, which matters on a page that already re-renders ~30x a
 * second while an answer streams.
 *
 * It is written on <html> rather than on the page root so that anything
 * portalled out of the tree still resolves the same tokens, and removed on
 * unmount so the rest of the site never inherits a theme it was not designed
 * for.
 */

function readStored() {
  let saved = DEFAULT_THEME;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isTheme(value)) saved = value;
  } catch {
    // Private mode / blocked storage — the default is a fine answer.
  }

  /* The site-wide light/dark choice outranks the remembered theme.
   *
   * The other way round is worse than it sounds: someone who set the site to
   * light, and whose last theme here was Liquid Glass, would land on this page
   * and have it quietly flip the whole site back to dark. Better to open in the
   * light member and let the drawer take it from there. */
  const mode = currentTheme();
  return getTheme(saved).mode === mode ? saved : DEFAULT_BY_MODE[mode];
}

/* Last theme used in each mode, so dark -> light -> dark returns you to the
 * theme you were actually in rather than to the default. Module scope rather
 * than state: it is a preference about the session, not something that renders,
 * and putting it in state would restart the effect that owns the DOM write. */
const lastByMode = { dark: null, light: null };

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(readStored);

  // Layout effect, not effect: this runs before paint, so a returning visitor
  // never sees a frame of the default theme before their own arrives.
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-lg-theme', themeId);
  }, [themeId]);

  /* A theme may bring its own typeface. Loading it here rather than from
   * themes.css means a face is fetched the first time someone actually picks
   * the theme wearing it, and never for the visitors who do not. The link is
   * left in place afterwards — re-selecting a theme should be instant, and one
   * stylesheet per theme is a smaller cost than a re-fetch. */
  useEffect(() => {
    const href = getTheme(themeId).fonts;
    // Keyed on the stylesheet, not the theme: two themes can want the same
    // face, and keying on the id would inject the same <link> twice.
    if (!href || document.querySelector(`link[data-lg-font="${CSS.escape(href)}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.lgFont = href;
    document.head.appendChild(link);
  }, [themeId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* not worth failing a theme change over */
    }
  }, [themeId]);

  // Separate from the write above so it fires only on unmount, not on every
  // change. Combining them would strip the attribute between themes.
  useEffect(
    () => () => {
      document.documentElement.removeAttribute('data-lg-theme');
    },
    [],
  );

  /* The site toggle is the mode control; the drawer is the theme control. They
   * write to each other so the two never disagree: flipping the toggle moves to
   * a theme of that mode, and picking a theme moves the toggle to its mode. */
  useEffect(() => {
    const mode = getTheme(themeId).mode;
    lastByMode[mode] = themeId;
    if (currentTheme() !== mode) applyTheme(mode);
  }, [themeId]);

  useEffect(() => {
    const follow = (e) => {
      const mode = e.detail;
      setThemeId((current) => {
        if (getTheme(current).mode === mode) return current;
        return lastByMode[mode] || DEFAULT_BY_MODE[mode];
      });
    };

    window.addEventListener(SITE_THEME_EVENT, follow);
    return () => window.removeEventListener(SITE_THEME_EVENT, follow);
  }, []);

  const setTheme = useCallback((id) => {
    if (isTheme(id)) setThemeId(id);
  }, []);

  const value = useMemo(
    () => ({ themeId, theme: getTheme(themeId), themes: THEMES, setTheme }),
    [setTheme, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

