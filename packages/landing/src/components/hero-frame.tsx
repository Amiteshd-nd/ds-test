'use client';

import Image, { type StaticImageData } from 'next/image';
import { useEffect, useRef } from 'react';

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from '@cloud-march/motion/react';

import type { content } from '@/content';

type Copy = (typeof content)['teaser'];

/**
 * The framed render, which is also the teaser thumbnail.
 *
 * Pointer over the frame tilts it a few degrees toward the cursor and slides a
 * sheen across the glass, both on springs. Click opens the teaser in a native
 * <dialog>. Without JavaScript the frame is a plain link to the video file.
 */
export function HeroFrame({
  image,
  alt,
  copy,
  className,
}: {
  image: StaticImageData;
  alt: string;
  copy: Copy;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // -0.5..0.5 across the frame, in both axes.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 120, damping: 18, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);
  const rotateY = useMotionTemplate`${sx}deg`;
  const rotateX = useMotionTemplate`${sy}deg`;
  const mx = useMotionTemplate`calc(50% + ${sx} * 8%)`;
  const my = useMotionTemplate`calc(50% + ${sy} * -8%)`;

  function track(event: React.PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const r = event.currentTarget.getBoundingClientRect();
    // Up to 6 degrees each way. More looks like a card trick.
    px.set(((event.clientX - r.left) / r.width - 0.5) * 12);
    py.set(((event.clientY - r.top) / r.height - 0.5) * -12);
  }

  function rest() {
    px.set(0);
    py.set(0);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      // load() rather than currentTime = 0: it returns to the poster and works
      // on files with no seek index, which a quick webm export may lack.
      video.load();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  function open(event: React.MouseEvent) {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') return; // let the link work
    event.preventDefault();
    dialog.showModal();
    // The click is the user gesture, so playing with sound is allowed.
    videoRef.current?.play().catch(() => {});
  }

  return (
    <>
      <div className={className} style={{ perspective: '1200px' }}>
        <motion.a
          href={copy.src}
          onClick={open}
          onPointerMove={track}
          onPointerLeave={rest}
          aria-haspopup="dialog"
          className="frame frame-link group block h-full w-full cursor-pointer p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:p-2.5"
          style={{
            rotateX,
            rotateY,
            // Read by the sheen and rim gradients in globals.css.
            ['--mx' as string]: mx,
            ['--my' as string]: my,
          }}
        >
          <span className="relative block h-full w-full overflow-hidden bg-ground">
            {/* Decorative inside the link; the render is described after the label, where
                it does not fight the link's visible name. */}
            <Image
              src={image}
              alt=""
              fill
              priority
              fetchPriority="high"
              placeholder="blur"
              sizes="(max-width: 1024px) 90vw, 50vw"
              className="object-cover"
            />
            {/* Keeps the pale render from blowing out the dark page; also gives the badge something to sit on. */}
            <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/45 via-transparent to-transparent" />
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <PlayBadge />
            </span>

            {/* Title block, like the corner of a drawing sheet. */}
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 font-mono text-(length:--text-mono) tracking-wide text-ink uppercase sm:p-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-ink-dim">{copy.caption}</span>
                <span>{copy.label}</span>
              </span>
              <span className="tabular-nums">{copy.duration}</span>
            </span>
            <span className="sr-only">{alt}</span>

            {copy.isPlaceholder && (
              <span className="absolute top-3 left-3 border border-white/30 bg-black/55 px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wider text-ink uppercase backdrop-blur-sm sm:top-4 sm:left-4">
                {copy.placeholderTag}
              </span>
            )}
          </span>

          <span aria-hidden className="frame-sheen" />
          <span aria-hidden className="frame-edge" />
          <span aria-hidden className="frame-tick frame-tick-tl" />
          <span aria-hidden className="frame-tick frame-tick-tr" />
          <span aria-hidden className="frame-tick frame-tick-bl" />
          <span aria-hidden className="frame-tick frame-tick-br" />
        </motion.a>
      </div>

      {/* Landscape phones: the frame is hidden and this stands in for it. */}
      <a
        href={copy.src}
        onClick={open}
        aria-haspopup="dialog"
        className="glass-field hidden h-9 cursor-pointer items-center gap-2 rounded-(--radius) px-3 font-mono text-(length:--text-mono) tracking-wide text-ink uppercase short:inline-flex"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3" fill="currentColor">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
        {copy.label}
        <span className="text-ink-dim tabular-nums">{copy.duration}</span>
      </a>

      <dialog
        ref={dialogRef}
        aria-label={copy.dialogTitle}
        className="teaser-dialog m-auto w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0"
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="frame p-2 sm:p-2.5">
          <video
            ref={videoRef}
            controls
            playsInline
            preload="none"
            poster={copy.poster}
            className="block aspect-video max-h-[calc(100dvh-7rem)] w-full bg-black"
          >
            <source src={copy.src} type={copy.type} />
          </video>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="font-serif text-xl leading-none text-ink">{copy.dialogTitle}</p>
          <form method="dialog">
            <button
              type="submit"
              className="chrome-button inline-flex h-(--control-height) items-center gap-2 px-4 text-(length:--text-small) font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
              {copy.close}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

/** A scalloped play badge in chrome, with a black triangle. */
function PlayBadge() {
  const points = 12;
  const outer = 30;
  const inner = 25.5;
  const d =
    Array.from({ length: points * 2 }, (_, i) => {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI * i) / points - Math.PI / 2;
      return `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
    })
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`)
      .join(' ') + 'Z';

  return (
    <svg viewBox="0 0 64 64" className="frame-badge size-14 drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)] sm:size-16">
      <defs>
        <linearGradient id="badge-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#dcdedb" />
          <stop offset="0.5" stopColor="#b7bab5" />
          <stop offset="1" stopColor="#eceeea" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#badge-chrome)" stroke="url(#badge-chrome)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M27.5 22.5v19l15-9.5z" fill="#0e0f10" />
    </svg>
  );
}
