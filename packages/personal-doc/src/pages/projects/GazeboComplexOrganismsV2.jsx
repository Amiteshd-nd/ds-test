import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import { useEnter } from '../../components/case/useEnter';
import StatRow from '../../components/case/StatRow';
import StageFlow from '../../components/case/StageFlow';
import SceneTabs from '../../components/case/SceneTabs';
import { ProofShot } from '../../components/case/ProofMedia';

import topbarPre from '../../assets/images/projects/gazebo-complex-organisms/topbar-pre-auth.webp';
import topbarPost from '../../assets/images/projects/gazebo-complex-organisms/topbar-post-auth.webp';
import topbarSearch from '../../assets/images/projects/gazebo-complex-organisms/topbar-search.webp';
import searchDefault from '../../assets/images/projects/gazebo-complex-organisms/search-default.webp';
import searchFocused from '../../assets/images/projects/gazebo-complex-organisms/search-focused.webp';
import megaMenu from '../../assets/images/projects/gazebo-complex-organisms/mega-menu-default.webp';
import notificationPanel from '../../assets/images/projects/gazebo-complex-organisms/notification-panel.webp';
import progressDefault from '../../assets/images/projects/gazebo-complex-organisms/progress-default.webp';
import progressExpanded from '../../assets/images/projects/gazebo-complex-organisms/progress-expanded.webp';
import jobOpenings from '../../assets/images/projects/gazebo-complex-organisms/job-openings-dashboard.webp';
import ongoingApplication from '../../assets/images/projects/gazebo-complex-organisms/ongoing-application-dashboard.webp';
import recruiterDash from '../../assets/images/projects/gazebo-complex-organisms/recruiter-dash.webp';
import jobItemBreakdown from '../../assets/images/projects/gazebo-complex-organisms/job-item-breakdown.webp';
import jobCardDetails from '../../assets/images/projects/gazebo-complex-organisms/job-card-details.webp';
import bulkSelection from '../../assets/images/projects/gazebo-complex-organisms/bulk-selection.webp';
import bulkCompose from '../../assets/images/projects/gazebo-complex-organisms/bulk-compose.webp';

/* True ratios, measured off the files. These screens range from a 15:1
   navigation strip to a portrait notification panel, and a shared box would
   crop most of them into nonsense. */
const BAR = '2820 / 180';
const SEARCH = '563 / 108';
const SEARCH_WIDE = '1431 / 131';
const ROW = '1653 / 183';
const PROGRESS = '1576 / 653';
const PROGRESS_SM = '1576 / 351';
const JOBS = '2868 / 1564';
const APPLICATIONS = '2868 / 2030';
const RECRUITER = '2838 / 831';
const CARD = '2898 / 1902';
const BULK = '2058 / 1517';
const BULK_SEL = '2058 / 1452';
const PANEL = '1707 / 1920';
const SQUARE = '1 / 1';

export const STORYBOOK = 'https://design.gaz3bo.com';

const STATS = [
  { value: '6', label: 'Organisms documented end to end, not just drawn', source: 'shipped' },
  { value: '2', label: 'Roles served by one component set: candidate and recruiter', source: 'shipped' },
  { value: '7', label: 'Application states a candidate can be in', source: 'shipped' },
  { value: 'Live', label: 'The library runs as a Storybook, not a Figma page', source: 'Shipped' },
];

/*
 * The candidate's view of their own application. Seven states, and the two the
 * design had to work hardest on are the ones where nothing is happening to them:
 * Applied and Pending. The accent marks Viewed, which is where the product
 * finally has something true to say.
 */
const APPLICATION_STAGES = [
  {
    key: 'applied',
    name: 'Applied',
    owner: 'Candidate',
    was: 'A submit button and then silence.',
    now: 'Confirmed, timestamped, and visible in the dashboard from the moment it lands.',
  },
  {
    key: 'viewed',
    name: 'Viewed',
    owner: 'Recruiter',
    was: 'Invisible. The candidate had no way to tell a read application from an ignored one.',
    now: 'Surfaced the moment a recruiter opens it, and it moves the conversion score.',
  },
  {
    key: 'shortlisted',
    name: 'Shortlisted',
    owner: 'Recruiter',
    was: 'Communicated by email, if at all.',
    now: 'A state on the card, with the reason it matched shown alongside.',
  },
  {
    key: 'processing',
    name: 'Processing',
    owner: 'Recruiter',
    was: 'The long middle where candidates assume the worst.',
    now: 'Named explicitly, so waiting reads as progress rather than as rejection.',
  },
  {
    key: 'closed',
    name: 'Selected or Filled',
    owner: 'System',
    was: 'Often no notification at all when a role was filled by someone else.',
    now: 'Both endings are states. A closed role says so rather than going quiet.',
  },
];

