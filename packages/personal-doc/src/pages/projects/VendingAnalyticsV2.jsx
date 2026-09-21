import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import { useEnter } from '../../components/case/useEnter';
import StatRow from '../../components/case/StatRow';
import { ProofShot } from '../../components/case/ProofMedia';

import desktopView from '../../assets/images/projects/vending-analytics/desktop-view.webp';
import mobileOne from '../../assets/images/projects/vending-analytics/mobile-screen-1.webp';
import mobileTwo from '../../assets/images/projects/vending-analytics/mobile-screen-2.webp';
import lockKey from '../../assets/images/projects/vending-analytics/lock-key.webp';

const STATS = [
  { value: '1 screen', label: 'A dense desktop analytics table, rebuilt for a phone', source: 'shipped' },
  { value: 'In aisle', label: 'Where the numbers are now read, rather than back at a desk', source: 'shipped' },
  { value: '0', label: 'Metrics dropped to make it fit', source: 'shipped' },
  { value: 'NDA', label: 'Thresholds and partner performance figures stay out of this write-up', source: 'Constraint' },
];

/*
 * A locked panel, used where the client's own numbers would otherwise go. It is
 * a real part of the story rather than an apology: the interesting design
 * problem here is legible without the figures behind it.
 */
function Locked({ children }) {
  return (
    <div className="case-panel case-panel--sunk p-5 sm:p-6 flex gap-4 items-start">
      <img src={lockKey} alt="" aria-hidden="true" className="w-6 h-6 shrink-0 mt-0.5 opacity-60" />
      <div>
        <p className="case-kicker mb-2">Under NDA</p>
        <p className="case-body text-[15px]">{children}</p>
      </div>
    </div>
  );
}

function Masthead() {
  const reduced = useReducedMotion();
  const step = staggerFor(4, 0.3);
  const line = (i) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(5px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { type: 'spring', visualDuration: 0.5, bounce: 0, delay: i * step },
  });

  return (
    <header className="case-shell pt-14 sm:pt-20">
      <div className="case-wide">
        <motion.p {...line(0)} className="case-kicker case-kicker--cased">
          Kellogg&#8217;s &nbsp;/&nbsp; Retail analytics
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[16ch]">
          A dashboard that had to fit in one hand.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[46ch]">
          Dense desktop retail analytics, rebuilt for a sales rep standing in an aisle with a phone
          and about ninety seconds.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Product designer" note="Research, flows, UI" />
          <Field label="Client" value={'Kellogg\u2019s'} note="Retail partner performance" />
          <Field label="Surface" value="Mobile web" note="From an existing desktop tool" />
          <Field label="Constraint" value="NDA" note="Thresholds and figures withheld" />
        </motion.dl>
      </div>
    </header>
  );
}

function Decision({ index, kicker, title, tension, call, result, children }) {
  const enter = useEnter();

  return (
    <motion.article {...enter} className="pt-14 sm:pt-20 first:pt-0">
      <div className="flex items-baseline gap-6">
        <span
          aria-hidden="true"
          className="case-data hidden sm:block text-[var(--rule-strong)] text-[40px] leading-none tracking-[-0.05em] shrink-0 w-[40px]"
        >
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="case-kicker mb-2">
            <span className="sm:hidden text-[var(--rule-strong)]">{index}&nbsp;&nbsp;</span>
            {kicker}
          </p>
          <h3 className="case-h3 max-w-[30ch]">{title}</h3>
        </div>
      </div>

      <div className="mt-7 sm:mt-9 sm:pl-[64px] grid lg:grid-cols-2 gap-x-10 gap-y-7">
        <div>
          <p className="case-kicker mb-2">The tension</p>
          <p className="case-body">{tension}</p>
        </div>
        <div>
          <p className="case-kicker mb-2">The call</p>
          <p className="case-body">{call}</p>
        </div>
      </div>

      <div className="mt-8 sm:pl-[64px]">{children}</div>

      <div className="mt-7 sm:pl-[64px]">
        <DrawnRule accent />
        <p className="case-body text-[15px] mt-3">
          <strong>What it moved. </strong>
          {result}
        </p>
      </div>
    </motion.article>
  );
}

