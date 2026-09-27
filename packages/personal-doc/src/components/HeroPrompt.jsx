import {
  AnimatePresence,
  motion,
  useReducedMotion,
  duration,
  ease,
} from '@cloud-march/motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconMic, IconSend } from './chat/Icons';
import VoiceBars from './chat/VoiceBars';
import useVoiceInput from '../hooks/useVoiceInput';
import { TYPED_PROMPTS } from '../lib/portfolioBrain';

/*
 * The ask box on the home page.
 *
 * It does not answer anything itself. Home 2.2 owns the conversation — the
 * brain, the transcript, the thinking delay — and duplicating any of that here
 * would mean two implementations drifting apart. This hands the question over
 * and gets out of the way.
 *
 * The handover is a query parameter rather than router state so the result is a
 * real link: `/home-2.2?q=...` can be pasted, bookmarked and shared, and it
 * still works for someone arriving cold. Home 2.2 asks it once and then strips
 * the parameter, so following up does not leave a stale question in the URL.
 */

/* Matched to TypedHeadline on Home 2.2, so the two surfaces type at one speed. */
const TYPE_MS = 52;
const ERASE_MS = 22;
const HOLD_MS = 1750;

/*
 * The placeholder, typing itself.
 *
 * It drives the `placeholder` attribute rather than rendering fake text over
 * the field. A real placeholder disappears the instant there is a value, is
 * read correctly by assistive tech, and cannot drift out of alignment with the
 * caret the way an absolutely positioned overlay does.
 *
 * It stops in three cases: the OS asks for reduced motion, the field has focus,
 * or the field has a value. The first is not optional. The second matters
 * because text moving under the caret while someone is deciding what to type is
 * a distraction; on focus it settles to a whole sentence instead. The third is
 * only economy — the placeholder is not visible then anyway.
 */
function useTypedPlaceholder(active) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [erasing, setErasing] = useState(false);
  const timer = useRef(null);

  const phrase = TYPED_PROMPTS[index];
  const running = active && !reduce;

  useEffect(() => {
    if (!running) return undefined;

    const step = () => {
      if (!erasing) {
        if (count < phrase.length) {
          setCount((c) => c + 1);
          timer.current = setTimeout(step, TYPE_MS);
        } else {
          timer.current = setTimeout(() => setErasing(true), HOLD_MS);
        }
      } else if (count > 0) {
        setCount((c) => c - 1);
        timer.current = setTimeout(step, ERASE_MS);
      } else {
        setErasing(false);
        setIndex((i) => (i + 1) % TYPED_PROMPTS.length);
      }
    };

    timer.current = setTimeout(step, erasing ? ERASE_MS : TYPE_MS);
    return () => clearTimeout(timer.current);
  }, [count, erasing, phrase.length, running]);

  /* Paused, or never animating: show the sentence whole rather than whatever
     fragment the timer happened to stop on. */
  return running ? phrase.slice(0, count) : phrase;
}

/* What a failed microphone says in the field. Codes come out of the hook so
   the copy can live with the surface showing it. */
const VOICE_ERRORS = {
  blocked: 'Microphone blocked — allow it in your browser to dictate',
  failed: 'Dictation is not available right now',
};