const IMPACT = [
  {
    metric: 'Where the components live',
    before: 'A Figma page, copied per screen',
    after: 'A published Storybook engineers build against',
    source: 'Shipped',
  },
  {
    metric: 'Top navigation',
    before: 'Rebuilt per page, drifting',
    after: 'One organism, three auth states',
    source: 'Shipped',
  },
  {
    metric: 'Application status',
    before: 'Free text, inconsistent per screen',
    after: 'Seven named states with fixed copy',
    source: 'Shipped',
  },
  {
    metric: 'Recruiter handling many candidates',
    before: 'One at a time',
    after: 'Bulk select and bulk compose',
    source: 'Shipped',
  },
  {
    metric: 'What a candidate sees while waiting',
    before: 'Nothing between apply and outcome',
    after: 'A live state and a scored probability',
    source: 'Shipped',
  },
];

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
          Gazebo &nbsp;/&nbsp; Design system
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[16ch]">
          The components that are too big to draw twice.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[46ch]">
          Six composite organisms for a hiring platform, specified once and published as a live
          library rather than a Figma page.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Design system lead" note="Specification, states, handoff" />
          <Field label="Team" value="2 designers, 4 engineers" note="Platform and web" />
          <Field label="Duration" value="Ongoing" note="Shipped in waves" />
          <Field label="Output" value="A published Storybook" note="design.gaz3bo.com" />
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

