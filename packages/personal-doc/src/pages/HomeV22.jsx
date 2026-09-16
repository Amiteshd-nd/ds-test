import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

import GlassCube from '../components/chat/GlassCube';
import PromptBar from '../components/chat/PromptBar';
import SuggestionRail from '../components/chat/SuggestionRail';
import TypedHeadline from '../components/chat/TypedHeadline';
import Transcript from '../components/chat/Transcript';
import { IconArrowDown, IconNew } from '../components/chat/Icons';
import { ThemeProvider, ThemeSwitcher, useTheme } from '../design';
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

/* The page is wrapped rather than themed in place: ThemeProvider has to be
 * above everything that reads a theme, and the surface's own header is one of
 * those readers. */
export default function HomeV22() {
  return (
    <ThemeProvider>
      <ChatSurface />
    </ThemeProvider>
  );
}

function ChatSurface() {
  const reduce = useReducedMotion();
  const { theme } = useTheme();

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
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: 'var(--lg-live)', boxShadow: 'var(--lg-live-glow)' }}
          />
          <span className="truncate text-[13.5px] text-white/55">
            <span className="font-medium text-white/85">Ask Amitesh</span>
            <span className="mx-1.5 text-white/20">/</span>
            Home 2.2
          </span>
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
