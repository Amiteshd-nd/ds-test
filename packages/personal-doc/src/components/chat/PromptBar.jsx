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
 * The glow is the point of this component. Two coloured blobs live *outside*
 * the glass and bleed around its edge — warm tracking the cursor, cool mirrored
 * across the bar's centre — so the light appears to pass through the slab
 * rather than sit on it. Both ride springs, which is what gives the trail its
 * weight: the light has mass and arrives a beat after the pointer.
 *
 * A separate spring drives the rim light's conic angle so the bright arc of the
 * 1px border always faces the cursor. Angles are unwrapped before springing,
 * otherwise crossing 0deg sends the highlight the long way round the bar.
 *
 * With no fine pointer (touch) or after ~2.4s of stillness, a slow Lissajous
 * takes over so the material never looks dead.
 */

const WARM = '255,122,61';
const COOL = '82,146,255';
const BLOB = 460;
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

  const warmX = useMotionValue(0);
  const warmY = useMotionValue(0);
  const coolX = useMotionValue(0);
  const coolY = useMotionValue(0);
  const angle = useMotionValue(90);
  const heat = useMotionValue(0);

  // Soft, slightly underdamped: the light overshoots a touch and settles.
  const glowSpring = { stiffness: 130, damping: 20, mass: 0.9 };
  const sWarmX = useSpring(warmX, glowSpring);
  const sWarmY = useSpring(warmY, glowSpring);
  const sCoolX = useSpring(coolX, { ...glowSpring, stiffness: 100, damping: 22 });
  const sCoolY = useSpring(coolY, { ...glowSpring, stiffness: 100, damping: 22 });
  const sAngle = useSpring(angle, { stiffness: 90, damping: 20, mass: 0.7 });
  const sHeat = useSpring(heat, { stiffness: 160, damping: 26 });

  const warmOpacity = useTransform(sHeat, [0, 1], [0.55, 1]);
  const coolOpacity = useTransform(sHeat, [0, 1], [0.42, 0.9]);
  const rimAlpha = useTransform(sHeat, [0, 1], [0.55, 1]);
  const rim = useMotionTemplate`conic-gradient(from ${sAngle}deg at 50% 50%, rgba(${WARM},${rimAlpha}) 0deg, rgba(255,255,255,0.75) 44deg, rgba(${COOL},${rimAlpha}) 108deg, rgba(255,255,255,0.14) 210deg, rgba(255,255,255,0.09) 360deg)`;

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

      warmX.set(x);
      warmY.set(y);
      // Mirrored partner keeps both edges lit — the reference has warm on one
      // flank and cool on the other, never both stacked.
      coolX.set(cx * 2 - x);
      coolY.set(cy * 2 - y);
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
      // Idle drift: a 2:3 Lissajous just inside the bar's bounds.
      const drift = (now) => {
        if (now - lastMove > IDLE_AFTER) {
          const r = wrap.getBoundingClientRect();
          const t = now / 1000;
          const x = r.width * (0.5 + Math.sin(t * 0.42) * 0.42);
          const y = r.height * (0.5 + Math.sin(t * 0.63) * 0.55);
          warmX.set(x);
          warmY.set(y);
          coolX.set(r.width - x);
          coolY.set(r.height - y);
          setAngle((Math.atan2(y - r.height / 2, x - r.width / 2) * 180) / Math.PI);
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
  }, [coolX, coolY, heat, reduce, setAngle, warmX, warmY]);

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

  const blobStyle = (x, y, opacity, colour) => ({
    x,
    y,
    opacity,
    left: -BLOB / 2,
    top: -BLOB / 2,
    width: BLOB,
    height: BLOB,
    background: `radial-gradient(circle, rgba(${colour},0.95) 0%, rgba(${colour},0.42) 28%, rgba(${colour},0.12) 48%, rgba(${colour},0) 70%)`,
  });

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Glow field. Sits behind the glass and spills past its edge. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0">
          <motion.div
            className="absolute rounded-full blur-[46px] will-change-transform"
            style={blobStyle(sWarmX, sWarmY, warmOpacity, WARM)}
          />
          <motion.div
            className="absolute rounded-full blur-[54px] will-change-transform"
            style={blobStyle(sCoolX, sCoolY, coolOpacity, COOL)}
          />
        </div>
      </div>

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
                  listening ? 'text-[#ff7a3d]' : 'text-white/70 hover:text-white'
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
              className="lg-focus grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-35"
              style={{
                background: busy
                  ? 'rgba(255,255,255,0.14)'
                  : 'linear-gradient(135deg, #ff4ad6 0%, #a758ff 52%, #5292ff 100%)',
                boxShadow: busy ? 'none' : '0 6px 22px -8px rgba(167,88,255,0.95)',
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
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.10), 0 24px 70px -30px rgba(167,88,255,0.8)' }}
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
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.04))' }}
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
                      <span className={on ? 'text-[#c98bff]' : 'text-white/55'}>
                        <Icon size={17} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-white">{item.label}</span>
                      <span className="block truncate text-[12.5px] text-white/45">{item.hint}</span>
                    </span>
                    {on && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c98bff]" />}
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
