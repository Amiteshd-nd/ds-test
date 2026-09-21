import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import { useEnter } from '../../components/case/useEnter';
import StatRow from '../../components/case/StatRow';
import DutyLogGraph from '../../components/case/DutyLogGraph';
import SceneTabs from '../../components/case/SceneTabs';
import { ProofVideo, ProofShot } from '../../components/case/ProofMedia';

import dashOnDuty from '../../assets/images/projects/hours-of-service/dashboard-on-duty.webp';
import dashDriving from '../../assets/images/projects/hours-of-service/dashboard-driving.webp';
import dashLogs from '../../assets/images/projects/hours-of-service/dashboard-logs.webp';
import legacyHome from '../../assets/images/projects/hours-of-service/homescreen-1.webp';
import geotab from '../../assets/images/projects/hours-of-service/geotab-1.webp';
import samsara from '../../assets/images/projects/hours-of-service/samsara-1.webp';
import lytx from '../../assets/images/projects/hours-of-service/lytx-1.webp';
import dataTransfer from '../../assets/images/projects/hours-of-service/datatransfer-1.webp';
import inCabMonitor from '../../assets/images/projects/hours-of-service/eld-1-1.webp';

import frameShiftA from '../../assets/images/projects/hours-of-service/f11-scene1.webp';
import frameShiftB from '../../assets/images/projects/hours-of-service/f2.webp';
import frameDriveA from '../../assets/images/projects/hours-of-service/f6.webp';
import frameDriveB from '../../assets/images/projects/hours-of-service/f10.webp';
import frameSwapA from '../../assets/images/projects/hours-of-service/f9.webp';
import frameSwapB from '../../assets/images/projects/hours-of-service/f12.webp';
import frameStopA from '../../assets/images/projects/hours-of-service/f13-police.webp';
import frameStopB from '../../assets/images/projects/hours-of-service/f14-log-request.webp';

import videoAutoChange from '../../assets/videos/auto-change-eld.mov';
import videoInspectorMode from '../../assets/videos/hours-of-service-1.mov';
import videoCertification from '../../assets/videos/hours-of-service-3.mov';
import videoLogRecords from '../../assets/videos/log-records.mov';

/* Phone screenshots are 1182x2412; the screen recordings are 738x1554. Close
   enough that one ratio would distort the other, so each keeps its own. */
const SHOT = '1182 / 2412';
const CLIP = '738 / 1554';

const STATS = [
  { value: '$72K', label: 'Vendor licence removed, per 1,000 devices, per year', source: 'modelled' },
  { value: '2 to 1', label: 'Apps a driver opens to finish one shift', source: 'shipped' },
  { value: '41%', label: 'Fewer unassigned driving logs in the first quarter', source: 'modelled' },
  { value: '270K', label: 'Drivers the feature had to hold on day one', source: 'Platform scale' },
];

/* A compliant two driver day, used as the spine of the scene section. The
   accent marks 16:00, which is the one moment the middle of this page argues
   about. */
const DUTY_DAY = [
  { start: 0, status: 'OFF' },
  { start: 6.5, status: 'ON', note: 'Pre trip inspection, yesterday’s logs certified' },
  { start: 7.25, status: 'D' },
  { start: 11.75, status: 'OFF', note: 'Mandatory 30 minute break' },
  { start: 12.25, status: 'D' },
  { start: 16, status: 'ON', note: 'Proposed by the device, accepted by the driver' },
  { start: 16.5, status: 'SB', note: 'Co driver takes the wheel' },
  { start: 24, status: 'SB' },
];

const DUTY_EVENT = {
  at: 16,
  status: 'ON',
  label: 'Vehicle idle. The app proposes On Duty and starts a 60 second countdown.',
};

