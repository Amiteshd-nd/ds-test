import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useSpring, useReducedMotion } from '@cloud-march/motion/react';
import './case.css';

/*
 * The frame every 2.0 case study sits in: a nav that stays put, a reading
 * progress hairline, and a footer that hands the reader the next thing.
 *
 * The v1 ProjectNav hides itself on scroll down. That is a phone pattern, and on
 * a long read it costs the reader the one control they want at all times, so
 * this one does not move. The progress line replaces the "4 mins read" marquee,
 * which was a looping animation with no state behind it.
 */

function ProgressRule() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  const smoothed = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX: reduced ? scrollYProgress : smoothed, originX: 0 }}
      className="h-[2px] w-full bg-[var(--accent)]"
    />
  );
}

export function CaseNav({ project }) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-50">
      <div className="bg-[var(--paper)] border-b border-[var(--rule)]">
        <div className="case-shell flex items-center justify-between gap-4 h-[56px]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="case-focus group flex items-center gap-2 text-[var(--ink)] -ml-1 px-1 py-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10 3.5 5.5 8l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-[2px]"
              />
            </svg>
            <span className="case-kicker text-[var(--ink)]">Back</span>
          </button>

          <p className="case-kicker truncate">{project}</p>
        </div>
      </div>
      <ProgressRule />
    </div>
  );
}

export function CaseFooter({ nextTitle, nextHref, nextBlurb, longFormHref }) {
  return (
    <footer className="case-shell pt-20 sm:pt-28 pb-16">
      <div className="case-wide">
        <hr className="case-rule" />

        {/* The original long-form write-up. It sits at the end rather than in
            the nav because it is for the reader who got this far and wants more,
            which is a different person from the one deciding whether to start. */}
        {longFormHref && (
          <Link
            to={longFormHref}
            className="case-focus group block py-7 border-b border-[var(--rule)]"
          >
            <div className="flex items-baseline justify-between gap-6">
              <div className="min-w-0">
                <p className="case-kicker mb-2">More comprehensive detail</p>
                <p className="case-body text-[15px] max-w-[52ch]">
                  The original long-form version of this case study, with every flow and screen.
                </p>
              </div>
              <span
                aria-hidden="true"
                className="case-data text-[var(--ink-3)] text-[18px] shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </div>
          </Link>
        )}

        {nextHref && (
          <Link
            to={nextHref}
            className="case-focus group block py-8 sm:py-10 border-b border-[var(--rule)]"
          >
            <p className="case-kicker mb-3">Next case study</p>
            <div className="flex items-baseline justify-between gap-6">
              <h2 className="case-h2 transition-colors duration-[180ms] group-hover:text-[var(--accent)]">
                {nextTitle}
              </h2>
              <span
                aria-hidden="true"
                className="case-data text-[var(--ink-3)] text-[20px] shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </div>
            {nextBlurb && <p className="case-body mt-2 text-[15px]">{nextBlurb}</p>}
          </Link>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-8">
          <p className="case-caption">Amitesh Debnath. Product design, Bangalore.</p>
          <Link to="/works" className="case-link case-focus case-caption">
            All work
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function CaseShell({
  project,
  children,
  nextTitle,
  nextHref,
  nextBlurb,
  longFormHref,
}) {
  return (
    <div className="case min-h-screen">
      <CaseNav project={project} />
      <main>{children}</main>
      <CaseFooter
        nextTitle={nextTitle}
        nextHref={nextHref}
        nextBlurb={nextBlurb}
        longFormHref={longFormHref}
      />
    </div>
  );
}