const VendingAnalyticsV2 = () => {
  useProjectAnalytics('Vending Analytics 2.0');

  return (
    <CaseShell
      project="Vending Analytics"
      nextTitle="Telugu Streaming"
      nextHref="/projects/telugu-streaming-2"
      longFormHref="/projects/vending-analytics"
      nextBlurb="Subscription and language onboarding for a regional streaming platform."
    >
      <Masthead />

      <div className="case-shell pt-14 sm:pt-20">
        <div className="case-wide">
          <ProofShot
            src={desktopView}
            alt="The original desktop retail analytics dashboard"
            aspect="2175 / 1119"
          />
          <p className="case-caption mt-4 max-w-[52ch]">
            Where it started. A desktop analytics view built for a seated analyst.
          </p>
        </div>
      </div>

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          The client is named because the work already is. What the agreement covers is narrower
          than the logo: the thresholds, the performance figures and the screens they sit on.
        </p>
      </Section>

      <Section kicker="The brief" title="The numbers were right and nobody could read them">
        <p className="case-body">
          The analytics existed and were accurate. They were also built for someone sitting down: a
          wide table, many columns, sortable, designed to be studied. The people who most needed it
          were sales representatives in a store, holding a phone, mid conversation with a retail
          partner.
        </p>
        <p className="case-body mt-5">
          The easy answer is to cut metrics until it fits. That is the wrong answer, because the
          rep does not get to choose which question the partner asks.
        </p>

        <Pull cite="The constraint that decided the layout">
          Ninety seconds, one hand, and someone watching you look it up.
        </Pull>

        <Locked>
          The thresholds that drive the dashboard, and the partner performance figures behind
          them, are covered by the agreement and are not discussed here. The screens below are the
          ones cleared for sharing.
        </Locked>
      </Section>

      <Section
        title="Two calls that shaped the build"
        intro="A small project with one real argument in it, and one consequence of that argument."
        wide
      >
        <Decision
          index="01"
          kicker="Density against legibility"
          title="Keep every metric. Change what a row is."
          tension="A phone cannot show a twelve column table, and dropping columns means the rep is one question away from being unable to answer. But a horizontally scrolling table on a phone is a table nobody reads: the labels leave the screen with the first swipe."
          call="The row stopped being a row. Each retail partner became a card carrying its own metrics as labelled pairs, so nothing scrolls out of context and nothing had to be cut. Sorting and filtering moved into a single control above the list rather than into the column headers."
          result="The whole metric set survived the move to a 375px screen, and the label is always next to its number."
        >
          {/* These are full-page scroll captures at roughly 1:3.5, not phone
              screens. Shown at their real ratio and at phone width, so the whole
              page is legible rather than cropped to a viewport that never
              existed. */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6 max-w-[420px] items-start">
            <ProofShot
              src={mobileOne}
              alt="The mobile analytics view, with each retail partner as a card"
              aspect="1104 / 3927"
            />
            <ProofShot
              src={mobileTwo}
              alt="A second mobile analytics screen showing metric detail"
              aspect="1080 / 3921"
              caption="Labelled pairs, not columns."
            />
          </div>
        </Decision>

        <Decision
          index="02"
          kicker="Browsing against answering"
          title="Lead with the thing worth acting on, not with the full list."
          tension="A desktop dashboard opens on everything, because an analyst is exploring. A rep in a store is not exploring. They have one partner in front of them and a specific reason to have opened the app."
          call="The mobile view opens on what needs attention: replenishment opportunities and partners off their expected performance, with the full list one tap behind it. The desktop tool kept its overview, because that user really is browsing."
          result="Same data, two entry points. The phone answers a question and the desktop supports a study."
        >
          <Locked>
            The specific thresholds that decide what counts as needing attention are commercial
            logic and stay out of this page.
          </Locked>
        </Decision>
      </Section>

      <Section kicker="Impact" title="What changed">
        <p className="case-body">
          The measurable outcome belongs to the client and is covered by the agreement. What I can
          say is structural: the analytics stopped being something reps checked before a visit and
          became something they used during one, and it happened without removing a single metric
          from the set.
        </p>
        <Aside label="On the missing numbers">
          I would rather show a short honest case study than a padded one. Every project on this
          site carries how its figures were arrived at, and for this one the answer is that they are
          not mine to publish.
        </Aside>
      </Section>

      <Section title="Two things I would do differently">
        <ol className="flex flex-col">
          {[
            {
              head: 'I designed for the aisle without standing in one.',
              body:
                'The ninety second constraint came from interviews rather than observation. Watching a single store visit would have been worth more than the three calls it was built on, and it would have surfaced the glare and one handed problems earlier.',
            },
            {
              head: 'The card layout solved density and not hierarchy.',
              body:
                'Keeping every metric was the right call, but the card treats them as equally important, and they are not. A second pass should have ranked them.',
            },
          ].map((item, i, arr) => (
            <li key={item.head} className={i < arr.length - 1 ? 'pb-7 mb-7 border-b border-[var(--rule)]' : ''}>
              <h3 className="case-h3 text-[17px] sm:text-[19px] max-w-[46ch]">{item.head}</h3>
              <p className="case-body mt-2.5">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </CaseShell>
  );
};

export default VendingAnalyticsV2;
