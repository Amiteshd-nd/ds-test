import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import { useEnter } from '../../components/case/useEnter';
import StatRow from '../../components/case/StatRow';
import StageFlow from '../../components/case/StageFlow';
import SceneTabs from '../../components/case/SceneTabs';
import { ProofShot } from '../../components/case/ProofMedia';

import mobileHome from '../../assets/images/projects/telugu-streaming/mobile-homepage.webp';
import homeSelected from '../../assets/images/projects/telugu-streaming/home-selected.webp';
import languageOnboarding from '../../assets/images/projects/telugu-streaming/language-onboarding.webp';
import subscriptionOne from '../../assets/images/projects/telugu-streaming/subscription-flow-1.webp';
import subscriptionTwo from '../../assets/images/projects/telugu-streaming/subscription-flow-2.webp';
import subscriptionWorkflow from '../../assets/images/projects/telugu-streaming/subscription-workflow.webp';
import qualityPlayer from '../../assets/images/projects/telugu-streaming/quality-player.webp';
import skipSongPlayer from '../../assets/images/projects/telugu-streaming/skip-song-player.webp';
import contentDolby from '../../assets/images/projects/telugu-streaming/content-4k-dolby.webp';
import styleGuide from '../../assets/images/projects/telugu-streaming/style-guide.webp';
import ndaLock from '../../assets/images/projects/telugu-streaming/nda-lock-icon.webp';

/* True ratios, measured off the files. Only two of these are actually portrait;
   the rest are landscape frames, and calling them phone screens would have
   cropped the interface out of its own screenshot. */
const PHONE = '684 / 1098';
const FLOW = '2955 / 1229';
const FRAME = '962 / 542';
const WIDE = '2886 / 1624';
const GUIDE = '2949 / 1951';
const WORKFLOW = '1722 / 1920';
const SELECTED = '673 / 447';

const STATS = [
  { value: '4', label: 'Languages the interface and the catalogue both speak', source: 'shipped' },
  { value: '3', label: 'Subscription tiers, priced so the comparison is readable', source: 'shipped' },
  { value: 'OTP', label: 'Verification folded into signup rather than bolted after it', source: 'shipped' },
  { value: 'NDA', label: 'Conversion figures and full screens stay out of this write-up', source: 'Constraint' },
];

/*
 * The subscription funnel. The accent sits on verification, which is where a
 * paid signup is most often lost: the user has already decided to pay and the
 * product is still asking them for something.
 */
const FUNNEL = [
  {
    key: 'choose',
    name: 'Choose a plan',
    owner: 'Viewer',
    was: 'Three tiers in a row with near identical feature lists.',
    now: 'Priced per month alongside the total, so an annual plan can be compared to a quarterly one.',
  },
  {
    key: 'verify',
    name: 'Verify',
    owner: 'Viewer',
    was: 'A separate step after the decision, with one contact route and a slow resend.',
    now: 'Inline OTP with an alternate route, so a phone that will not receive a code is not the end of the signup.',
  },
  {
    key: 'pay',
    name: 'Pay',
    owner: 'Viewer',
    was: 'Card first, with everything else under a More link.',
    now: 'UPI, wallets and QR sit at the same level as card, because that is how the audience actually pays.',
  },
  {
    key: 'language',
    name: 'Pick a language',
    owner: 'Viewer',
    was: 'Buried in settings after the fact.',
    now: 'Part of onboarding, and it sets both the interface and the catalogue.',
  },
  {
    key: 'watch',
    name: 'Watch',
    owner: 'Viewer',
    was: 'A home screen in a language the viewer had not chosen.',
    now: 'A catalogue that opens in their language, with dual display where a title has two names.',
  },
];

