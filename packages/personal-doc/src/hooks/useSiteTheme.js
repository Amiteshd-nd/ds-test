import { useEffect, useState } from 'react';

/*
 * Light and dark for the site chrome, home and works.
 *
 * The attribute lives on <html> and is written once in index.html before first
 * paint, so a visitor who has chosen light does not get a frame of dark first.
 * This hook only keeps React in step with it.
 *
 * A visitor who has never chosen follows the OS and keeps following it. Once
 * they pick, the choice is theirs and the OS stops being consulted.
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
    const mq = window.matchMedia('(prefers-color-scheme: light)');

    const follow = (e) => {
      let stored = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        /* Private mode. Fall through to the OS. */
      }
      if (stored) return;
      applyTheme(e.matches ? 'light' : 'dark', { remember: false });
    };

    /* Another surface can move the mode too: picking Magazine in Home 2.2's
       drawer is a choice of a light theme, and the toggle has to agree. */
    const sync = (e) => setTheme(e.detail);

    mq.addEventListener('change', follow);
    window.addEventListener(SITE_THEME_EVENT, sync);
    return () => {
      mq.removeEventListener('change', follow);
      window.removeEventListener(SITE_THEME_EVENT, sync);
    };
  }, []);

  const toggle = () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light');

  return { theme, toggle };
}
