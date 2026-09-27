import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@cloud-march/motion/react';

/*
 * What the microphone is hearing, as a row of bars.
 *
 * The shape on screen is the last second and a half of your voice, not the
 * current loudness repeated sixty times. Each frame's level is pushed onto a
 * ring buffer and the whole buffer is drawn, so the wave travels leftward as
 * you speak and a word you have already said stays legible behind the one you
 * are saying. A bank of bars that all rise and fall together is a single meter
 * wearing a costume, and it reads as decoration the moment you notice it.
 *
 * Nothing here is a loop. Every bar's height is a measurement — silence is
 * flat, and it should be. That is also why this survives reduced motion rather
 * than being switched off: it is the only thing on screen that distinguishes
 * "listening" from "listening to a microphone that is muted". What reduced
 * motion gets is a smaller amplitude and a slower settle, not a still picture.
 */

/* Bar and gap in px. The pitch decides how many bars fit, and 7px is about
   where a row stops reading as a handful of tally marks and starts reading as
   a waveform. */
const BAR_W = 3;
const GAP = 4;

/* Silence is a line of dashes, not an empty box: zero-height bars look like a
   component that failed to render. */
const REST = 0.14;

/* How often the buffer advances, in ms. At one push per frame the wave scrolls
   too fast to read; at 55ms a bar is roughly a syllable's worth of sound. */
const PUSH_MS = 55;

/* Below this RMS is room tone, and a meter that responds to room tone is a
   meter that is always half full. */
const NOISE = 0.008;

/* The auto-gain floor and its decay. Microphones differ by more than an order
   of magnitude — a headset and a laptop array will not fill the same meter at
   the same voice — so the display normalises against a running peak instead of
   an absolute level. The floor stops a quiet room from amplifying itself into
   a full-scale display of nothing. */
const PEAK_FLOOR = 0.06;
const PEAK_DECAY = 0.995;

/* `getByteTimeDomainData` wants a buffer the size of the analyser's `fftSize`,
   which the hook sets to 1024. Allocated once at twice that and sliced to fit,
   rather than per frame: a 1KB array sixty times a second is a garbage
   collector's alarm clock. */
const FFT_BINS = 2048;

export default function VoiceBars({ analyserRef, className = '' }) {
  const reduce = useReducedMotion();
  const wrapRef = useRef(null);
  const barsRef = useRef([]);
  const [count, setCount] = useState(24);

  /* The bar count follows the width rather than being a constant, so the
     waveform is the same density in a 560px hero and a 320px phone instead of
     being dense in one and sparse in the other. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (!w) return;
      setCount(Math.max(8, Math.min(96, Math.floor((w + GAP) / (BAR_W + GAP)))));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const bars = barsRef.current;
    if (!count) return undefined;

    /* `hist` is what the buffer says, `shown` is where the bars actually are.
       Keeping them apart is what lets the row settle rather than snap: every
       frame each bar closes part of the distance to its target, so a shift of
       the whole buffer arrives as a slide instead of a jump. */
    const hist = new Float32Array(count).fill(REST);
    const shown = new Float32Array(count).fill(REST);
    const samples = new Uint8Array(FFT_BINS);

    /* Reduced motion keeps the meter and loses the drama: under half the
       travel, and a settle slow enough that nothing in the row snaps. */
    const range = reduce ? 0.42 : 1;
    const lerp = reduce ? 0.14 : 0.32;

    let peak = PEAK_FLOOR;
    let lastPush = 0;
    let raf = 0;

    const frame = (now) => {
      let level = REST;
      const analyser = analyserRef.current;

      if (analyser) {
        const buf = samples.subarray(0, analyser.fftSize);
        analyser.getByteTimeDomainData(buf);

        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);

        peak = Math.max(rms, peak * PEAK_DECAY, PEAK_FLOOR);
        const norm = Math.max(0, (rms - NOISE) / (peak - NOISE));
        /* A gamma below 1 lifts the quiet end. Speech spends most of its time
           well under its own peak, and a linear meter renders all of that as
           a flat line with the occasional spike. */
        level = REST + (1 - REST) * range * Math.min(1, norm) ** 0.65;
      }

      if (now - lastPush >= PUSH_MS) {
        lastPush = now;
        hist.copyWithin(0, 1);
        hist[count - 1] = level;
      } else {
        /* Peak-hold on the newest bar between pushes, so a consonant that
           lands mid-interval is not averaged out of existence. */
        hist[count - 1] = Math.max(hist[count - 1], level);
      }

      for (let i = 0; i < count; i += 1) {
        shown[i] += (hist[i] - shown[i]) * lerp;
        const el = bars[i];
        if (el) el.style.transform = `scaleY(${shown[i].toFixed(3)})`;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, count, reduce]);

  return (
    <div
      ref={wrapRef}
      /* Decorative to assistive tech: it carries no information a screen
         reader can use, and the surface around it owns the spoken status. */
      aria-hidden="true"
      className={`pointer-events-none flex h-5 w-full items-center ${className}`}
      /* Aloha rather than the site accent: this is a live microphone, not a
         focused field, and on a page whose accent is already warm the two were
         only telling apart by shape. See --site-voice in index.css. */
      style={{ gap: `${GAP}px`, color: 'var(--site-voice)' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full rounded-full"
          style={{
            width: `${BAR_W}px`,
            background: 'currentColor',
            transformOrigin: 'center',
            transform: `scaleY(${REST})`,
          }}
        />
      ))}
    </div>
  );
}
