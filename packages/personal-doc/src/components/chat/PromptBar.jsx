import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { DEPTHS, TONES } from '../../lib/portfolioBrain';
import { IconChevron, IconPlus, IconSend, IconStop, IconVoice } from './Icons';
import { ICONS } from './iconMap';

/* The prompt bar.
 *
 * A spring drives the rim light's conic angle so the bright arc of the 1px
 * border faces the cursor. Angles are unwrapped before springing, otherwise
 * crossing 0deg sends the highlight the long way round the bar. Proximity
 * feeds a second spring that brightens the rim as the pointer approaches.
 *
 * With no fine pointer (touch) or after ~2.4s of stillness, the highlight
 * drifts slowly around the edge on its own so the bar never looks dead.
 */

/* The rim's chromatic stops come from the theme. They are written as bare
 * channel triplets (`255 122 61`) so the alpha the spring is driving can be
 * mixed in with `rgb(... / a)` — a var cannot be spliced into the middle of a
 * legacy `rgba(r,g,b,a)`. A flat theme hides the rim outright through
 * --lg-hairline-display, so its values there are only a fallback. */
const WARM = 'var(--lg-rim-warm)';
const COOL = 'var(--lg-rim-cool)';
const HOT = 'var(--lg-rim-hot)';
const IDLE_AFTER = 2400;

