import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@cloud-march/motion/react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import GlassCube from '../components/chat/GlassCube';
import PromptBar from '../components/chat/PromptBar';
import SuggestionRail from '../components/chat/SuggestionRail';
import TypedHeadline from '../components/chat/TypedHeadline';
import Transcript from '../components/chat/Transcript';
import { IconArrowDown, IconChevron, IconNew } from '../components/chat/Icons';
import { ThemeSwitcher, useTheme } from '../design';
import ThemeToggle from '../components/ThemeToggle';
import { respond } from '../lib/portfolioBrain';
import '../styles/liquid-glass.css';

/* Home 2.2 — the portfolio as a chat-native surface.
 *
 * Layout is one column that redistributes rather than two designs: the dock
 * (material → prompt → suggestions) is vertically centred while the
 * conversation is empty, and settles to the bottom once it is not. The
 * material stays mounted throughout and only changes height, so the canvas
 * loop is never torn down mid-transition.
 */

const THINK_MS = 430;
const TICK_MS = 34;
const WORDS_PER_TICK = 2;
const BLOCK_EVERY = 4; // ticks between later blocks landing

let seq = 0;
const uid = () => `m${++seq}`;

/* Animation props are module constants, never inline literals.
 *
 * This page re-renders ~30x a second while an answer streams. Framer re-reads
 * inline `initial`/`animate`/`transition` objects on every one of those
 * renders and restarts the animation, which leaves an in-flight entrance
 * frozen part-way. A stable reference is left alone and simply finishes. */
const PAGE_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.45 },
};

const ORB_SPRING = { type: 'spring', stiffness: 220, damping: 30 };

/* Shared by the two forms the back control takes — a button when there is
   history to walk, a link when there is not. Same pixels either way. */
const BACK_CLASS =
  'lg-surface-flat lg-focus grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:text-white';

/* No ThemeProvider here any more — it sits at the root of the app so the theme
 * outlives this route. Wrapping again would create a second, independent copy
 * of the theme state, and the two would disagree the moment either changed. */
export default function HomeV22() {
  return <ChatSurface />;
}

