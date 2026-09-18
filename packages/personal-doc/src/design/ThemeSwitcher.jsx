import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import PrismButton from '../components/chat/PrismButton';
import {
  IconBlocks,
  IconChaos,
  IconCheck,
  IconChrome,
  IconColumns,
  IconGlass,
  IconKeycap,
  IconMeasure,
  IconPixel,
  IconRaw,
  IconSketch,
  IconSlab,
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
      <button
        type="button"
        aria-label="Theme"
        className="lg-surface lg-focus grid h-10 w-10 place-items-center rounded-full text-white/80 sm:hidden"
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
            className="lg-surface pointer-events-none absolute right-0 top-[calc(100%+8px)] z-40 hidden whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/80 sm:block"
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
                 where the same 26 characters are about 30% wider. */
              className="lg-surface absolute right-0 top-[calc(100%+10px)] z-40 w-[300px] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-2xl p-1.5"
            >
              <span
                className="lg-hairline"
                style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
              />

              <p
                className="px-2.5 pb-1.5 pt-2 text-[11px] text-white/35"
                style={{
                  fontWeight: 'var(--lg-weight-strong)',
                  textTransform: 'var(--lg-label-transform)',
                  letterSpacing: 'var(--lg-label-tracking)',
                }}
              >
                Appearance
              </p>

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
                    className={`lg-focus flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      on ? 'bg-white/10' : 'hover:bg-white/[0.055]'
                    }`}
                  >
                    {/* the swatch doubles as the icon well, so the row shows
                        the theme's palette rather than asserting it in words */}
                    <span
                      aria-hidden="true"
                      className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${t.swatch[0]} 0 42%, ${t.swatch[1]} 42% 72%, ${t.swatch[2]} 72%)`,
                        boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.45)',
                      }}
                    >
                      <Icon size={17} style={{ color: '#ffffff', mixBlendMode: 'difference' }} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[14px] text-white"
                        style={{ fontWeight: 'var(--lg-weight-strong)' }}
                      >
                        {t.name}
                      </span>
                      <span className="block truncate text-[12.5px] text-white/45">{t.hint}</span>
                    </span>

                    {on && (
                      <span className="shrink-0" style={{ color: 'var(--lg-accent-soft)' }}>
                        <IconCheck size={15} />
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