export default function PromptBar({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  depth,
  onDepthChange,
  tone,
  onToneChange,
  compact = false,
  placeholder = 'Ask anything…',
  inputRef,
}) {
  const wrapRef = useRef(null);
  const localRef = useRef(null);
  const textareaRef = inputRef || localRef;
  const reduce = useReducedMotion();

  const [menu, setMenu] = useState(null); // 'depth' | 'tone' | null
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  /* ------------------------------------------------------------ glow rig */

  const angle = useMotionValue(90);
  const heat = useMotionValue(0);

  const sAngle = useSpring(angle, { stiffness: 90, damping: 20, mass: 0.7 });
  const sHeat = useSpring(heat, { stiffness: 160, damping: 26 });

  const rimAlpha = useTransform(sHeat, [0, 1], [0.55, 1]);
  const rim = useMotionTemplate`conic-gradient(from ${sAngle}deg at 50% 50%, rgb(${WARM} / ${rimAlpha}) 0deg, rgb(${HOT} / 0.75) 44deg, rgb(${COOL} / ${rimAlpha}) 108deg, rgb(${HOT} / 0.14) 210deg, rgb(${HOT} / 0.09) 360deg)`;

  // Unwrap so the spring takes the short way round.
  const angleRef = useRef(90);
  const setAngle = useCallback(
    (deg) => {
      let next = deg;
      const prev = angleRef.current;
      while (next - prev > 180) next -= 360;
      while (next - prev < -180) next += 360;
      angleRef.current = next;
      angle.set(next);
    },
    [angle],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;

    const coarse = window.matchMedia('(hover: none)').matches;
    let lastMove = coarse ? -Infinity : 0;
    let raf = 0;

    const place = (clientX, clientY) => {
      const r = wrap.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const cx = r.width / 2;
      const cy = r.height / 2;

      setAngle((Math.atan2(y - cy, x - cx) * 180) / Math.PI);

      // Proximity falloff measured to the rect, not its centre, so a wide bar
      // does not read as "far" just because the cursor is near one end.
      const dx = Math.max(r.left - clientX, 0, clientX - r.right);
      const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const dist = Math.hypot(dx, dy);
      heat.set(Math.max(0, 1 - dist / 340));
    };

    const onMove = (e) => {
      lastMove = performance.now();
      place(e.clientX, e.clientY);
    };

    if (!coarse) window.addEventListener('pointermove', onMove, { passive: true });

    if (!reduce) {
      // Idle drift: with no pointer, walk the rim highlight slowly around the
      // bar so the edge still has some life in it.
      const drift = (now) => {
        if (now - lastMove > IDLE_AFTER) {
          const t = now / 1000;
          setAngle((Math.atan2(Math.sin(t * 0.63), Math.cos(t * 0.42)) * 180) / Math.PI);
          heat.set(0.34);
        }
        raf = requestAnimationFrame(drift);
      };
      raf = requestAnimationFrame(drift);
    }

    return () => {
      if (!coarse) window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [heat, reduce, setAngle]);

  /* --------------------------------------------------------- textarea fit */

  // Collapse to 0 before measuring rather than to `auto`: with a real height in
  // play, scrollHeight can report the element's current box instead of its
  // content, which latches the field open at its maximum. Height 0 forces
  // scrollHeight to mean exactly one thing.
  const fit = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const max = compact ? 120 : 168;
    el.style.height = '0px';
    const content = el.scrollHeight;
    el.style.height = `${Math.min(content, max)}px`;
    el.style.overflowY = content > max ? 'auto' : 'hidden';
  }, [compact, textareaRef]);

  useLayoutEffect(fit, [value, fit]);

  // Width is what actually decides the line count, so re-fit whenever it
  // changes. This also covers the first paint, where the field can briefly
  // measure at zero width — the placeholder wraps, scrollHeight balloons, and
  // the field would otherwise latch open at its maximum forever.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return undefined;

    const raf = requestAnimationFrame(fit);
    document.fonts?.ready.then(fit).catch(() => {});

    // Width-only: fit() mutates this element's height, so reacting to height
    // here would feed the observer its own output.
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fit, textareaRef]);

  /* -------------------------------------------------------------- voice */

  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(SR));
  }, []);

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join('');
      onChange(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  /* ------------------------------------------------------------- submit */

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(hover: none)').matches) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') setMenu(null);
  };

  /* --------------------------------------------------------------- menus */

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const activeDepth = DEPTHS.find((d) => d.id === depth) || DEPTHS[1];
  const activeTone = TONES.find((t) => t.id === tone) || TONES[0];
  const DepthIcon = ICONS[activeDepth.icon];

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* The glass slab */}
      <div
        className={`lg-surface lg-specular relative z-10 w-full ${compact ? 'rounded-[24px]' : 'rounded-[26px]'}`}
      >
        <motion.span className="lg-hairline" style={{ background: rim }} />

        <div className={compact ? 'px-3 pb-2 pt-3' : 'px-4 pb-3 pt-4'}>
          <label htmlFor="lg-prompt" className="sr-only">
            Ask about Amitesh’s work
          </label>
          <textarea
            id="lg-prompt"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            spellCheck="false"
            className="block max-h-[168px] w-full resize-none bg-transparent px-2 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/35 md:text-[17px]"
          />

          {/* control row */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              title="Attach — not wired up in this prototype"
              aria-label="Attach a file (unavailable)"
              disabled
              className="lg-surface-flat lg-focus grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/45 disabled:cursor-not-allowed"
            >
              <IconPlus size={17} />
            </button>

            <MenuChip
              open={menu === 'tone'}
              onToggle={() => setMenu(menu === 'tone' ? null : 'tone')}
              onDismiss={() => setMenu(null)}
              label={activeTone.label}
              items={TONES}
              active={tone}
              onPick={(id) => {
                onToneChange(id);
                setMenu(null);
                textareaRef.current?.focus();
              }}
            />

            <MenuChip
              open={menu === 'depth'}
              onToggle={() => setMenu(menu === 'depth' ? null : 'depth')}
              onDismiss={() => setMenu(null)}
              label={activeDepth.label}
              icon={<DepthIcon size={15} />}
              accent
              items={DEPTHS}
              active={depth}
              onPick={(id) => {
                onDepthChange(id);
                setMenu(null);
                textareaRef.current?.focus();
              }}
            />

            <div className="flex-1" />

            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-pressed={listening}
                aria-label={listening ? 'Stop dictation' : 'Dictate your question'}
                className={`lg-surface-flat lg-focus hidden h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] transition-colors sm:flex ${
                  listening ? 'text-[color:var(--lg-accent-warm)]' : 'text-white/70 hover:text-white'
                }`}
              >
                <motion.span
                  animate={listening && !reduce ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                  transition={{ duration: 1.1, repeat: listening ? Infinity : 0 }}
                  className="flex"
                >
                  <IconVoice size={16} />
                </motion.span>
                {listening ? 'Listening' : 'Voice'}
              </button>
            )}

            <motion.button
              type="button"
              onClick={busy ? onStop : submit}
              disabled={!busy && !value.trim()}
              aria-label={busy ? 'Stop generating' : 'Send question'}
              whileTap={{ scale: 0.92 }}
              animate={{ scale: !busy && !value.trim() ? 0.94 : 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className="lg-focus grid h-10 w-10 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-35"
              /* One of only two places that must stay light-on-fill in every
                 theme, so it names --lg-on-accent instead of inheriting the
                 remapped `text-white`. */
              style={{
                color: 'var(--lg-on-accent)',
                background: busy ? 'var(--lg-busy-fill)' : 'var(--lg-send-fill)',
                boxShadow: busy ? 'none' : 'var(--lg-send-shadow)',
                border: 'var(--lg-border) solid var(--lg-line)',
              }}
            >
              {busy ? <IconStop size={16} /> : <IconSend size={17} />}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Focus bloom — a quiet confirmation that the field is live. */}
      <AnimatePresence>
        {focused && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-0 rounded-[26px]"
            style={{ boxShadow: 'var(--lg-focus-bloom)' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function MenuChip({ label, icon, open, onToggle, onDismiss, accent, items, active, onPick }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`lg-surface-flat lg-focus flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium transition-colors ${
          accent ? 'text-white' : 'text-white/70 hover:text-white'
        }`}
      >
        {icon}
        <span className="max-w-[92px] truncate">{label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex text-white/45"
        >
          <IconChevron size={14} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away layer, beneath the menu itself. */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={onDismiss}
              className="fixed inset-0 z-20 cursor-default"
            />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              /* Opens upward: the bar sits low in the shell in both states. */
              className="lg-surface absolute bottom-[calc(100%+10px)] left-0 z-30 w-[258px] max-w-[calc(100vw-3rem)] origin-bottom overflow-hidden rounded-2xl p-1.5"
            >
              <span
                className="lg-hairline"
                style={{ background: 'linear-gradient(180deg, var(--lg-rim-a), var(--lg-rim-b))' }}
              />
              {items.map((item) => {
                const Icon = ICONS[item.icon];
                const on = item.id === active;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => onPick(item.id)}
                    className={`lg-focus flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      on ? 'bg-white/10' : 'hover:bg-white/[0.055]'
                    }`}
                  >
                    {Icon && (
                      <span className={on ? 'text-[color:var(--lg-accent-soft)]' : 'text-white/55'}>
                        <Icon size={17} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-white">{item.label}</span>
                      <span className="block truncate text-[12.5px] text-white/45">{item.hint}</span>
                    </span>
                    {on && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lg-accent-soft)]" />}
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
