import { useCallback, useEffect, useRef } from 'react';

/*
 * A draggable, auto-scrolling carousel.
 *
 * Written to replace two byte-for-byte copies of this logic in About.jsx, which
 * had already drifted: only one of them seeded the scroll position for a
 * seamless reverse loop.
 *
 * Three things it fixes beyond the duplication:
 *
 *  - It runs on requestAnimationFrame rather than setInterval(fn, 20). The old
 *    pair produced a measured 100 scrollLeft writes per second, each followed by
 *    a scrollWidth/clientWidth read in the same tick, which forces synchronous
 *    layout twice per frame.
 *  - Those metrics are now cached and refreshed by a ResizeObserver, so the
 *    frame loop reads no layout at all.
 *  - It stops when the carousel is off screen, and never starts when the visitor
 *    has asked for reduced motion. CLAUDE.md section 4 makes the second one
 *    non-negotiable, and the old code had no handling for it.
 *
 * Drag bookkeeping lives in a ref rather than state on purpose. It used to be
 * six useState values, so every mousedown re-rendered the whole page component
 * to move a scroll offset nothing rendered from.
 */

/* Pixels per second. The old loop moved 1px every 20ms, so this preserves the
   speed while making it independent of frame rate. */
const SPEED = 50;
const FRICTION = 0.95;
const DRAG_MULTIPLIER = 2.5;

export default function useDragCarousel({ direction = 1 } = {}) {
  const ref = useRef(null);
  const s = useRef({
    dragging: false,
    paused: false,
    startX: 0,
    scrollLeft: 0,
    velocity: 0,
    lastX: 0,
    lastTime: 0,
    momentum: null,
    visible: false,
  });

  const applyMomentum = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    if (Math.abs(s.current.velocity) > 0.5) {
      el.scrollLeft -= s.current.velocity;
      s.current.velocity *= FRICTION;
      s.current.momentum = requestAnimationFrame(applyMomentum);
    } else {
      s.current.velocity = 0;
      if (s.current.momentum) cancelAnimationFrame(s.current.momentum);
      s.current.momentum = null;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    /* Captured once: this ref holds plain bookkeeping, not a DOM node, so the
       object identity is stable for the life of the component and the cleanup
       below is talking about the same state it set up. */
    const state = s.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* Measured once and on resize, so the frame loop below touches no layout. */
    let maxScroll = 0;
    let half = 0;
    const measure = () => {
      maxScroll = el.scrollWidth - el.clientWidth;
      half = el.scrollWidth / 2;
    };
    measure();

    /* Scrolling backwards has to start from the middle or the first frame is
       already at the boundary. Only the book carousel did this before. */
    if (direction < 0 && el.scrollLeft === 0) el.scrollLeft = half;

    let raf = null;
    let last = 0;

    const step = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      if (!state.paused && !state.dragging && !state.momentum) {
        el.scrollLeft += direction * SPEED * dt;
        if (direction > 0 && el.scrollLeft >= maxScroll) el.scrollLeft = 0;
        if (direction < 0 && el.scrollLeft <= 0) el.scrollLeft = half;
      }

      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (raf === null) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    };
    const stop = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };

    const sync = () => {
      if (state.visible && !reduced.matches) start();
      else stop();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        state.visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    io.observe(el);

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    reduced.addEventListener('change', sync);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      reduced.removeEventListener('change', sync);
      if (state.momentum) cancelAnimationFrame(state.momentum);
      state.momentum = null;
    };
  }, [direction]);

  const endDrag = useCallback(() => {
    const el = ref.current;
    if (!s.current.dragging) return;

    s.current.dragging = false;
    if (el) el.style.cursor = 'grab';
    if (Math.abs(s.current.velocity) > 1) applyMomentum();
  }, [applyMomentum]);

  const handlers = {
    onMouseEnter: () => {
      s.current.paused = true;
    },
    onMouseLeave: () => {
      s.current.paused = false;
      endDrag();
    },
    onMouseDown: (e) => {
      const el = ref.current;
      if (!el) return;

      s.current.dragging = true;
      s.current.paused = true;
      s.current.startX = e.pageX - el.offsetLeft;
      s.current.scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.scrollBehavior = 'auto';

      if (s.current.momentum) cancelAnimationFrame(s.current.momentum);
      s.current.momentum = null;
      s.current.velocity = 0;
      s.current.lastX = e.pageX;
      s.current.lastTime = Date.now();
    },
    onMouseMove: (e) => {
      const el = ref.current;
      if (!s.current.dragging || !el) return;
      e.preventDefault();

      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = s.current.scrollLeft - (x - s.current.startX) * DRAG_MULTIPLIER;

      const now = Date.now();
      const elapsed = now - s.current.lastTime;
      if (elapsed > 0) {
        /* Per-frame velocity, assuming ~16ms frames, which is what the momentum
           loop above consumes. */
        s.current.velocity = ((e.pageX - s.current.lastX) / elapsed) * 16;
      }
      s.current.lastX = e.pageX;
      s.current.lastTime = now;
    },
    onMouseUp: endDrag,
  };

  return { ref, handlers };
}
