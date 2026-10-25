import { useEffect, useRef, useState } from 'react';

/*
 * A working prototype, framed on the page.
 *
 * The prototypes are single-file builds of 1 to 15MB, each a full workbench:
 * a control rail, the device in the middle, an inspector on the right. Two
 * things follow from that.
 *
 * The frame loads on its own, but lazily: the browser fetches it as it nears
 * the viewport, so a reader who never scrolls that far never pulls the 1 to
 * 15MB. Until the document is ready, a placeholder holds its place.
 *
 * The workbench is laid out for a desktop window, so it renders at its own
 * viewport and is scaled to the column, rather than squeezed into 680px and
 * reflowed into something nobody designed. Hit testing follows the transform,
 * so the scaled copy stays fully interactive. Below about 900px it is too small
 * to use, which is why "open full screen" sits beside it at every width.
 */

function IconExternal() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M4.5 2.5h-2v7h7v-2M7 2.5h2.5V5M9.5 2.5 5.5 6.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PrototypeEmbed({
  src,
  title,
  weight,
  caption,
  viewport = [1440, 900],
  className = '',
}) {
  const [vw, vh] = viewport;
  const frame = useRef(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / vw));
    ro.observe(el);
    return () => ro.disconnect();
  }, [vw]);

  return (
    <figure className={`flex flex-col ${className}`}>
      <div
        ref={frame}
        className="case-figure relative"
        style={{ aspectRatio: `${vw} / ${vh}` }}
      >
        <iframe
          src={src}
          title={title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="case-embed absolute top-0 left-0 border-0 bg-white"
          data-loaded={loaded || undefined}
          style={{
            width: vw,
            height: vh,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        />

        {!loaded && (
          <div className="absolute inset-0 grid place-items-center p-5 text-center">
            <div className="flex flex-col items-center">
              <p className="case-kicker mb-2">Interactive prototype</p>
              <p className="case-h3 max-w-[26ch]">{title}</p>
              <p className="case-caption mt-3">Loading{weight ? `, ${weight}` : ''}…</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        {caption && <figcaption className="case-caption max-w-[62ch]">{caption}</figcaption>}
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="case-link case-link--out case-focus case-caption inline-flex items-center gap-1.5 shrink-0"
        >
          Open full screen
          <IconExternal />
        </a>
      </div>
    </figure>
  );
}
