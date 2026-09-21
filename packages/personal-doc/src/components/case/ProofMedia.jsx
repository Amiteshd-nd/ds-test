import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@cloud-march/motion/react';
import LazyImage from '../LazyImage';

/*
 * A screen recording of the real product, with a pause control.
 *
 * An autoplaying loop is a continuous animation, and the accessibility rule for
 * those is not "add prefers-reduced-motion and move on" but "the user can stop
 * it". So: reduced motion never starts one, everyone gets a real toggle, and the
 * toggle is visible whenever the clip is not playing rather than hiding behind a
 * hover the reader has no reason to try.
 *
 * Playback is driven by an IntersectionObserver rather than the `autoplay`
 * attribute. Chromium starts a muted autoplaying video, notices it is offscreen,
 * pauses it about a second in, and does not reliably resume it later, which
 * leaves a blank box exactly where the evidence is supposed to be. Observing
 * visibility ourselves is also the honest behaviour: only the clip the reader is
 * looking at is decoding, and four 8MB recordings never run at once.
 *
 * A pause the reader asked for outranks the observer. `userPaused` is a ref and
 * not state because nothing renders from it and a re-render would restart the
 * effect that owns the observer.
 */

export function ProofVideo({ src, label, caption, aspect = '9 / 19.5', className = '' }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const userPaused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => setPlaying(!el.paused);
    el.addEventListener('play', sync);
    el.addEventListener('pause', sync);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reduced && !userPaused.current) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      el.removeEventListener('play', sync);
      el.removeEventListener('pause', sync);
    };
  }, [reduced]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      userPaused.current = false;
      el.play().catch(() => {});
    } else {
      userPaused.current = true;
      el.pause();
    }
  };

  return (
    <figure className={`flex flex-col ${className}`}>
      <div className="case-figure relative group" style={{ aspectRatio: aspect }}>
        <video
          ref={ref}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={label}
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className={`case-focus absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-[rgba(22,24,29,0.78)] text-white grid place-items-center transition-opacity duration-[180ms] focus-visible:opacity-100 ${
            playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          <span className="sr-only">{playing ? `Pause ${label}` : `Play ${label}`}</span>
          {playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
              <rect width="3" height="12" fill="currentColor" />
              <rect x="7" width="3" height="12" fill="currentColor" />
            </svg>
          ) : (
            /* Optically nudged right: a triangle's visual centre sits left of
               its bounding box centre. */
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" className="translate-x-[1px]">
              <path d="M0 0l10 6-10 6z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
      {caption && <figcaption className="case-caption mt-2.5">{caption}</figcaption>}
    </figure>
  );
}

export function ProofShot({ src, alt, caption, aspect, contain = false, className = '' }) {
  return (
    <figure className={`flex flex-col ${className}`}>
      <div className="case-figure" style={aspect ? { aspectRatio: aspect } : undefined}>
        <LazyImage
          src={src}
          alt={alt}
          className="w-full h-full"
          objectFit={contain ? 'contain' : 'cover'}
        />
      </div>
      {caption && <figcaption className="case-caption mt-2.5">{caption}</figcaption>}
    </figure>
  );
}
