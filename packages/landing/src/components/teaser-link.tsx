'use client';

import { useEffect, useRef, useState } from 'react';

import type { content } from '@/content';

type Copy = (typeof content)['teaser'];

/** How long the pointer rests on the link before the preview card shows, and before it plays. */
const SHOW_AFTER = 120;
const PLAY_AFTER = 900;

type Preview = 'hidden' | 'thumb' | 'play';

/**
 * A text link that opens the teaser in a native <dialog>. Used by iteration 2,
 * where the video has no frame of its own. Without JavaScript the link goes
 * straight to the video file.
 *
 * Hovering shows a small preview card above the link with the poster frame; a
 * longer hover plays the film inside it, muted and looping. Leaving pauses and
 * rewinds it. Only for a real hover pointer (touch screens have none), and the
 * card never plays under reduced motion.
 */
export function TeaserLink({ copy, className }: { copy: Copy; className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<number[]>([]);
  const [preview, setPreview] = useState<Preview>('hidden');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      // load() rather than currentTime = 0: it returns to the poster and works
      // on files with no seek index.
      video.load();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Play or stop the preview as its state changes.
  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    if (preview === 'play') {
      video.play().catch(() => setPreview('thumb'));
    } else {
      video.pause();
      if (preview === 'hidden') {
        video.currentTime = 0;
        setProgress(0);
      }
    }
  }, [preview]);

  function startPreview() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timers.current.forEach(clearTimeout);
    timers.current = [window.setTimeout(() => setPreview('thumb'), SHOW_AFTER)];
    if (!reduced) timers.current.push(window.setTimeout(() => setPreview('play'), SHOW_AFTER + PLAY_AFTER));
  }

  function stopPreview() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPreview('hidden');
  }

  function open(event: React.MouseEvent) {
    stopPreview();
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') return; // let the link work
    event.preventDefault();
    dialog.showModal();
    videoRef.current?.play().catch(() => {});
  }

  return (
    <>
      <span className="teaser-anchor">
        <a
          href={copy.src}
          onClick={open}
          onPointerEnter={startPreview}
          onPointerLeave={stopPreview}
          aria-haspopup="dialog"
          className={className}
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.75" />
            <path d="M6.5 5.5v5l4-2.5z" fill="currentColor" stroke="none" />
          </svg>
          <span>{copy.label}</span>
          <span className="tabular-nums opacity-60">{copy.duration}</span>
        </a>

        {/* The hover preview. Decorative: the link itself says what it does. */}
        <span className="teaser-preview" data-state={preview} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={copy.poster} alt="" />
          <video
            ref={previewRef}
            muted
            loop
            playsInline
            preload="none"
            poster={copy.poster}
            tabIndex={-1}
            onTimeUpdate={(event) => {
              const v = event.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
          >
            <source src={copy.src} type={copy.type} />
          </video>
          <span className="teaser-preview-chip">{preview === 'play' ? 'Preview' : copy.duration}</span>
          <span className="teaser-preview-bar" style={{ transform: `scaleX(${progress})` }} />
        </span>
      </span>

      <dialog
        ref={dialogRef}
        aria-label={copy.dialogTitle}
        className="teaser-dialog m-auto w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="paper rounded-lg p-2 sm:p-3">
          <video
            ref={videoRef}
            controls
            playsInline
            preload="none"
            poster={copy.poster}
            className="block aspect-video max-h-[calc(100dvh-8rem)] w-full rounded-md bg-black"
          >
            <source src={copy.src} type={copy.type} />
          </video>
          <div className="mt-3 flex items-center justify-between gap-4 px-2 pb-1">
            <p className="font-serif text-xl leading-none">{copy.dialogTitle}</p>
            <form method="dialog">
              <button type="submit" className="pill-button h-10 gap-2 px-4 text-(length:--text-small)">
                <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
                {copy.close}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
