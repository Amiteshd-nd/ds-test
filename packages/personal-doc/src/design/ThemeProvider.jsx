import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { DEFAULT_THEME, STORAGE_KEY, THEMES, getTheme, isTheme } from './themes';
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
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    // Private mode / blocked storage — the default is a fine answer.
    return DEFAULT_THEME;
  }
}

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
    if (!href || document.querySelector(`link[data-lg-font="${themeId}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.lgFont = themeId;
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

  const setTheme = useCallback((id) => {
    if (isTheme(id)) setThemeId(id);
  }, []);

  const value = useMemo(
    () => ({ themeId, theme: getTheme(themeId), themes: THEMES, setTheme }),
    [setTheme, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

