import { createContext, useContext } from 'react';

import { DEFAULT_THEME, THEMES, getTheme } from './themes';

/* Split out of ThemeProvider.jsx so that file exports a component and nothing
 * else — Fast Refresh discards the module's state otherwise, which on this
 * page means losing the chosen theme on every save. */

export const ThemeContext = createContext(null);

/* Falls back to the default theme rather than throwing when used outside a
 * provider: a component reaching for `theme.material` during a lazy
 * boundary's fallback should render the default surface, not crash the route. */
export function useTheme() {
  return (
    useContext(ThemeContext) || {
      themeId: DEFAULT_THEME,
      theme: getTheme(DEFAULT_THEME),
      themes: THEMES,
      setTheme: () => {},
    }
  );
}