const IMPACT = [
  {
    metric: 'Third party ELD licence',
    before: '$6 per device, per month',
    after: 'Removed',
    source: 'Modelled from the vendor contract',
  },
  {
    metric: 'Apps in a driver’s shift',
    before: 'Two, with two logins',
    after: 'One',
    source: 'Shipped',
  },
  {
    metric: 'Unassigned driving logs',
    before: 'Baseline',
    after: '41% lower',
    source: 'Modelled, 90 day projection',
  },
  {
    metric: 'Roadside log handoff',
    before: 'Walk the officer through the app, about 2 minutes',
    after: 'Inspector mode, under 30 seconds',
    source: 'Usability testing, 8 drivers',
  },
  {
    metric: 'Logs certified inside 24 hours',
    before: '61%',
    after: '88%',
    source: 'Modelled',
  },
  {
    metric: 'Flows shipped',
    before: 'None native',
    after: '15+ across phone, tablet and in cab monitor',
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
          Netradyne Driver<span className="text-[var(--accent)]">&bull;</span>i &nbsp;/&nbsp; ELD
          compliance
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[15ch]">
          Taking Hours of Service in&#8209;house.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[46ch]">
          FMCSA compliant logging, inside the driver app our customers already had. So 270,000
          drivers stopped paying for a second one.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Lead product designer" note="Discovery, flows, UI, design QA" />
          <Field label="Team" value="1 designer, 1 PM, 6 engineers" note="App and web portal" />
          <Field label="Duration" value="About 7 months" note="Discovery to first fleet" />
          <Field label="Surfaces" value="iOS, Android, in cab monitor, web" note="49 CFR Part 395" />
        </motion.dl>
      </div>
    </header>
  );
}

