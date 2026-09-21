import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, duration, ease } from '@cloud-march/motion/react';
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

  const onClick = () =>
    ReactGA.event({ category: 'Projects', action: 'Click', label: title });

  const enter = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(4px)' },
    whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
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
          {note && <p className="fc-note">{note}</p>}
        </div>
      </div>
    </div>
  );

  const className = `fc ${variant === 'row' ? 'fc--row' : ''}`;

  if (isDead) {
    return (
      <motion.div {...enter} className={className} aria-disabled="true">
        {body}
      </motion.div>
    );
  }

  if (isExternal) {
    return (
      <motion.a
        {...enter}
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
    <MotionLink {...enter} to={link} onClick={onClick} className={className}>
      {body}
    </MotionLink>
  );
}
