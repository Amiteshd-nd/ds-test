import { useEffect, useRef, useState, useId } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  duration,
  ease,
} from '@cloud-march/motion/react';

/*
 * The four moments of a driver's day, as tabs rather than as four more screens
 * of scroll.
 *
 * v1 told this as a comic: two story panels, then the flow, four times over. The
 * story is good and it stays, but it was carrying the page, and a hiring manager
 * scanning for evidence of design work had to scroll past ~1,400px of narrative
 * art to reach the first product screen. Here the product leads and the story
 * frames sit under it at thumbnail size, where they read as what they are:
 * research artefacts, not the deliverable.
 *
 * Motion: one shared indicator that travels between tabs via layoutId, and a
 * panel crossfade. Both are doing orientation work, which is the bar for motion
 * on a control the reader will hit four or five times.
 */

export default function SceneTabs({ scenes }) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const tabsRef = useRef([]);
  const listRef = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const uid = useId();
  const scene = scenes[index];

  /*
   * Four tabs need about 390px and a phone gives the strip 327px, so it scrolls.
   * A scroll nobody can see is the same as content that does not exist, and the
   * scrollbar is hidden here on purpose because a visible one would sit across
   * the accent indicator. So the strip fades at whichever edge still has tabs
   * behind it. Measured rather than assumed, so this keeps working when the next
   * case study brings longer labels or a fifth scene.
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdge({ left: el.scrollLeft > 2, right: max > 2 && el.scrollLeft < max - 2 });
    };

    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [scenes.length]);

  // A tab chosen by keyboard or by a tap on a half visible one should bring
  // itself fully into the strip.
  const select = (i) => {
    setIndex(i);
    tabsRef.current[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onKeyDown = (e) => {
    const last = scenes.length - 1;
    let next = null;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabsRef.current[next]?.focus();
  };

  return (
    <div>
      <div className="relative">
        <div
          ref={listRef}
          role="tablist"
          aria-label="A shift, in four moments"
          onKeyDown={onKeyDown}
          className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-[var(--rule)]"
        >
        {scenes.map((s, i) => {
          const selected = i === index;
          return (
            <button
              key={s.id}
              ref={(el) => (tabsRef.current[i] = el)}
              role="tab"
              id={`${uid}-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${s.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              className="case-focus relative shrink-0 px-3 sm:px-4 py-3 text-left"
            >
              <span
                className="case-kicker block mb-1 text-[10px] transition-colors duration-[180ms]"
                style={{ color: selected ? 'var(--accent)' : 'var(--ink-3)' }}
              >
                {s.time}
              </span>
              <span
                className="block text-[14px] sm:text-[15px] leading-[1.25] tracking-[-0.015em] whitespace-nowrap transition-colors duration-[180ms]"
                style={{ color: selected ? 'var(--ink)' : 'var(--ink-3)' }}
              >
                {s.tab}
              </span>
              {selected && (
                <motion.span
                  layoutId={`${uid}-indicator`}
                  aria-hidden="true"
                  transition={reduced ? { duration: 0 } : { type: 'spring', visualDuration: 0.32, bounce: 0 }}
                  className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--accent)]"
                />
              )}
            </button>
          );
        })}
        </div>

        {/* Edge fades. Paper coloured so they read as the strip running under the
            margin rather than as a gradient someone chose. */}
        {['left', 'right'].map((side) => (
          <div
            key={side}
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 bottom-px w-10 transition-opacity duration-[180ms] ${
              side === 'left' ? 'left-0' : 'right-0'
            } ${edge[side] ? 'opacity-100' : 'opacity-0'}`}
            style={{
              background: `linear-gradient(to ${side}, transparent, var(--paper) 78%)`,
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={scene.id}
          role="tabpanel"
          id={`${uid}-panel-${scene.id}`}
          aria-labelledby={`${uid}-tab-${scene.id}`}
          tabIndex={0}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          /* The exit is deliberately smaller than the enter. The reader has
             already moved on to what is arriving. */
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(4px)' }}
          transition={{ duration: duration.brisk, ease: ease.out }}
          className="case-focus pt-8 sm:pt-10"
        >
          <div className="grid lg:grid-cols-[minmax(0,1fr)_236px] gap-8 lg:gap-12 items-start">
            <div>
              <h3 className="case-h3 mb-3">{scene.title}</h3>
              <p className="case-body">{scene.body}</p>

              {scene.detail && (
                <dl className="mt-7 grid sm:grid-cols-2 gap-x-8 gap-y-5">
                  {scene.detail.map((d) => (
                    <div key={d.label}>
                      <dt className="case-kicker mb-1.5">{d.label}</dt>
                      <dd className="case-body text-[14px]">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {scene.frames?.length > 0 && (
                <div className="mt-8">
                  <p className="case-kicker mb-3">Story frames from the research deck</p>
                  <div className="flex gap-2">
                    {scene.frames.map((f) => (
                      <img
                        key={f.src}
                        src={f.src}
                        alt={f.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-[56px] w-auto rounded-[5px] border border-[var(--rule)] object-cover opacity-70 hover:opacity-100 transition-opacity duration-[180ms]"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:sticky lg:top-24">{scene.media}</div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
