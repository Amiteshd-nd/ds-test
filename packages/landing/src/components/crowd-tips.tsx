'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The label that opens when a sticker is clicked: the building's name, a button
 * to copy it, and its place. One element for the whole crowd. It measures itself
 * after rendering and keeps inside the window: above the sticker when there is
 * room, below it otherwise, never past the side edges. Click the sticker again,
 * click anywhere else, or press Escape to close. While open, the sticker keeps
 * its hover state (`is-active`).
 *
 * The crowd is decorative for assistive tech (aria-hidden), so this is a pointer
 * and touch extra, not a second navigation.
 */
type Tip = { id: number; name: string; place: string; anchor: DOMRect };

const GAP = 10;
const EDGE = 8;

export function CrowdTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: 'above' | 'below' } | null>(null);
  const [copied, setCopied] = useState(false);
  const active = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clear = () => {
      active.current?.classList.remove('is-active');
      active.current = null;
      setTip(null);
      setPos(null);
      setCopied(false);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.crowd-tip')) return;
      const sticker = target.closest<HTMLElement>('.sticker');
      if (!sticker || sticker === active.current) {
        clear();
        return;
      }
      active.current?.classList.remove('is-active');
      active.current = sticker;
      sticker.classList.add('is-active');
      setCopied(false);
      setTip({
        id: Date.now(),
        name: sticker.dataset.name ?? '',
        place: sticker.dataset.place ?? '',
        anchor: sticker.getBoundingClientRect(),
      });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', clear);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', clear);
    };
  }, []);

  // Place the label once its size is known, inside the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    const a = tip.anchor;
    // The drawn sticker sits a little inside its box.
    const drawnTop = a.top + a.height * 0.08;
    const drawnBottom = a.bottom - a.height * 0.08;
    const side: 'above' | 'below' = drawnTop - GAP - height >= EDGE ? 'above' : 'below';
    const top = side === 'above' ? drawnTop - GAP - height : Math.min(drawnBottom + GAP, window.innerHeight - EDGE - height);
    const left = Math.min(Math.max(a.left + a.width / 2 - width / 2, EDGE), window.innerWidth - EDGE - width);
    setPos({ left, top, side });
  }, [tip]);

  if (!tip) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tip.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: nothing to do, the name is right there to select.
    }
  };

  return (
    <div
      ref={box}
      className="crowd-tip"
      role="tooltip"
      key={tip.id}
      data-side={pos?.side ?? 'above'}
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <span className="crowd-tip-text">
        <span className="crowd-tip-name">
          <strong>{tip.name}</strong>
          <button type="button" className="crowd-tip-copy" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${tip.name}`}>
            {copied ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
                <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
              </svg>
            )}
          </button>
        </span>
        <span className="crowd-tip-place">{tip.place}</span>
      </span>
    </div>
  );
}
