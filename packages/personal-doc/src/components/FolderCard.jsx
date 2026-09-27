import { useEffect, useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  duration,
  ease,
  tokens,
} from '@cloud-march/motion/react';
import { Link } from 'react-router-dom';
import ReactGA from 'react-ga4';
import ProjectMark from './ProjectMark';
import './folder-card.css';

/* Hoisted: building this inside the component would hand React a brand new
   component type on every render and remount the card each time. */
const MotionLink = motion.create(Link);

/* Run of the tab's diagonal as a fraction of its height. 0.75 puts the slope
   near 53 degrees off horizontal — shallow enough to read as a cut edge rather
   than a corner, steep enough not to eat the artwork beside it. */
const SLANT_RATIO = 0.75;

/* Radius of the two turnings: the convex one where the tab's top edge rolls
   into the slope, and the concave one where the slope lands on the sheet. */
const TURN_RADIUS = 18;

/* Outer corner of the tab's free left edge. Matches `--fc-corner`. */
const CORNER = 5;

/*
 * The pointer rig's follow curve.
 *
 * `firm` rather than `soft`: a bouncy spring on a cursor-tracked value keeps
 * moving after the cursor has stopped, which reads as lag rather than as life.
 * No bounce, and short enough that the art feels attached to the hand.
 */
const FOLLOW = tokens.spring.firm;

/* The glow's own curve is slower than the follow: brightness arriving a beat
   after the position is what makes it read as light rather than as a sprite. */
const GLOW = { ...tokens.spring.soft, bounce: 0 };

const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

/*
 * The tab's outline, slant included, as an SVG path in the tab's own pixels.
 *
 * Both turnings are arcs tangent to the slope, so neither radius can be taken
 * straight from CSS: a circle inscribed in an angle touches each edge at
 * `r / tan(angle / 2)` from the vertex, and that reach is what decides where
 * the straight segments have to stop. The two turnings share an angle — the
 * slope cuts the top edge and the sheet line at supplementary angles — so one
 * calculation serves both, mirrored.
 */
function tabClipPath(w, h) {
  const slant = h * SLANT_RATIO;
  const len = Math.hypot(slant, h);
  const ux = slant / len;
  const uy = h / len;

  // Interior angle where the slope meets the horizontal, at either end.
  const reach = TURN_RADIUS / Math.tan(Math.acos(-ux) / 2);

  const footX = w - reach; // where the slope lands on the sheet line
  const headX = footX - slant; // where it leaves the top edge

  // Not enough width to seat the shape — let the caller fall back.
  if (headX - reach < CORNER) return null;

  const n = (v) => v.toFixed(2);
  return [
    `M ${n(CORNER)},0`,
    `L ${n(headX - reach)},0`,
    `A ${TURN_RADIUS},${TURN_RADIUS} 0 0 1 ${n(headX + ux * reach)},${n(uy * reach)}`,
    `L ${n(footX - ux * reach)},${n(h - uy * reach)}`,
    `A ${TURN_RADIUS},${TURN_RADIUS} 0 0 0 ${n(w)},${n(h)}`,
    `L 0,${n(h)}`,
    `L 0,${n(CORNER)}`,
    `A ${CORNER},${CORNER} 0 0 1 ${n(CORNER)},0`,
    'Z',
  ].join(' ');
}

/*
 * One project, as a card.
 *
 * `stat` and `note` are the two numbers on the bottom edge. They are the reason
 * this shape is worth the trouble: a recruiter scanning the list gets the
 * outcome and the reading time without opening anything.
 */

