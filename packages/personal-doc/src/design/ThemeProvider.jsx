import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { DEFAULT_THEME, FALLBACK_THEME, STORAGE_KEY, THEMES, getTheme, isTheme } from './themes';
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

/* What the visitor last chose, or Original.
 *
 * Nothing is second-guessed here. This used to compare the remembered theme
 * against the remembered mode and, when they disagreed, discard the theme and
 * substitute the default for that mode — so a visitor could return to the site
 * and find themselves in a design system they had never picked.
 *
 * That check only ever fired because the OS could move the mode behind the
 * visitor's back. It cannot any more: the mode changes only when the toggle is
 * pressed, and pressing it already moves the theme in step (see the effects
 * below), so the two values in storage are written together and cannot drift
 * apart. With the cause gone the correction is not a safety net, it is just a
 * way to lose someone's choice. */
function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isTheme(value)) return value;
  } catch {
    // Private mode / blocked storage — the default is a fine answer.
  }
  return DEFAULT_THEME;
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

  /* The attribute is deliberately never removed. It used to be stripped on
     unmount, back when the provider lived inside Home 2.2 and the theme was
     that one page's business. The provider now sits at the root and the theme
     dresses the whole site, so there is no longer a moment where taking it off
     would be correct — doing so would drop the site back to its untinted
     tokens mid-session. */

  /* The site toggle is the mode control; the drawer is the theme control. They
   * write to each other so the two never disagree: flipping the toggle moves to
   * a theme of that mode, and picking a theme moves the toggle to its mode. */
  useEffect(() => {
    const mode = getTheme(themeId).mode;
    /* An `auto` theme has no mode to impose — it wears whichever the toggle is
       already set to, so pushing the site either way here would be wrong. */
    if (mode === 'auto') return;
    lastByMode[mode] = themeId;
    if (currentTheme() !== mode) applyTheme(mode);
  }, [themeId]);

  useEffect(() => {
    const follow = (e) => {
      const mode = e.detail;
      setThemeId((current) => {
        const currentMode = getTheme(current).mode;
        /* Flipping light/dark while on `auto` keeps you on it: it renders in
           both, so there is nothing to move you to. */
        if (currentMode === 'auto' || currentMode === mode) return current;
        return lastByMode[mode] || FALLBACK_THEME;
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

