import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@cloud-march/motion/react';

import PrismButton from '../components/chat/PrismButton';
import {
  IconBlocks,
  IconChaos,
  IconCheck,
  IconChrome,
  IconColumns,
  IconGlass,
  IconHome,
  IconKeycap,
  IconMeasure,
  IconPixel,
  IconRaw,
  IconSketch,
  IconSlab,
  IconSprite,
  IconSwiss,
  IconTheme,
} from '../components/chat/Icons';
import { useTheme } from './useTheme';

/* The appearance control.
 *
 * It sits where the Home button used to, and keeps that button's shape: the
 * prism pill is still the trigger, now icon-only with a tooltip instead of a
 * word, because an icon that changes what the page *looks like* is better
 * demonstrated than named. Clicking it drops a drawer of themes, each one
 * previewed by its own swatch rather than described.
 *
 * The drawer is a radio menu, not a toggle: themes are a list that grows, and
 * a two-state switch would have to be rebuilt the moment a third arrives.
 */

const THEME_ICONS = {
  home: IconHome,
  glass: IconGlass,
  slab: IconSlab,
  pixel: IconPixel,
  blocks: IconBlocks,
  raw: IconRaw,
  measure: IconMeasure,
  chaos: IconChaos,
  sketch: IconSketch,
  columns: IconColumns,
  swiss: IconSwiss,
  keycap: IconKeycap,
  chrome: IconChrome,
  sprite: IconSprite,
};

const DRAWER = {
  initial: { opacity: 0, y: -8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { type: 'spring', stiffness: 460, damping: 32 },
};

const TIP = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
};

export default function ThemeSwitcher() {
  const { themeId, themes, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef(null);
  const tipId = useId();
  const menuId = useId();

  // Escape closes from anywhere, including from inside the drawer.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus leaving the control closes it, which is what a keyboard user means
  // by tabbing past a menu. relatedTarget is null on window blur — leave it
  // open there, or alt-tabbing away would silently dismiss it.
  const onBlur = (e) => {
    const next = e.relatedTarget;
    if (next && !rootRef.current?.contains(next)) setOpen(false);
  };

  const toggle = () => {
    setOpen((v) => !v);
    setHover(false);
  };

  const trigger = {
    onClick: toggle,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    'aria-describedby': hover && !open ? tipId : undefined,
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={onBlur}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Same two-density arrangement the header already used: the full prism
          pill where there is room, a plain round button where there is not. */}
      <span className="hidden sm:block">
        <PrismButton
          label="Theme"
          showLabel={false}
          icon={IconTheme}
          onFocus={() => setHover(true)}
          {...trigger}
        />
      </span>
      {/* `--site-fg`, not `text-white/80`.
          The white-alpha utilities only follow the ink inside `.lg-root`,
          where `--color-white` is rebound per theme. This button lives in the
          navbar, so the utility stayed literally white and the half-disc was
          white-on-white the moment the theme's ground went light — invisible
          in eleven of the fourteen. Full ink rather than the secondary the
          light/dark toggle beside it uses: this one is the trigger for the
          whole appearance system, and the filled half of the disc is what
          makes it read as a contrast glyph at all. */}
      <button
        type="button"
        aria-label="Theme"
        className="lg-surface lg-focus grid h-10 w-10 place-items-center rounded-full sm:hidden"
        style={{ color: 'var(--site-fg)' }}
        {...trigger}
      >
        <IconTheme size={17} />
      </button>

      {/* tooltip — suppressed while the drawer is open, where it would just
          cover the thing it is describing */}
      <AnimatePresence>
        {hover && !open && (
          <motion.span
            id={tipId}
            role="tooltip"
            {...TIP}
            className="lg-surface pointer-events-none absolute right-0 top-[calc(100%+8px)] z-40 hidden whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] sm:block"
            style={{ color: 'var(--site-fg)' }}
          >
            Theme
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away layer, beneath the drawer itself. */}
            <button
              type="button"
              aria-label="Close theme menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <motion.div
              id={menuId}
              role="menu"
              aria-label="Appearance"
              {...DRAWER}
              /* 300px, not 272: the hint line has to survive a monospace theme,
                 where the same 26 characters are about 30% wider.
                 The `min()` is the narrow-screen escape. This is anchored to
                 the right of a button that already sits near the right edge, so
                 at 390px a fixed 300 put the drawer's left edge at -14 and the
                 swatches were cut off. Below roughly 410px it takes what is
                 there instead, and the hints truncate rather than leave. */
              /* `site-glass`, not `lg-surface`. The drawer opens over the
                 site chrome now, not only over the chat surface, so it wants
                 the chrome's own frosted recipe — translucent ground, blur and
                 saturate, inset rim — which is documented in
                 docs/glass-nav.md and already follows the active theme. */
              className="site-glass site-glass-panel absolute right-0 top-[calc(100%+10px)] z-40 w-[min(300px,calc(100vw-7rem))] origin-top-right overflow-hidden rounded-2xl p-1.5"
            >
              <span
                className="lg-hairline"
                style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
              />

              {/* 76%, not the 35% this label used to be. The drawer opens over
                  a translucent ground that is light in eleven of the fourteen
                  themes, and a faint label measured 2.9:1 on the palest of
                  them. Measured across every theme, this is the floor that
                  clears AA on all of them. */}
              <p
                className="px-2.5 pb-1.5 pt-2 text-[11px]"
                style={{
                  color: 'color-mix(in oklab, var(--site-fg) 76%, transparent)',
                  fontWeight: 'var(--lg-weight-strong)',
                  textTransform: 'var(--lg-label-transform)',
                  letterSpacing: 'var(--lg-label-tracking)',
                }}
              >
                Appearance
              </p>

              {/*
                * The list scrolls, the label does not.
                *
                * Fourteen rows is taller than a laptop viewport, and the drawer
                * hangs from the navbar — so its room is the window minus the bar
                * minus its own offset, which is what the `calc` says. `svh`
                * rather than `vh` because on mobile `vh` is the *largest*
                * viewport, i.e. it assumes browser chrome that may be on screen,
                * and the drawer would run under it.
                *
                * `overscroll-contain` stops a flick at the end of the list from
                * carrying on into the page behind.
                */}
              <div className="max-h-[min(calc(100svh-9rem),30rem)] overflow-y-auto overscroll-contain">
              {themes.map((t) => {
                const Icon = THEME_ICONS[t.icon] || IconGlass;
                const on = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      setTheme(t.id);
                      setOpen(false);
                    }}
                    className={`lg-focus flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      on ? 'lg-row-on' : 'lg-row-off'
                    }`}
                  >
                    {/* the swatch doubles as the icon well, so the row shows
                        the theme's palette rather than asserting it in words */}
                    <span
                      aria-hidden="true"
                      className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${t.swatch[0]} 0 42%, ${t.swatch[1]} 42% 72%, ${t.swatch[2]} 72%)`,
                        boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.45)',
                      }}
                    >
                      <Icon size={15} style={{ color: '#ffffff', mixBlendMode: 'difference' }} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13.5px]"
                        style={{ fontWeight: 'var(--lg-weight-strong)', color: 'var(--site-fg)' }}
                      >
                        {t.name}
                      </span>
                      <span
                        className="block truncate text-[12px]"
                        style={{ color: 'color-mix(in oklab, var(--site-fg) 84%, transparent)' }}
                      >
                        {t.hint}
                      </span>
                    </span>

                    {on && (
                      <span className="shrink-0" style={{ color: 'var(--site-accent)' }}>
                        <IconCheck size={15} />
                      </span>
                    )}
                  </button>
                );
              })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