function HeroProof() {
  const reduced = useReducedMotion();
  const shots = [
    { src: dashOnDuty, alt: 'Driver dashboard with duty status set to On Duty and remaining hours' },
    { src: dashDriving, alt: 'Driver dashboard in the Driving state with the drive clock counting down' },
    { src: dashLogs, alt: 'The twenty four hour log grid with the day’s duty entries' },
  ];

  return (
    <div className="case-shell pt-14 sm:pt-20">
      <div className="case-wide">
        <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-[760px]">
          {shots.map((s, i) => (
            <motion.div
              key={s.alt}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(6px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: 'spring', visualDuration: 0.5, bounce: 0, delay: 0.06 * i }}
            >
              <ProofShot src={s.src} alt={s.alt} aspect={SHOT} />
            </motion.div>
          ))}
        </div>
        <p className="case-caption mt-4 max-w-[52ch]">
          The three states a driver lives in: duty clocks, drive countdown, log grid.
        </p>
      </div>
    </div>
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

const HoursOfServiceV2 = () => {
  useProjectAnalytics('Hours of Service 2.0');

  const scenes = [
    {
      id: 'start',
      tab: 'Shift start',
      time: '06:30',
      title: 'Two drivers, one truck, four things already owed',
      body:
        'Gajeel claims the active driver seat, Laxus joins as co driver on the same device. Before the wheels turn the app clears what it knows is owed: yesterday’s logs, the inspection, the trailer, the shipping document. Queued as tasks, not modals, so a late driver can still start the engine.',
      detail: [
        {
          label: 'What this had to survive',
          value:
            'Clearing a selection, a vehicle another driver already claimed, shipping document length, a yard with no signal. Defects not repaired stop the shift; repaired ones need a signature.',
        },
      ],
      frames: [
        { src: frameShiftA, alt: 'Story frame: a driver waiting at dusk for the co driver to arrive' },
        { src: frameShiftB, alt: 'Story frame: both drivers at the truck before the shift' },
      ],
      media: (
        <ProofShot
          src={dashOnDuty}
          alt="Driver dashboard at shift start, showing pending tasks and duty clocks"
          aspect={SHOT}
          caption="Pending tasks sit under the clocks, not in front of them."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
    {
      id: 'auto',
      tab: 'Automation',
      time: '16:00',
      title: 'The vehicle stopped. The log has 60 seconds to catch up.',
      body:
        'Gajeel pulls over to check the route. The app notices the vehicle is idle and offers to move him to On Duty, with a countdown running while he decides.',
      detail: [
        { label: 'On motion', value: 'On Duty becomes Driving, with the same 60 second window.' },
        { label: 'On idle', value: 'Driving becomes On Duty. Personal conveyance and yard move stay manual.' },
      ],
      frames: [
        { src: frameDriveA, alt: 'Story frame: a stop to check the route' },
        { src: frameDriveB, alt: 'Story frame: the countdown prompt appearing in the cab' },
      ],
      media: (
        <ProofVideo
          src={videoAutoChange}
          label="Automatic duty status change with a sixty second override"
          aspect={CLIP}
          caption="The countdown is the receipt. The driver can always disagree with it."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
    {
      id: 'swap',
      tab: 'Break and swap',
      time: '16:30',
      title: 'Sleeper berth, and the wheel changes hands',
      body:
        'Gajeel moves to the sleeper berth and Laxus takes the active driver seat: two duty status changes on one device. That is also the moment the day becomes editable history, annotated and recertifiable, with a trail on every edit.',
      detail: [
        { label: 'Certification', value: 'Daily, with a hard 14 day backlog rule. An edit after certification forces a recertification.' },
        { label: 'Manager edits', value: 'A manager proposes a change from the web portal; the driver accepts or rejects it. Nobody rewrites a driver’s day without their name on it.' },
      ],
      frames: [
        { src: frameSwapA, alt: 'Story frame: the driver moving to the sleeper berth' },
        { src: frameSwapB, alt: 'Story frame: the co driver taking the wheel' },
      ],
      media: (
        <ProofVideo
          src={videoCertification}
          label="Certifying a day of logs"
          aspect={CLIP}
          caption="Certification, and the recertification an edit forces."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
    {
      id: 'stop',
      tab: 'Roadside',
      time: '21:10',
      title: 'A stranger with a badge, using a driver’s phone',
      body:
        'A police car halts the trip and the officer asks for the logs. Gajeel hands over the phone in inspector mode, not the app, and gets it back still locked.',
      detail: [
        { label: 'Data transfer', value: 'Web services and email, both in the inspection view, so nobody hunts for a settings screen at the window.' },
      ],
      frames: [
        { src: frameStopA, alt: 'Story frame: a police car pulling the truck over' },
        { src: frameStopB, alt: 'Story frame: the officer asking to see the log records' },
      ],
      media: (
        <ProofVideo
          src={videoInspectorMode}
          label="Inspector mode and the FMCSA data transfer"
          aspect={CLIP}
          caption="One tap in, credentials to get out."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
  ];

  return (
    <CaseShell
      project="Hours of Service"
      nextTitle="Vehicle Health"
      nextHref="/projects/vehicle-health-2"
      longFormHref="/projects/hours-of-service"
      nextBlurb="Preventive maintenance and defect management, from the driver’s inspection to the technician’s bay."
    >
      <Masthead />
      <HeroProof />

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          Every figure carries how it was arrived at. Modelled means projected, not audited.
        </p>
      </Section>

      <Section kicker="The brief" title="A compliance feature we were renting">
        <p className="case-body">
          Driveri shipped a native driver app that did not do Hours of Service. For that, every
          driver opened Geotab: a second login, a second mental model, a licence at{' '}
          <strong>$6 per device per month</strong>, and our own driving data leaving the building to
          make it work.
        </p>
        <p className="case-body mt-5">
          The target was FMCSA 49 CFR Part 395. Not a feature request, a rulebook: duty cycles,
          violation detection, malfunction events, log certification, and a roadside transfer that
          works while an officer stands at the window. Getting it wrong puts a fleet out of service.
        </p>

        <div className="case-panel mt-8 p-5 sm:p-6">
          <p className="case-kicker mb-3">The number that funded the project</p>
          <p className="case-data text-[15px] leading-[1.9] text-[var(--ink)]">
            monthly = devices &times; $6
            <br />
            annual = devices &times; $6 &times; 12
          </p>
          <hr className="case-rule my-4" />
          <p className="case-body text-[15px]">
            A thousand truck fleet pays <strong>$72,000 a year</strong> to rent a screen we could
            draw ourselves. The business case wrote itself. The design case was the harder one.
          </p>
        </div>

        <Pull cite="The constraint I wrote on the wall before the first flow">
          Replace the vendor without asking a single driver to relearn their day.
        </Pull>

        <div className="grid sm:grid-cols-2 gap-5 mt-2">
          <ProofShot
            src={legacyHome}
            alt="The legacy Driveri home screen, largely unchanged since launch"
            aspect="326 / 664"
            caption="The legacy dashboard. Years of features added one at a time."
            className="max-w-[236px] sm:max-w-none"
          />
          <ProofShot
            src={dashDriving}
            alt="The rebuilt driver dashboard with the duty clocks and drive countdown"
            aspect={SHOT}
            caption="The rebuild. Same app, the clocks finally on it."
            className="max-w-[236px] sm:max-w-none"
          />
        </div>
      </Section>

      <Section
        title="Three calls that shaped the build"
        intro="Everything else was execution. These three were arguments."
        wide
      >
        <Decision
          index="01"
          kicker="Familiarity against correction"
          title="Keep the competitor's shape. Spend the whole redesign budget on three screens."
          tension="Jacob's Law says drivers arrive expecting the patterns they already use. But those patterns were also where the errors came from. Improve too much and you retrain 270,000 people paid by the mile. Improve too little and you ship someone else's bugs under our logo."
          call="I kept the vendor's information architecture for the log grid, the duty control and certification, so muscle memory transferred on day one, then spent the entire redesign budget on the three screens support tickets came from: duty status change, unassigned logs, roadside handoff."
          result="Pilot fleets needed no retraining programme. The three rebuilt screens are the three this case study is about."
        >
          <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-[760px]">
            <ProofShot src={geotab} alt="Geotab Hours of Service interface, reviewed as a benchmark" aspect="4 / 3" contain />
            <ProofShot src={samsara} alt="Samsara Hours of Service interface, reviewed as a benchmark" aspect="4 / 3" contain />
            <ProofShot src={lytx} alt="Lytx Hours of Service interface, reviewed as a benchmark" aspect="4 / 3" contain />
          </div>
          <p className="case-caption mt-3">
            Geotab, Samsara and Lytx. Studied for what drivers already expect, not for what to copy.
          </p>
        </Decision>

        <Decision
          index="02"
          kicker="Automation against authorship"
          title="Let the system change the duty status, and give the driver 60 seconds to disagree."
          tension="The largest source of unassigned logs is a driver who forgets to flip a switch. Automating it closes the compliance gap and opens another: a log the driver did not author, then has to certify under penalty of perjury."
          call="The device already knew whether the vehicle was moving, so the app proposes the change rather than making it, shows a 60 second countdown, and records any override. Personal conveyance and yard move stay manual: those are claims a driver has to mean."
          result="Fewer unassigned logs without taking authorship from the person who signs the record. The countdown is the design: automation with a receipt."
        >
          <div className="grid lg:grid-cols-[236px_minmax(0,1fr)] gap-6 items-start">
            <ProofVideo
              src={videoAutoChange}
              label="Automatic duty status change with a sixty second override"
              aspect={CLIP}
              className="max-w-[236px] lg:max-w-none"
            />
            <DutyLogGraph
              entries={DUTY_DAY}
              event={DUTY_EVENT}
              caption="A compliant two driver day. Tap or hover any segment for its entry."
            />
          </div>
        </Decision>

        <Decision
          index="03"
          kicker="Helpfulness against exposure"
          title="Design the roadside handoff for the officer, not for the driver."
          tension="Inspector mode is used once, by a stranger with a badge, under pressure, on a driver's personal phone. Every affordance that helps in normal use, edit, annotate, switch driver, is a liability in that minute."
          call="A separate locked mode. One tap from the dashboard, eight days of logs read only at tablet scale, the FMCSA data transfer in the same view, and no way back without the driver's credentials."
          result="The handoff went from walking an officer through a live app to handing over a phone. Under 30 seconds in testing, with the account never exposed."
        >
          <div className="grid grid-cols-2 sm:grid-cols-[236px_236px] gap-4 sm:gap-6">
            <ProofVideo src={videoInspectorMode} label="Inspector mode" aspect={CLIP} />
            <ProofShot
              src={dataTransfer}
              alt="The FMCSA data transfer screen, offering web services and email"
              aspect={SHOT}
              caption="Data transfer lives inside the inspection view."
            />
          </div>
        </Decision>
      </Section>

      <Section
        title="Four moments, and what the app owes the driver in each"
        intro="More than fifteen flows shipped. These four carry the argument."
        wide
      >
        <SceneTabs scenes={scenes} />
      </Section>

      <Section title="Roughly half of these drivers are on a tablet" wide>
        <p className="case-body">
          Fleets hand out tablets and in cab monitors as often as drivers use their own phone. A
          stretched layout reads as an afterthought at eleven hours a day, so the log grid, the duty
          control and inspector mode each got their own.
        </p>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_236px] gap-6 mt-8 items-start">
          <ProofShot
            src={inCabMonitor}
            alt="The in cab monitor layout, with the log grid and duty control side by side"
            aspect="2277 / 1605"
            caption="In cab monitor, 786px to 1056px. The grid and the control sit side by side."
          />
          <ProofVideo
            src={videoLogRecords}
            label="Browsing and editing log records on the phone"
            aspect={CLIP}
            caption="Phone, 360px to 786px."
            className="max-w-[236px] sm:max-w-none"
          />
        </div>
      </Section>

      <Section kicker="Impact" title="What changed, and how confident I am about it" wide>
        {/* Four columns need about 620px to keep their shape, and a horizontal
            scroll with a hidden scrollbar would put the After and Basis columns,
            the two that carry the argument, off the right edge of a phone with
            nothing to say so. Below md each row becomes its own block instead. */}
        <div className="md:hidden flex flex-col border-t border-[var(--rule-strong)]">
          {IMPACT.map((row) => (
            <div key={row.metric} className="py-4 border-b border-[var(--rule)]">
              <p className="text-[15px] leading-[1.4] tracking-[-0.01em] text-[var(--ink)]">
                {row.metric}
              </p>
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
                  <th
                    key={h}
                    className="case-kicker font-normal py-3 pr-5 border-b border-[var(--rule-strong)] align-bottom"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMPACT.map((row) => (
                <tr key={row.metric}>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top text-[15px] leading-[1.45] text-[var(--ink)]">
                    {row.metric}
                  </td>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top case-body text-[14px]">
                    {row.before}
                  </td>
                  <td className="py-4 pr-5 border-b border-[var(--rule)] align-top text-[15px] leading-[1.45] text-[var(--accent)]">
                    {row.after}
                  </td>
                  <td className="py-4 border-b border-[var(--rule)] align-top case-caption">
                    {row.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Aside label="On the numbers">
          Figures marked modelled are projections from the rollout model, not audited results. I
          have left the label on because a portfolio number with no provenance is just a claim.
        </Aside>
      </Section>

      <Section title="Three things I would do differently">
        <ol className="flex flex-col">
          {[
            {
              head: 'I benchmarked three competitors before I talked to one driver.',
              body:
                'Two weeks of competitive research produced a confident information architecture and very little insight. The personas and cabin study that actually changed the flows landed afterwards.',
            },
            {
              head: 'The 60 second override window was a guess.',
              body:
                'It came from a reasonable argument about how long a driver needs to notice a prompt at a loading dock, and shipped without instrumentation. The first thing I would add is the distribution of override times.',
            },
            {
              head: 'The in cab monitor got a stretched layout for too long.',
              body:
                'About half of these drivers use a tablet class device. It deserved its own layout in the first sprint, not a pass near the end, and the log grid is what suffered.',
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

export default HoursOfServiceV2;
