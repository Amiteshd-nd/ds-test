import { useEffect, useState } from 'react';

/*
 * Light and dark for the site chrome, home and works.
 *
 * The attribute lives on <html> and is written once in index.html before first
 * paint, so a visitor who has chosen light does not get a frame of dark first.
 * This hook only keeps React in step with it.
 *
 * Nothing here moves the mode on its own. It used to follow
 * `prefers-color-scheme` until the visitor picked, which meant the OS — and,
 * on a machine that switches at sunset, the time of day — could repaint the
 * site mid-session without anyone touching anything. Dark is the default and
 * the toggle is the only thing that changes it.
 */

const KEY = 'site-theme';

/* Broadcast, so surfaces with their own theming can follow the toggle without
 * this hook having to know they exist. Home 2.2 listens for it and moves its
 * own thirteen-theme system to a member of the matching mode. */
export const SITE_THEME_EVENT = 'site-theme-change';

export function applyTheme(next, { remember = true } = {}) {
  document.documentElement.dataset.siteTheme = next;
  if (remember) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* Not being able to remember the choice is not a reason to refuse it. */
    }
  }
  window.dispatchEvent(new CustomEvent(SITE_THEME_EVENT, { detail: next }));
}

export function currentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.siteTheme === 'light' ? 'light' : 'dark';
}

export default function useSiteTheme() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    /* Another surface can move the mode too: picking Magazine in the theme
       drawer is a choice of a light theme, and the toggle has to agree. That
       is still the visitor choosing — it is one of their actions reaching two
       controls, not the site deciding for them. */
    const sync = (e) => setTheme(e.detail);

    window.addEventListener(SITE_THEME_EVENT, sync);
    return () => window.removeEventListener(SITE_THEME_EVENT, sync);
  }, []);

  const toggle = () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light');

  return { theme, toggle };
}