const GazeboComplexOrganismsV2 = () => {
  useProjectAnalytics('Gazebo Complex Organisms 2.0');

  const scenes = [
    {
      id: 'nav',
      tab: 'Navigation',
      time: 'Organism 01',
      title: 'One top bar, three states, no second copy',
      body:
        'The bar has to work signed out, signed in, and mid search, and those had been three separate designs drifting apart. It is one organism now, composed of a brand mark, a search field, a notification bell and the nine dot launcher, each with its own states.',
      detail: [
        {
          label: 'Why the nine dot grid',
          value: 'It is the pattern people already know from other platforms, and an app launcher is the wrong place to be original.',
        },
      ],
      media: (
        <ProofShot
          src={topbarPost}
          alt="The Gazebo top navigation bar in its signed in state"
          aspect={BAR}
          caption="Signed in. Search, notifications and the launcher in one bar."
        />
      ),
    },
    {
      id: 'candidate',
      tab: 'Candidate',
      time: 'Organism 02',
      title: 'The dashboard a candidate checks on a Tuesday night',
      body:
        'Applications, their current state, and what happens next. The card collapses to a scannable row and expands to the full job, so a candidate with thirty applications can read the list without opening any of them.',
      detail: [
        {
          label: 'Default and expanded',
          value: 'The same component. Expanding reveals the job detail and the actions, and never navigates away from the list.',
        },
      ],
      media: (
        <ProofShot
          src={ongoingApplication}
          alt="The candidate dashboard listing ongoing applications and their states"
          aspect={APPLICATIONS}
          caption="Every application, with the state it is actually in."
        />
      ),
    },
    {
      id: 'recruiter',
      tab: 'Recruiter',
      time: 'Organism 03',
      title: 'The same parts, pointed the other way',
      body:
        'A recruiter sees their own roles, the volume against each, and the candidates inside. The job list item is the mirror of the candidate card: same anatomy, different owner, so the two dashboards did not need two component sets.',
      detail: [
        {
          label: 'The 99 cap',
          value: 'Application counts stop at 99 on the card. Past that the number is noise, and the detail view is one click away.',
        },
      ],
      media: (
        <ProofShot
          src={recruiterDash}
          alt="The recruiter dashboard showing job listings and application volume"
          aspect={RECRUITER}
          caption="Roles, volume, and the candidates behind each."
        />
      ),
    },
    {
      id: 'bulk',
      tab: 'Bulk actions',
      time: 'Organism 04',
      title: 'Three hundred candidates, one message',
      body:
        'Rejecting or progressing candidates one at a time is where recruiters stop using the product and go back to their inbox. Selection and compose are one flow: pick a set, write once, send with the recipient list visible the whole time.',
      detail: [
        {
          label: 'Recipients stay visible',
          value: 'The list of who is about to receive this is on screen while it is being written. A bulk send with a hidden recipient list is a mistake waiting to happen.',
        },
      ],
      media: (
        <ProofShot
          src={bulkCompose}
          alt="The bulk compose interface with a visible recipient list"
          aspect={BULK}
          caption="Compose, with the recipients in view."
        />
      ),
    },
  ];

  return (
    <CaseShell
      project="Gazebo Complex Organisms"
      nextTitle="Hours of Service"
      nextHref="/projects/hours-of-service-2"
      longFormHref="/projects/gazebo-complex-organisms"
      nextBlurb="Taking FMCSA Hours of Service in-house for 270,000 drivers, and retiring a per-device vendor."
    >
      <Masthead />

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          A design system's outcomes are structural, not statistical. These are counts of what
          exists, not projections.
        </p>
      </Section>

      <Section kicker="The brief" title="Atoms were solved. Organisms were not.">
        <p className="case-body">
          Gazebo had buttons, inputs and tokens. What it did not have were the pieces those add up
          to: a navigation bar, a dashboard row, a status pipeline, a bulk action. Those were being
          redrawn per screen, and because nobody owned them they drifted, which is how a product
          ends up with four notification bells.
        </p>
        <p className="case-body mt-5">
          A composite component is harder to systematise than a button because it carries behaviour,
          not just appearance. Its states are not hover and focus; they are signed out, empty,
          ninety nine plus, and role filled.
        </p>

        <Pull cite="The test I applied to every organism">
          If two teams would draw it differently, it is not specified yet.
        </Pull>

        {/* Stacked, not three up: a 15:1 strip shown at a third of the width is
            a smear. Each state gets the full measure. */}
        <div className="grid gap-5">
          <ProofShot src={topbarPre} alt="Top bar, signed out" aspect={BAR} caption="Signed out." />
          <ProofShot src={topbarPost} alt="Top bar, signed in" aspect={BAR} caption="Signed in." />
          <ProofShot src={topbarSearch} alt="Top bar, search active" aspect={BAR} caption="Searching." />
        </div>
      </Section>

      <Section
        title="Three calls that shaped the system"
        intro="Everything else was specification. These three were arguments."
        wide
      >
        <Decision
          index="01"
          kicker="One component against two products"
          title="Make the candidate card and the recruiter row the same anatomy."
          tension="A hiring platform has two users who want opposite things from the same record. The obvious route is two component sets, and the obvious consequence is that they drift until a status means one thing on one side and something else on the other."
          call="One anatomy, two configurations. Both are a title, a meta line, a state chip and a disclosure, with the owner deciding which actions appear. The status vocabulary is shared, so Shortlisted means the same thing to both people looking at it."
          result="Two dashboards out of one component set, and a status a recruiter sets that a candidate reads without translation."
        >
          <div className="grid sm:grid-cols-2 gap-5">
            <ProofShot
              src={jobItemBreakdown}
              alt="The recruiter job list item, annotated with its parts"
              aspect={ROW}
              caption="Recruiter side, broken down."
            />
            <ProofShot
              src={progressExpanded}
              alt="The candidate application card in its expanded state"
              aspect={PROGRESS}
              caption="Candidate side, expanded."
            />
          </div>
        </Decision>

        <Decision
          index="02"
          kicker="Silence against honesty"
          title="Give waiting a name, and put a number on it."
          tension="Between applying and hearing back, most products show nothing. The candidate cannot tell a read application from an ignored one, and the absence reads as rejection. But saying more than you know is worse than saying nothing."
          call="Seven named states, each with fixed copy so no screen invents its own wording, plus a conversion probability the card explains rather than asserts. The score is shown with its working: pool size, stage, profile match, recruiter activity."
          result="Waiting became a state rather than a void, and the one number on the card can be defended line by line when a candidate asks where 44% came from."
        >
          <StageFlow
            stages={APPLICATION_STAGES}
            brokeAt="viewed"
            beforeLabel="Before"
            afterLabel="After"
            tableTitle="The application states as a table"
            caption="Tap or hover a state. The accent marks the one that was invisible before."
          />

          <div className="case-panel mt-6 p-5 sm:p-6">
            <p className="case-kicker mb-3">How the 44% is arrived at</p>
            <p className="case-data text-[14px] leading-[2] text-[var(--ink)]">
              pool normalisation, 330 applications &nbsp;&nbsp;25%
              <br />
              stage raised to Viewed &nbsp;&nbsp;+10%
              <br />
              strong profile match &nbsp;&nbsp;+5%
              <br />
              recruiter pinned the role &nbsp;&nbsp;+4%
              <br />
              historic conversion at this stage &nbsp;&nbsp;0%
            </p>
            <hr className="case-rule my-4" />
            <p className="case-body text-[15px]">
              <strong>44%.</strong> Each factor is weighted and visible. A probability a product
              cannot explain is a probability it should not show.
            </p>
          </div>
        </Decision>

        <Decision
          index="03"
          kicker="Drawings against a running library"
          title="Ship the system as a Storybook, not as a Figma page."
          tension="A design system that lives in a design tool is a set of pictures engineers translate. Every translation is a chance to drift, and the drift is invisible until someone screenshots two pages side by side."
          call="The component library is published and running at design.gaz3bo.com. The Figma file is still where the thinking happens, but the built components are the source of truth, and a state that is not in Storybook is not in the system."
          result="Specification stopped being a handoff document and started being the thing that runs. Anyone can open the library and see the real states."
        >
          <a
            href={STORYBOOK}
            target="_blank"
            rel="noopener noreferrer"
            className="case-focus group case-panel block p-5 sm:p-6 no-underline"
          >
            <p className="case-kicker mb-2">The live library</p>
            <div className="flex items-baseline justify-between gap-5">
              <span className="case-h3 transition-colors duration-[180ms] group-hover:text-[var(--accent)]">
                design.gaz3bo.com
              </span>
              <span
                aria-hidden="true"
                className="case-data text-[var(--ink-3)] text-[20px] shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
              >
                &#8599;
              </span>
            </div>
            <p className="case-body text-[15px] mt-2">
              The Gazebo component library, running as a Storybook. Every organism on this page has
              its real states in there.
            </p>
          </a>
        </Decision>
      </Section>

      <Section title="Six organisms" intro="The ones that carry the product." wide>
        <SceneTabs scenes={scenes} />
      </Section>

      <Section title="The rest of the set" wide>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <ProofShot src={searchDefault} alt="The search field in its default state" aspect={SEARCH} contain caption="Search, default." />
          <ProofShot src={searchFocused} alt="The search field in its focused state" aspect={SEARCH_WIDE} contain caption="Search, focused." />
          <ProofShot src={megaMenu} alt="The nine dot application launcher" aspect={SQUARE} contain caption="The nine dot launcher." />
          <ProofShot src={notificationPanel} alt="The notification panel" aspect={PANEL} contain caption="Notifications." />
          <ProofShot src={progressDefault} alt="An application card in its default state" aspect={PROGRESS_SM} contain caption="Application card, default." />
          <ProofShot src={jobOpenings} alt="The job openings dashboard" aspect={JOBS} contain caption="Job openings." />
          <ProofShot src={bulkSelection} alt="Bulk candidate selection" aspect={BULK_SEL} contain caption="Bulk selection." />
          <ProofShot src={jobCardDetails} alt="The expanded job card detail view" aspect={CARD} contain caption="Job card, opened." />
        </div>
      </Section>

      <Section kicker="Impact" title="What changed, and how confident I am about it" wide>
        <div className="md:hidden flex flex-col border-t border-[var(--rule-strong)]">
          {IMPACT.map((row) => (
            <div key={row.metric} className="py-4 border-b border-[var(--rule)]">
              <p className="text-[15px] leading-[1.4] tracking-[-0.01em] text-[var(--ink)]">{row.metric}</p>
              <dl className="mt-3 grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="case-kicker pt-[3px]">Before</dt>
                <dd className="case-body text-[14px]">{row.before}</dd>
                <dt className="case-kicker pt-[3px]">After</dt>
                <dd className="text-[14px] leading-[1.45] text-[var(--accent)]">{row.after}</dd>
              </dl>
              <p className="case-caption mt-2.5">{row.source}</p>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {['Measure', 'Before', 'After', 'Basis'].map((h) => (
                  <th key={h} className="case-kicker font-normal py-3 pr-5 border-b border-[var(--rule-strong)] align-bottom">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMPACT.map((row) => (
                <tr key={row.metric}>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top text-[15px] leading-[1.45] text-[var(--ink)]">{row.metric}</td>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top case-body text-[14px]">{row.before}</td>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top text-[15px] leading-[1.45] text-[var(--accent)]">{row.after}</td>
                  <td className="py-4 border-b border-[var(--rule)] align-top case-caption">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Aside label="On the numbers">
          No projections on this one. A design system's result is what exists and what stopped being
          redrawn, and both are countable.
        </Aside>
      </Section>

      <Section title="Three things I would do differently">
        <ol className="flex flex-col">
          {[
            {
              head: 'I specified the organisms before the content rules.',
              body:
                'The components were right and the copy inside them was not, so Shortlisted read three different ways for a while. Status wording should have been fixed in the same pass as the states.',
            },
            {
              head: 'The conversion score shipped without a way to question it.',
              body:
                'The breakdown exists in the spec and not in the product. A candidate looking at 44% cannot see the working, which is exactly the person who should be able to.',
            },
            {
              head: 'Storybook came last, not first.',
              body:
                'Months of the system lived as a Figma page, and the drift that caused is the reason the library exists. Publishing early would have been cheaper than reconciling later.',
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

export default GazeboComplexOrganismsV2;