export default function HeroPrompt() {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const reduce = useReducedMotion();

  /* -------------------------------------------------------------- voice --- */

  /*
   * Dictation writes straight into the field, so cancelling has to be able to
   * put back whatever was there before it started — someone who half-typed a
   * question, tried the microphone and changed their mind should not lose the
   * half they typed.
   */
  const restoreRef = useRef('');

  const voice = useVoiceInput({
    onTranscript: setValue,
    onEnd: ({ cancelled }) => {
      if (cancelled) setValue(restoreRef.current);
      /* Focus lands back in the field either way. The words are in, and the
         next thing anyone wants is Enter — making them click the field first
         would be the one manual step in an otherwise hands-free path. */
      inputRef.current?.focus();
    },
  });

  const { listening } = voice;

  const toggleVoice = () => {
    if (listening) voice.stop();
    else {
      restoreRef.current = value;
      voice.start();
    }
  };

  /* Escape is the universal "undo this mode". It has to beat the browser's
     own handling of Escape in a text field, which is why it is on the form
     rather than the input. */
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && listening) {
      e.preventDefault();
      voice.cancel();
    }
  };

  /* The placeholder stops typing while dictating for the same reason it stops
     on focus — and because the field is behind the waveform anyway. */
  const placeholder = useTypedPlaceholder(!value && !focused && !listening);

  /*
   * The handover carries no theme.
   *
   * It used to write `neo` into storage and force the site to light, so asking
   * a question repainted the entire site in a design system the visitor had
   * not chosen — and left it that way afterwards, because the write persisted
   * and nothing ever put it back. Whatever they are reading the site in is
   * what they get on the far side.
   *
   * It is an ordinary push, so the chevron on the far side can simply walk the
   * history back to this page. See the back control in HomeV22.
   */
  const submit = (event) => {
    event.preventDefault();
    const text = value.trim();

    /* An empty submit goes to the surface rather than refusing: someone who
       pressed enter with nothing typed wants to get there, not be corrected. */
    navigate(text ? `/home-2.2?q=${encodeURIComponent(text)}` : '/home-2.2');
  };

  /* The crossfade between the field and the waveform. Short, and the same in
     both directions — this is a mode change, not an entrance, and a leisurely
     one would put a gap between the click and the microphone opening. */
  const swap = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: duration.quick, ease: ease.out },
  };

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="w-full">
      <label htmlFor="hero-ask" className="sr-only">
        Ask Amitesh about his work
      </label>

      {/* Edge and shadow come from the theme, so the ask box is a panel in
          whichever design system is running rather than a hairline box that
          only ever looked right in the site's own. */}
      <div
        className="flex items-center gap-2 rounded-2xl py-2 pl-4 pr-2 focus-within:border-[color:var(--site-accent)]"
        style={{
          background: 'var(--site-card)',
          /*
           * Dictating is a mode, and a mode the page can hear needs to look
           * different from one it cannot. Two states now share this edge —
           * focus takes the accent, listening takes aloha — and they are
           * different hues on purpose: a focused field and a recording one are
           * not the same claim, and on this page the accent is warm enough
           * that a second warm state would have been distinguishable only by
           * the waveform.
           */
          border: `var(--site-edge-width) solid ${
            listening ? 'var(--site-voice)' : 'var(--site-edge)'
          }`,
          boxShadow: 'var(--site-card-rest)',
          /* The repo's curve, not Tailwind's `transition-colors` default —
             that ships a bare 150ms `ease`, which is the one easing the house
             style does not use anywhere else. */
          transition: `border-color var(--motion-duration-brisk) var(--motion-ease-out)`,
        }}
      >
        {/*
          The field and the waveform occupy the same box rather than replacing
          each other in the flow. Two reasons: the row cannot change width when
          dictation starts, and the input stays mounted, so its label, its
          value and its focus all survive the mode. It is only made invisible
          and inert — unmounting it would drop focus to the body and hand the
          next Escape to the browser instead of to us.
        */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            id="hero-ask"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={voice.error ? VOICE_ERRORS[voice.error] : placeholder}
            autoComplete="off"
            readOnly={listening}
            /* Out of the tab order while the waveform is over it: a field you
               cannot see and cannot type into is not a stop worth landing on.
               It comes back the moment dictation ends, and `focus()` reaches it
               either way — that call happens after `listening` is already
               false. */
            tabIndex={listening ? -1 : undefined}
            className="min-w-0 flex-1 bg-transparent py-2 font-outfit text-[15px] outline-none transition-opacity placeholder:opacity-60 md:text-base"
            style={{
              color: 'var(--site-fg)',
              opacity: listening ? 0 : 1,
              transitionDuration: `${duration.quick}s`,
            }}
          />

          <AnimatePresence>
            {listening && (
              <motion.div {...swap} className="absolute inset-0 flex items-center">
                <VoiceBars analyserRef={voice.analyserRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/*
          The microphone is a secondary control and is dressed as one: no fill
          at rest, so the send button stays the only solid thing in the row and
          the eye still knows where the primary action is. It only appears
          where dictation actually exists — a microphone that does nothing in
          Firefox is worse than no microphone at all.
        */}
        {voice.supported && (
          <motion.button
            type="button"
            onClick={toggleVoice}
            whileHover={reduce ? undefined : { scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            aria-pressed={listening}
            aria-label={listening ? 'Stop dictation' : 'Dictate your question'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: listening
                ? 'color-mix(in oklab, var(--site-voice) 18%, transparent)'
                : 'transparent',
              color: listening ? 'var(--site-voice)' : 'var(--site-fg-2)',
              /* The focus ring stays on the accent. It is the site's focus
                 ring, shared with every other control, and repainting it here
                 would make this one button's focus mean something slightly
                 different from focus everywhere else. */
              outlineColor: 'var(--site-accent)',
              transition: `background-color var(--motion-duration-brisk) var(--motion-ease-out), color var(--motion-duration-brisk) var(--motion-ease-out)`,
            }}
          >
            <IconMic size={18} />
          </motion.button>
        )}

        <motion.button
          type="submit"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Ask"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors"
          style={{ background: 'var(--site-fg)', color: 'var(--site-bg)' }}
        >
          <IconSend size={17} />
        </motion.button>
      </div>

      {/*
        The spoken half of the same state. The waveform is the visual signal
        and is hidden from assistive tech; this is what replaces it, announced
        once as a whole sentence rather than as a stream of fragments.
      */}
      <span role="status" aria-atomic="true" className="sr-only">
        {voice.error
          ? VOICE_ERRORS[voice.error]
          : listening
            ? 'Listening. Press Escape to cancel.'
            : ''}
      </span>
    </form>
  );
}
