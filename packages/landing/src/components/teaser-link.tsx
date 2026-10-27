'use client';

import { useEffect, useRef } from 'react';

import type { content } from '@/content';

type Copy = (typeof content)['teaser'];

/**
 * A text link that opens the teaser in a native <dialog>. Used by iteration 2,
 * where the video has no frame of its own. Without JavaScript the link goes
 * straight to the video file.
 */
export function TeaserLink({ copy, className }: { copy: Copy; className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    videoRef.current?.play().catch(() => {});
  }

  return (
    <>
      <a href={copy.src} onClick={open} aria-haspopup="dialog" className={className}>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6.75" />
          <path d="M6.5 5.5v5l4-2.5z" fill="currentColor" stroke="none" />
        </svg>
        <span>{copy.label}</span>
        <span className="tabular-nums opacity-60">{copy.duration}</span>
      </a>

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