function Locked({ children }) {
  return (
    <div className="case-panel case-panel--sunk p-5 sm:p-6 flex gap-4 items-start">
      <img src={ndaLock} alt="" aria-hidden="true" className="w-6 h-6 shrink-0 mt-0.5 opacity-60" />
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
          Regional streaming &nbsp;/&nbsp; Under NDA
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[16ch]">
          Paying in one language, watching in another.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[46ch]">
          Subscription and language onboarding for a Telugu streaming platform, built for four
          languages and the way India actually pays.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Product designer" note="Flows, UI, style guide" />
          <Field label="Client" value="Confidential" note="Regional OTT platform" />
          <Field label="Surfaces" value="Mobile web, app, TV" note="Mobile led" />
          <Field label="Constraint" value="NDA" note="Figures and full screens withheld" />
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

const TeluguStreamingV2 = () => {
  useProjectAnalytics('Telugu Streaming 2.0');

  const scenes = [
    {
      id: 'plan',
      tab: 'Plan',
      time: 'Step 01',
      title: 'Three tiers, priced so they can be compared',
      body:
        'Annual, quarterly and a combo, each showing a monthly equivalent next to the total. A limited time offer is marked as one rather than dressed as a permanent price, because a viewer who feels rushed into a year is a viewer who cancels in month two.',
      detail: [
        {
          label: 'Why a monthly equivalent',
          value: 'It is the only way to compare an annual plan to a quarterly one without doing arithmetic on a phone.',
        },
      ],
      media: (
        <ProofShot
          src={subscriptionOne}
          alt="The subscription plan selection screen showing three tiers"
          aspect={FLOW}
          caption="Plans, with the monthly equivalent shown."
          className=""
        />
      ),
    },
    {
      id: 'verify',
      tab: 'Verify',
      time: 'Step 02',
      title: 'The step that loses people who already decided to pay',
      body:
        'Verification arrives after the viewer has committed, which makes every second of it expensive. The OTP is inline rather than on its own screen, the resend is immediate, and there is a second contact route for the phone that never receives the code.',
      detail: [
        {
          label: 'The alternate route',
          value: 'A number that will not receive an SMS should not be the end of a paid signup. It is the cheapest thing on this page and the one I would defend hardest.',
        },
      ],
      media: (
        <ProofShot
          src={subscriptionTwo}
          alt="The verification step with inline OTP entry"
          aspect={FLOW}
          caption="Inline, with a way out."
        />
      ),
    },
    {
      id: 'language',
      tab: 'Language',
      time: 'Step 03',
      title: 'Telugu, Tamil, Malayalam, English, chosen once',
      body:
        'Language is an onboarding decision, not a settings one. Choosing it sets the interface and the catalogue together, and titles that carry two names show both rather than picking one and hiding the other.',
      detail: [
        {
          label: 'Dual display',
          value: 'A film known by two names in two scripts is one film. Showing both is what makes it findable by either.',
        },
      ],
      media: (
        <ProofShot
          src={languageOnboarding}
          alt="The language selection step during onboarding"
          aspect={FRAME}
          caption="Set once, applied to both."
        />
      ),
    },
    {
      id: 'watch',
      tab: 'Watch',
      time: 'Step 04',
      title: 'A player that knows what it is playing',
      body:
        'Quality, audio and skip controls sized for a thumb, with 4K and Dolby surfaced on the titles that have them. A premium tier is only worth paying for if the product says where the premium actually is.',
      detail: [
        {
          label: 'Skip, specifically',
          value: 'For a catalogue built around song sequences, skipping one is a first class control rather than a scrub.',
        },
      ],
      media: (
        <ProofShot
          src={qualityPlayer}
          alt="The player with quality and audio controls"
          aspect={FRAME}
          caption="Controls at thumb scale."
        />
      ),
    },
  ];

  return (
    <CaseShell
      project="Telugu Streaming"
      nextTitle="Gazebo Complex Organisms"
      nextHref="/projects/gazebo-complex-organisms-2"
      longFormHref="/projects/telugu-streaming"
      nextBlurb="Six composite organisms for a hiring platform, published as a live library."
    >
      <Masthead />

      <div className="case-shell pt-14 sm:pt-20">
        <div className="case-wide">
          <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-[760px] items-end">
            <ProofShot src={mobileHome} alt="The mobile home screen" aspect={PHONE} />
            <ProofShot src={subscriptionWorkflow} alt="The subscription workflow on mobile" aspect={WORKFLOW} />
            <ProofShot src={homeSelected} alt="The home screen with a title selected" aspect={SELECTED} contain />
          </div>
          <p className="case-caption mt-4 max-w-[52ch]">
            Home, a selected title, and the subscription flow. Mobile first, because that is where
            the catalogue is watched.
          </p>
        </div>
      </div>

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          This project is under NDA, so there are no conversion or retention figures here. The
          counts above describe the design work.
        </p>
      </Section>

      <Section kicker="The brief" title="A regional catalogue with a national checkout">
        <p className="case-body">
          The platform's audience watches in Telugu, Tamil, Malayalam and English, often more than
          one of them in the same household. The subscription flow it had was built the way a
          default checkout is built: card first, English first, verification as a separate screen
          after the decision.
        </p>
        <p className="case-body mt-5">
          Both halves of that are a mismatch. The language a viewer watches in is a first class
          preference, not a setting, and the payment method they actually use is more likely to be
          UPI than a card.
        </p>

        <Pull cite="The line that reordered the payment screen">
          Design for how this audience pays, not for how a checkout is usually drawn.
        </Pull>

        <Locked>
          Conversion, drop off and retention figures belong to the client and are not reproduced
          here. The screens below are the ones cleared for sharing.
        </Locked>
      </Section>

      <Section
        title="Three calls that shaped the build"
        intro="Everything else was execution. These three were arguments."
        wide
      >
        <Decision
          index="01"
          kicker="Clarity against urgency"
          title="Price the tiers so they can be compared, not so one of them wins."
          tension="The usual way to sell an annual plan is to make the others look bad: bury the monthly equivalent, badge one tier as popular, run a countdown. It converts, and it produces subscribers who feel handled and cancel at the first renewal."
          call="Every tier shows its monthly equivalent next to its total, so an annual and a quarterly plan can be compared without arithmetic. A limited time offer is labelled as one. The comparison is honest and the annual plan still wins on its own merits."
          result="A plan screen someone can reason about in a few seconds, and a decision the subscriber can still defend to themselves at renewal."
        >
          <div className="grid gap-5">
            <ProofShot src={subscriptionOne} alt="Plan selection" aspect={FLOW} />
            <ProofShot src={subscriptionTwo} alt="Verification and payment" aspect={FLOW} caption="Plan, then verify, then pay." />
          </div>
        </Decision>

        <Decision
          index="02"
          kicker="Convention against audience"
          title="Put UPI and QR at the same level as card."
          tension="A checkout drawn to international convention leads with card and files everything else under a More link. For this audience that buries the method most of them intend to use, and every extra tap after the decision to pay is a chance to reconsider."
          call="UPI, wallets and QR sit alongside card as equals rather than as alternatives. Nothing is hidden behind a disclosure, and the order reflects what the audience reaches for first."
          result="The payment step stopped being a detour through a method the viewer was not going to use."
        >
          <StageFlow
            stages={FUNNEL}
            brokeAt="verify"
            beforeLabel="Before"
            afterLabel="After"
            tableTitle="The funnel as a table"
            caption="Tap or hover a step. The accent marks where a paid signup is most often lost."
          />
        </Decision>

        <Decision
          index="03"
          kicker="One language against four"
          title="Make language an onboarding decision that sets two things at once."
          tension="Most products treat interface language and content language as separate settings, both buried. In a multilingual household that produces an English interface over a Telugu catalogue, or the reverse, and neither is what anyone asked for."
          call="One choice during onboarding, applied to the interface and the catalogue together, with dual display where a title carries two names in two scripts. Changing it later is one control, not two."
          result="A viewer's first screen after paying is in the language they chose, and a film with two names is findable by either."
        >
          <div className="grid sm:grid-cols-2 gap-5">
            <ProofShot src={languageOnboarding} alt="The language selection step" aspect={FRAME} />
            <ProofShot
              src={contentDolby}
              alt="A title page showing 4K and Dolby badges"
              aspect={FRAME}
              caption="Where the premium tier actually shows up."
            />
          </div>
        </Decision>
      </Section>

      <Section title="Four steps to a first play" intro="The path from a plan to a screen." wide>
        <SceneTabs scenes={scenes} />
      </Section>

      <Section title="The style guide" wide>
        <p className="case-body">
          Four languages means four scripts, and Telugu in particular sets taller than Latin at the
          same nominal size. The type scale had to be specified per script rather than per step, or
          headings would clip in one language and float in another.
        </p>
        <div className="grid sm:grid-cols-2 gap-5 mt-8">
          <ProofShot src={styleGuide} alt="The style guide, showing type and colour" aspect={GUIDE} caption="Type, colour and spacing." />
          <ProofShot src={skipSongPlayer} alt="The player with a skip song control" aspect={WIDE} caption="Skip, as a first class control." />
        </div>
      </Section>

      <Section kicker="Impact" title="What changed">
        <p className="case-body">
          The conversion outcome belongs to the client. What I can say is structural: the signup
          stopped assuming a card and an English speaker, verification stopped being a separate
          screen after the decision, and language became something the product asks once and then
          honours everywhere.
        </p>
        <Aside label="On the missing numbers">
          Every case study on this site carries how its figures were arrived at. For this one the
          answer is that they are not mine to publish, and a short honest page beats a padded one.
        </Aside>
      </Section>

      <Section title="Three things I would do differently">
        <ol className="flex flex-col">
          {[
            {
              head: 'I tested the flow in English and shipped it in four languages.',
              body:
                'The usability sessions ran in English because that is what the room spoke. Telugu and Tamil string lengths broke two layouts after handoff, and testing in the longest language first would have caught both.',
            },
            {
              head: 'Dual display solved discovery and not search.',
              body:
                'Titles show both names, but the search index was not given the same treatment in the first release, so a film findable by eye was not always findable by typing.',
            },
            {
              head: 'The TV surface came along for the ride.',
              body:
                'The work was mobile led and the television layout inherited the mobile hierarchy rather than earning its own. A ten foot interface has different rules and deserved its own pass.',
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

export default TeluguStreamingV2;
