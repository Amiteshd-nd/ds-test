import useSiteTheme from '../hooks/useSiteTheme';

/*
 * Two glyphs, swapped. No rotation, no morph: this is a control someone hits
 * once, and a half second of animation on it is a half second they are waiting.
 */
export default function ThemeToggle({ className = '', color = 'var(--site-fg-2)' }) {
  const { theme, toggle } = useSiteTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLight}
      title={isLight ? 'Switch to dark' : 'Switch to light'}
      className={`grid place-items-center w-10 h-10 rounded-full transition-colors duration-[180ms] ${className}`}
      style={{ color }}
    >
      <span className="sr-only">{isLight ? 'Switch to dark mode' : 'Switch to light mode'}</span>
      {isLight ? (
        /* Moon */
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M15.5 10.6A6.8 6.8 0 0 1 7.4 2.5a6.8 6.8 0 1 0 8.1 8.1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        /* Sun */
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="9"
              y1="1.4"
              x2="9"
              y2="3.2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              transform={`rotate(${a} 9 9)`}
            />
          ))}
        </svg>
      )}
    </button>
  );
}