export default function FolderCard({
  title,
  eyebrow,
  subtitle,
  description,
  stat,
  statLabel,
  note,
  palette,
  link,
  locked = false,
  index = 0,
  variant = 'row',
}) {
  const reduced = useReducedMotion();
  const tabRef = useRef(null);
  const isExternal = link.startsWith('http');

  /*
   * The diagonal's horizontal run is a ratio of the tab's height, so every card
   * slopes at the same angle no matter how tall its tab is. The rise is content
   * driven — a title that wraps to two lines makes a taller tab — and CSS cannot
   * express "a fraction of my own height", so it is measured.
   *
   * The slant and the turn reach feed the tab's right padding, which changes its
   * width, which feeds back here. That settles rather than oscillates: the tab
   * sizes to `max-content`, so the height the geometry derives from never moves.
   */
  useEffect(() => {
    const el = tabRef.current;
    if (!el) return;

    const sync = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (!w || !h) return;

      const card = el.closest('.fc');
      if (!card) return;

      const slant = h * SLANT_RATIO;
      const reach = TURN_RADIUS / Math.tan(Math.acos(-slant / Math.hypot(slant, h)) / 2);

      card.style.setProperty('--fc-slant', `${slant.toFixed(1)}px`);
      card.style.setProperty('--fc-turn-run', `${reach.toFixed(1)}px`);

      const path = tabClipPath(w, h);
      card.style.setProperty('--fc-tab-clip', path ? `path('${path}')` : 'none');
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const isDead = link === '#';

  /* ------------------------------------------------------------- pointer --- */

  /*
   * Hover hands the card its light source.
   *
   * The artwork is a long-exposure smear, so the honest interactive reading is
   * that the exposure is lit from wherever the cursor is: a highlight tracks
   * the pointer across the art, the art itself drifts *against* the pointer,
   * and the card face tips a couple of degrees so the two layers separate. The
   * sheet does not move — it is the paper, and paper that slides with the
   * cursor turns the whole card into a parallax toy.
   *
   * `px` / `py` are the cursor's position in the card, normalised to -1..1 from
   * the centre. They are motion values rather than state: this runs at pointer
   * rate, and a `setState` per move would re-render eleven cards' worth of SVG
   * for a number that only ever lands in a CSS variable.
   */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const hot = useMotionValue(0);

  const sx = useSpring(px, FOLLOW);
  const sy = useSpring(py, FOLLOW);
  const sHot = useSpring(hot, GLOW);

  /* Read once on entry rather than on every move: `getBoundingClientRect`
     inside a pointermove handler forces a layout flush of the whole document,
     sixty times a second, on a page carrying eleven filtered SVGs. The cache
     only goes stale if the page scrolls while the cursor holds still inside
     the card, and the cost of that is a few pixels of offset. */
  const rectRef = useRef(null);

  /* Coarse pointers get nothing: a touch "hover" is a tap on its way to a
     navigation, and lighting the card on the way out is noise. Reduced motion
     gets nothing either — this is travel, and travel is what was opted out
     of. Both leave the variables at 0, which is the card at rest. */
  const track = (e) => {
    if (reduced || e.pointerType === 'touch') return;
    const r = rectRef.current || e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    px.set(clamp(((e.clientX - r.left) / r.width) * 2 - 1));
    py.set(clamp(((e.clientY - r.top) / r.height) * 2 - 1));
  };

  const pointer = {
    style: { '--fc-px': sx, '--fc-py': sy, '--fc-hot': sHot },
    onPointerEnter: (e) => {
      if (reduced || e.pointerType === 'touch') return;
      rectRef.current = e.currentTarget.getBoundingClientRect();
      track(e);
      hot.set(1);
    },
    onPointerMove: track,
    /* `pointerleave` and not `pointerout`: the latter fires on every crossing
       into a child, and the card is nothing but children. */
    onPointerLeave: () => {
      rectRef.current = null;
      px.set(0);
      py.set(0);
      hot.set(0);
    },
  };

  const onClick = () =>
    ReactGA.event({ category: 'Projects', action: 'Click', label: title });

  /*
   * The entrance resolves a 4px blur, and that blur must not be left behind.
   * Framer writes the final value inline, so every card would sit behind a
   * permanent `filter: blur(0px)` for the rest of the session.
   *
   * A filter — even a zero-radius one — renders the whole subtree into a buffer,
   * and that buffer is not regenerated as the artwork's own gradient animation
   * runs. The mark animated correctly in computed style and never repainted a
   * pixel. Same trap `design-system.md` §4cc records from the theme side: a
   * filter is a containing block, and it has teeth.
   *
   * The inline property is cleared on the element rather than animated to
   * `none`, because the entrance runs under `viewport: { once: true }` — once
   * it has fired, changing its target does not make it run again. Clearing the
   * style is the only thing that actually removes the filter.
   */
  const cardRef = useRef(null);

  const clearEntranceFilter = () => {
    if (cardRef.current) cardRef.current.style.filter = '';
  };

  const enter = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(4px)' },
    whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
    onAnimationComplete: clearEntranceFilter,
    viewport: { once: true, margin: '0px 0px -10% 0px' },
    transition: { duration: duration.gentle, ease: ease.out, delay: Math.min(index, 6) * 0.05 },
  };

  /*
   * Where the eyebrow goes depends on how much art there is to put it on. A row
   * card has a wide clear band top-right. A square tile does not: a title that
   * wraps to two lines pushes the tab up into exactly that space, so on tiles the
   * eyebrow moves inside the sheet and keeps only its first line, the client.
   */
  const isTile = variant === 'tile';
  const eyebrowLines = eyebrow ? eyebrow.split('\n') : [];

  const body = (
    <div className="fc-inner">
      <ProjectMark palette={palette} seed={title} className="fc-art" />
      {/* The cursor's light. Sits above the art and below the sheet, so it
          lifts the exposure without washing out the title. */}
      <span className="fc-sheen" aria-hidden="true" />
      {eyebrow && !isTile && <p className="fc-eyebrow">{eyebrow}</p>}

      <div className="fc-sheet">
        <div className="fc-tab" ref={tabRef}>
          {eyebrow && isTile && <p className="fc-kicker">{eyebrowLines[0]}</p>}
          <h3 className="fc-title">{title}</h3>
          {subtitle && <p className="fc-sub">{subtitle}</p>}
        </div>

        {description && <p className="fc-body">{description}</p>}

        <div className="fc-meta">
          <p className="fc-stat">
            {stat}
            {statLabel && <span>{statLabel}</span>}
          </p>
          {/* The lock rides with the reading time rather than on the artwork:
              it is the same kind of fact — what opening this will cost you —
              and the art already carries the eyebrow on row cards. */}
          {note && (
            <p className="fc-note">
              {locked && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="fc-lock"
                  role="img"
                  aria-label="Passphrase required"
                >
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
                  <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                </svg>
              )}
              {note}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const className = `fc ${variant === 'row' ? 'fc--row' : ''}`;

  if (isDead) {
    return (
      <motion.div
        ref={cardRef}
        {...enter}
        {...pointer}
        className={className}
        aria-disabled="true"
      >
        {body}
      </motion.div>
    );
  }

  if (isExternal) {
    return (
      <motion.a
        ref={cardRef}
        {...enter}
        {...pointer}
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
      >
        {body}
      </motion.a>
    );
  }

  return (
    <MotionLink
      ref={cardRef}
      {...enter}
      {...pointer}
      to={link}
      onClick={onClick}
      className={className}
    >
      {body}
    </MotionLink>
  );
}