function ChatSurface() {
  const reduce = useReducedMotion();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [depth, setDepth] = useState('balanced');
  const [tone, setTone] = useState('normal');
  const [thinking, setThinking] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const thinkTimer = useRef(null);

  const hasChat = messages.length > 0 || thinking;
  const streaming = messages.find((m) => m.role === 'assistant' && !m.done);
  const streamingId = streaming?.id ?? null;

  /* ------------------------------------------------------- viewport sizing */

  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Animating height needs real numbers, so the hero size is measured rather
  // than expressed as a clamp() the spring cannot interpolate.
  const orbHeight = hasChat ? 86 : Math.round(Math.max(140, Math.min(268, vh * 0.26)));
  // Memoised for the same reason as PAGE_FADE: a fresh object every tick would
  // keep restarting the height spring.
  const orbStyle = useMemo(() => ({ height: orbHeight }), [orbHeight]);

  /* ------------------------------------------------------------- asking */

  const clearTimers = useCallback(() => {
    clearTimeout(thinkTimer.current);
    thinkTimer.current = null;
  }, []);

  const ask = useCallback(
    (raw) => {
      const text = raw.trim();
      if (!text) return;

      clearTimers();
      setInput('');
      setMessages((list) => [...list, { id: uid(), role: 'user', text }]);
      setThinking(true);

      thinkTimer.current = setTimeout(() => {
        const answer = respond(text, depth, tone);
        setThinking(false);
        setMessages((list) => [
          ...list,
          {
            id: uid(),
            role: 'assistant',
            query: text,
            blocks: answer.blocks,
            followUps: answer.followUps,
            words: reduce ? 9999 : 0,
            shown: reduce ? answer.blocks.length : 1,
            done: Boolean(reduce),
          },
        ]);
      }, THINK_MS);
    },
    [clearTimers, depth, reduce, tone],
  );

  /*
   * A question handed over from the home page's ask box, as `?q=`.
   *
   * Two things make this fiddlier than it looks.
   *
   * The parameter is stripped with `history.replaceState`, not the router's
   * `navigate`. Routing to the same path re-renders this tree and unmounts the
   * component, and the unmount cleanup clears the pending think timer — the
   * question posted and then sat on the thinking dots forever. `replaceState`
   * tidies the URL without telling the router anything happened.
   *
   * And the ask is deferred by a tick, with the guard released on cleanup,
   * because StrictMode runs every effect twice in development: mount, clean up,
   * mount again. A timer created on the first pass is killed by the cleanup in
   * between, and a guard that survives that cleanup stops the second pass from
   * ever recreating it. Scheduling the work and cancelling it on cleanup means
   * exactly one ask survives, whether the effect runs once or twice.
   */
  const [searchParams] = useSearchParams();

  /* Captured once, on mount. The `?q=` handover below rewrites the URL with
     `replaceState`, and reading the key after that would be reading whatever
     that call left behind rather than how this entry was reached. */
  const [canGoBack] = useState(() => location.key !== 'default');
  const handedOver = useRef(false);

  useEffect(() => {
    if (handedOver.current) return undefined;

    const q = searchParams.get('q');
    if (!q?.trim()) return undefined;

    handedOver.current = true;
    /* `window.history.state`, not `{}`. React Router keeps the entry's own
       bookkeeping in there, and blanking it detaches this entry from the
       router's history stack — which broke going back. */
    window.history.replaceState(window.history.state, '', window.location.pathname);

    const id = setTimeout(() => ask(q), 0);
    return () => {
      clearTimeout(id);
      handedOver.current = false;
    };
  }, [ask, searchParams]);

  const stop = useCallback(() => {
    clearTimers();
    setThinking(false);
    setMessages((list) =>
      list.map((m) =>
        m.role === 'assistant' && !m.done
          ? { ...m, words: 9999, shown: m.blocks.length, done: true }
          : m,
      ),
    );
  }, [clearTimers]);

  const regenerate = useCallback(
    (message) => {
      setMessages((list) => {
        const i = list.findIndex((m) => m.id === message.id);
        if (i === -1) return list;
        const answer = respond(message.query, depth, tone);
        const next = list.slice(0, i);
        next.push({
          ...message,
          id: uid(),
          blocks: answer.blocks,
          followUps: answer.followUps,
          words: reduce ? 9999 : 0,
          shown: reduce ? answer.blocks.length : 1,
          done: Boolean(reduce),
        });
        return next;
      });
    },
    [depth, reduce, tone],
  );

  const reset = useCallback(() => {
    clearTimers();
    setMessages([]);
    setThinking(false);
    setInput('');
    inputRef.current?.focus();
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  /* ---------------------------------------------------------- the stream */

  useEffect(() => {
    if (!streamingId) return undefined;

    let tick = 0;
    const iv = setInterval(() => {
      tick += 1;
      setMessages((list) =>
        list.map((m) => {
          if (m.id !== streamingId) return m;

          const lead = m.blocks[0];
          const total = lead?.type === 'p' ? lead.text.split(' ').length : 0;

          if (m.words < total) {
            return { ...m, words: Math.min(total, m.words + WORDS_PER_TICK) };
          }
          if (m.shown < m.blocks.length) {
            return tick % BLOCK_EVERY === 0 ? { ...m, shown: m.shown + 1 } : m;
          }
          return { ...m, done: true };
        }),
      );
    }, TICK_MS);

    return () => clearInterval(iv);
  }, [streamingId]);

  /* --------------------------------------------------------- scroll glue */

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : behavior });
  }, [reduce]);

  useEffect(() => {
    if (atBottom) scrollToBottom('auto');
  }, [messages, thinking, atBottom, scrollToBottom]);

  /* ------------------------------------------------------------ shortcuts */

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Ask Amitesh — Home 2.2';
    return () => {
      document.title = prev;
    };
  }, []);

  const phase = useMemo(() => {
    if (thinking) return 'thinking';
    if (streamingId) return 'answering';
    if (input.trim().length > 0) return 'typing';
    return 'idle';
  }, [input, streamingId, thinking]);

  /* -------------------------------------------------------------- render */

  return (
    <motion.main {...PAGE_FADE} className="lg-root lg-shell relative flex flex-col overflow-hidden">
      <BackgroundWash />

      {/* ------------------------------------------------------------ top */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-3 px-4 pt-4 md:px-7 md:pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/*
            * Back to wherever you came from.
            *
            * This surface is reachable from the home page's ask box, from the
            * Works list and from the Museum, so a fixed `to="/works"` sent two
            * of those three visitors somewhere they had not been. Walking the
            * history back one entry is the only thing that answers all three.
            *
            * The objection to `navigate(-1)` was always the cold open — a
            * pasted `?q=` link has nothing behind it, and going back would
            * leave the site. `location.key` settles it: React Router stamps
            * every pushed entry with a key and leaves the first one in a
            * session as the literal string 'default'. So a key means there is
            * somewhere of ours to return to, and no key falls back to a link.
            *
            * Icon only. The breadcrumb beside it already says where you are,
            * and with the destination no longer fixed there is nothing
            * truthful to name in the label.
            */}
          {canGoBack ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              title="Go back"
              className={BACK_CLASS}
            >
              <IconChevron size={16} className="rotate-90" />
            </button>
          ) : (
            <Link to="/works" aria-label="Back to works" title="Back to works" className={BACK_CLASS}>
              <IconChevron size={16} className="rotate-90" />
            </Link>
          )}

          {/* Just the name. The green dot said "live", which was never true of
              anything here — the answers are written, not streamed from a
              service — and "/ Home 2.2" was an internal build label leaking
              into the interface. */}
          <span className="truncate text-[13.5px] font-medium text-white/85">Ask Amitesh</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {hasChat && (
              <motion.button
                type="button"
                onClick={reset}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="lg-surface-flat lg-focus flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] text-white/70 transition-colors hover:text-white"
              >
                <IconNew size={16} />
                <span className="hidden sm:inline">New chat</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* The appearance control. It keeps the prism pill the Home button
              used — same component, same slot — and owns its own breakpoint
              pair internally. */}
          <ThemeToggle
            className="lg-surface-flat lg-focus text-white/70 hover:text-white"
            color="currentColor"
          />
          <ThemeSwitcher />
        </div>
      </header>

      {/* Scrim: the transcript scrolls beneath the header, so give it something
          to dissolve into rather than a hard cut at the header's edge. */}
      {hasChat && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24"
          style={{ background: 'var(--lg-scrim)' }}
        />
      )}

      {/* -------------------------------------------------------- transcript */}
      {hasChat && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="lg-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-6 md:px-7"
        >
          {/* Measure is a token: a theme built on whitespace sets its own
              column width rather than inheriting this one. */}
          <div className="mx-auto w-full" style={{ maxWidth: 'var(--lg-measure)' }}>
            <Transcript
              messages={messages}
              thinking={thinking}
              onFollowUp={ask}
              onRegenerate={regenerate}
              phase={phase}
              material={theme.material}
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------- dock */}
      <section
        className={`relative z-20 w-full ${
          hasChat ? 'shrink-0' : 'lg-scroll min-h-0 flex-1 overflow-y-auto'
        }`}
      >
        <div
          className={`flex w-full flex-col justify-center px-4 md:px-7 ${hasChat ? '' : 'min-h-full py-4'}`}
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
        <div
          className="mx-auto w-full"
          style={{ maxWidth: hasChat ? 'var(--lg-measure)' : 'var(--lg-measure-wide)' }}
        >
          {/* the material — always directly above the field */}
          <motion.div
            animate={orbStyle}
            initial={false}
            transition={ORB_SPRING}
            className="relative w-full"
          >
            <GlassCube phase={phase} material={theme.material} className="h-full w-full" />
            <AnimatePresence>
              {!atBottom && hasChat && (
                <motion.button
                  type="button"
                  onClick={() => scrollToBottom()}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  aria-label="Jump to latest"
                  className="lg-surface lg-focus absolute -top-2 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full text-white/75"
                >
                  <IconArrowDown size={16} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Hero line, landing only.
              No exit animation on purpose: the dock itself is travelling from
              centre to bottom at the same moment, and fading this out in-flow
              makes the two motions collide. Cutting it lets the dock's move
              read as the single, deliberate transition. */}
          {!hasChat && (
            <div className="lg-rise mb-4 mt-1">
              <p
                data-lg-kicker=""
                className="mb-2 px-2 text-[12px] text-white/30"
                style={{
                  fontWeight: 'var(--lg-weight-strong)',
                  textTransform: 'var(--lg-label-transform)',
                  letterSpacing: 'var(--lg-label-tracking)',
                }}
              >
                Portfolio, as a conversation
              </p>
              <TypedHeadline onPick={(p) => setInput(p)} paused={input.length > 0} />
            </div>
          )}

          <div className={hasChat ? 'mt-1' : 'mt-0'}>
            <PromptBar
              value={input}
              onChange={setInput}
              onSubmit={ask}
              onStop={stop}
              busy={thinking || Boolean(streamingId)}
              depth={depth}
              onDepthChange={setDepth}
              tone={tone}
              onToneChange={setTone}
              compact={hasChat}
              inputRef={inputRef}
              placeholder={hasChat ? 'Ask a follow-up…' : 'Ask anything…'}
            />
          </div>

          {!hasChat && (
            <div className="lg-rise mt-4">
              {/* One component, two densities — rail on narrow, grid on wide. */}
              <div className="sm:hidden">
                <SuggestionRail onPick={ask} variant="rail" />
              </div>
              <div className="hidden sm:block">
                <SuggestionRail onPick={ask} variant="grid" />
              </div>
            </div>
          )}

          <p className="mt-3.5 px-2 text-center text-[11.5px] leading-relaxed text-white/28">
            Answers are written by Amitesh and matched to your question — not generated by a
            language model.{' '}
            <Link to="/works" className="underline decoration-white/20 underline-offset-2 hover:text-white/50">
              Browse the case studies instead
            </Link>
            .
          </p>
        </div>
        </div>
      </section>
    </motion.main>
  );
}

/* ------------------------------------------------------------- background */

function BackgroundWash() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {/* Two layers, both token-driven: a colour field and a texture over it.
          Glass spends them on bloom and a vignette, neo on cut paper shapes
          and a print dot grid — same two elements either way. */}
      <div className="absolute inset-0" style={{ background: 'var(--lg-wash)' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'var(--lg-vignette)', mixBlendMode: 'var(--lg-wash-blend)' }}
      />
    </div>
  );
}
