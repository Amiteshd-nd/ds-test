import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import { useEnter } from '../../components/case/useEnter';
import StatRow from '../../components/case/StatRow';
import StageFlow from '../../components/case/StageFlow';
import SceneTabs from '../../components/case/SceneTabs';
import { ProofVideo, ProofShot } from '../../components/case/ProofMedia';

import dashboardHero from '../../assets/images/projects/vehicle-health/cover-photo.webp';
import personaMacao from '../../assets/images/projects/vehicle-health/persona-macao.webp';
import personaGray from '../../assets/images/projects/vehicle-health/persona-gray.webp';
import personaNatsu from '../../assets/images/projects/vehicle-health/persona-natsu.webp';

import framePaperA from '../../assets/images/projects/vehicle-health/arc1-scene1-b1.webp';
import framePaperB from '../../assets/images/projects/vehicle-health/arc1-s2b1.webp';
import frameRollout from '../../assets/images/projects/vehicle-health/arc2-t1b1.webp';
import frameFloor from '../../assets/images/projects/vehicle-health/arc2-image6.webp';
import frameRepeat from '../../assets/images/projects/vehicle-health/arc2-s3b1.webp';
import frameDesk from '../../assets/images/projects/vehicle-health/arc1-s2b2.webp';

/* `assigning-technician-pmi.mov` is byte for byte the same file as the dashboard
   clip, so only one of the pair is imported here. */
import videoInspect from '../../assets/videos/technician-inspecting-defects.mov';
import videoAssignDesktop from '../../assets/videos/assigning-technician-dashboard.mov';
import videoAssignTablet from '../../assets/videos/assigning-technician-tablet.mov';
import videoAssignMobile from '../../assets/videos/assigning-technician-mobile.mov';
import videoApprove from '../../assets/videos/approving-inspection.mov';

const DESKTOP = '2098 / 1368';
const APPROVE = '2266 / 1338';
const PHONE = '882 / 1582';
const TABLET = '1096 / 1670';
const MOBILE = '654 / 1358';

const STATS = [
  { value: '2 days to live', label: 'Delay before a manager sees an inspection result', source: 'shipped' },
  { value: '10% to 0', label: 'Defects lost in a verbal handoff to a technician', source: 'shipped' },
  { value: '35%', label: 'Fewer defects left unresolved or recurring', source: 'modelled' },
  { value: '40%', label: 'Faster inspection on the technician’s own phone', source: 'modelled' },
];

/* The product in one object. Reported and Closed bracket it; Assigned is where
   it used to fall apart, which is why the accent lives there. */
const STAGES = [
  {
    key: 'reported',
    name: 'Reported',
    owner: 'Technician',
    was: 'A line on a paper checklist, with nothing to show what was actually wrong.',
    now: 'A checklist item that cannot be failed without a photo attached.',
  },
  {
    key: 'assigned',
    name: 'Assigned',
    owner: 'Manager',
    was: 'A manager telling someone on the floor. Roughly one defect in ten never landed.',
    now: 'Assigned in the system, with a named owner, a due date and a notification.',
  },
  {
    key: 'repaired',
    name: 'Repaired',
    owner: 'Technician',
    was: 'Done when the technician said it was done, reported whenever they next saw the manager.',
    now: 'Marked on the device the technician already carries, timestamped on the defect.',
  },
  {
    key: 'verified',
    name: 'Verified',
    owner: 'Manager',
    was: 'Rarely a separate step at all. Repaired and closed were the same moment.',
    now: 'A distinct approval. The person who fixed it is not the person who signs it off.',
  },
  {
    key: 'closed',
    name: 'Closed',
    owner: 'System',
    was: 'The record ended wherever the paper did.',
    now: 'Approver, timestamp and repair history, which is what an audit asks for later.',
  },
];

const IMPACT = [
  {
    metric: 'Inspection reaches the manager',
    before: 'Two to three days, on paper',
    after: 'Live, on submit',
    source: 'Shipped',
  },
  {
    metric: 'Inspection sheets lost or damaged',
    before: '15 to 20% a month',
    after: 'The submission is the record',
    source: 'Shipped',
  },
  {
    metric: 'Defect handoff to a technician',
    before: 'Verbal. About 10% never landed',
    after: 'Assigned in system, named owner',
    source: 'Shipped',
  },
  {
    metric: 'Unresolved or recurring defects',
    before: 'Baseline',
    after: '35% lower',
    source: 'Modelled',
  },
  {
    metric: 'Inspection completion time',
    before: 'Paper checklist',
    after: '40% faster on mobile',
    source: 'Modelled, pilot fleet',
  },
  {
    metric: 'Evidence on a failed item',
    before: 'The technician’s word',
    after: 'A photo, required to fail it',
    source: 'Shipped',
  },
  {
    metric: 'Dashboards a manager works across',
    before: 'Two',
    after: 'One, with two lenses',
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
          Netradyne IDMS &nbsp;/&nbsp; Fleet maintenance
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[15ch]">
          Closing the loop on a defect.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[46ch]">
          Paper inspections and verbal repair handoffs, rebuilt as one lifecycle with an owner at
          every stage.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Lead product designer" note="Research, flows, UI, design QA" />
          <Field label="Team" value="1 designer, 1 PM, 5 engineers" note="Web and mobile" />
          <Field label="Duration" value="About 5 months" note="Discovery to first tenant" />
          <Field label="Surfaces" value="Web dashboard, tablet, phone" note="Inspections and defects" />
        </motion.dl>
      </div>
    </header>
  );
}

function HeroProof() {
  const enter = useEnter();

  return (
    <motion.div {...enter} className="case-shell pt-14 sm:pt-20">
      <div className="case-wide">
        <ProofShot
          src={dashboardHero}
          alt="The IDMS vehicle list with inspections, defect counts and an inspection drawer open"
          aspect="2280 / 1050"
        />
        <p className="case-caption mt-4 max-w-[52ch]">
          The vehicle list, with the inspection drawer open over it. One row per vehicle, whichever
          lens you are looking through.
        </p>
      </div>
    </motion.div>
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

const VehicleHealthV2 = () => {
  useProjectAnalytics('Vehicle Health 2.0');

  const scenes = [
    {
      id: 'inspect',
      tab: 'Inspect',
      time: '07:10',
      title: 'Gray walks the vehicle with the checklist on his phone',
      body:
        'A failed item will not submit without a photo, so the cracked windshield arrives as an image rather than a line of handwriting. Progress saves on every tap, because a yard with no signal should not cost him the whole walk.',
      detail: [
        {
          label: 'Who this is',
          value: 'Gray F., maintenance technician. On the floor, one hand on the phone, the other on the truck.',
        },
      ],
      frames: [
        { src: framePaperA, alt: 'Story frame: morning inspections recorded on paper' },
        { src: frameRollout, alt: 'Story frame: the team rolling out the digital inspection' },
      ],
      media: (
        <ProofVideo
          src={videoInspect}
          label="A technician running a digital inspection and marking defects"
          aspect={PHONE}
          caption="A fail needs a photo before it will submit."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
    {
      id: 'assign',
      tab: 'Assign',
      time: '07:25',
      title: 'The submission is already on Macao’s dashboard',
      body:
        'He opens the inspection from the vehicle row, reads the defect with its photo attached, and assigns Natsu from the same drawer. The fleet list stays behind it, because that is the view he is actually working from.',
      detail: [
        {
          label: 'Why a drawer, not a page',
          value: 'A manager triaging a morning of inspections should not lose their place in the list to act on one of them.',
        },
      ],
      frames: [
        { src: framePaperB, alt: 'Story frame: the manager working through paper inspection records' },
        { src: frameDesk, alt: 'Story frame: rows of inconsistent logs on the manager’s desk' },
      ],
      media: (
        <ProofVideo
          src={videoAssignDesktop}
          label="A manager assigning a technician from the inspection drawer"
          aspect={DESKTOP}
          caption="Assigned from the row, without leaving the list."
        />
      ),
    },
    {
      id: 'repair',
      tab: 'Repair',
      time: '09:40',
      title: 'Natsu picks the task up on the tablet he carries',
      body:
        'Same defect, same photo, now with a due date and his name against it. He marks it repaired on the device in his hand rather than reporting it the next time he passes the office.',
      detail: [
        {
          label: 'Same object, three widths',
          value: 'The fleet decides which device a technician gets, so the assignment view is the same thing at every width rather than a desktop screen squeezed down.',
        },
      ],
      frames: [
        { src: frameFloor, alt: 'Story frame: a technician checking the app on the maintenance floor' },
        { src: frameRepeat, alt: 'Story frame: a technician spotting a repeated repair task' },
      ],
      media: (
        <ProofVideo
          src={videoAssignTablet}
          label="The assignment flow on a tablet"
          aspect={TABLET}
          caption="The tablet version of the same drawer."
          className="max-w-[236px] lg:max-w-none"
        />
      ),
    },
    {
      id: 'verify',
      tab: 'Verify',
      time: '14:05',
      title: 'Macao approves the repair, and the defect closes',
      body:
        'Verification is deliberately not the technician’s to give. Approval writes the approver, the timestamp and the repair record onto the defect, which is the part an audit asks for months later.',
      detail: [
        {
          label: 'Why it is a separate stage',
          value: 'Collapsing Repaired and Verified into one status is how a defect gets closed by the only person with a reason to close it.',
        },
      ],
      frames: [
        { src: frameRepeat, alt: 'Story frame: the manager reviewing an update in real time' },
        { src: frameRollout, alt: 'Story frame: the team on the new digital maintenance system' },
      ],
      media: (
        <ProofVideo
          src={videoApprove}
          label="A manager approving a completed inspection"
          aspect={APPROVE}
          caption="Approval is what closes the loop on the record."
        />
      ),
    },
  ];

  return (
    <CaseShell
      project="Vehicle Health"
      nextTitle="Hours of Service"
      nextHref="/projects/hours-of-service-2"
      longFormHref="/projects/vehicle-health"
      nextBlurb="Taking FMCSA Hours of Service in-house for 270,000 drivers, and retiring a per-device vendor."
    >
      <Masthead />
      <HeroProof />

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          Every figure carries how it was arrived at. Modelled means projected, not audited.
        </p>
      </Section>

      <Section kicker="The brief" title="Defects were being logged, not closed">
        <p className="case-body">
          Fleets ran maintenance on paper or on a second vendor tool. Inspection sheets went missing
          at <strong>15 to 20% a month</strong>, a manager saw yesterday&#8217;s walkaround two or
          three days late, and about <strong>one defect in ten</strong> never reached a technician
          because the handoff was a conversation on the floor.
        </p>
        <p className="case-body mt-5">
          The instinct was to build better forms. But the forms were not the failure. Defects were
          captured reliably and resolved unreliably, and the gap between those two facts is a
          handoff nobody owned.
        </p>

        <Pull cite="The line the defect lifecycle came out of">
          A defect that nobody owns is a defect that nobody closes.
        </Pull>

        <div className="grid grid-cols-3 gap-4 sm:gap-6 max-w-[520px]">
          {[
            { src: personaMacao, name: 'Macao G.', role: 'Maintenance manager' },
            { src: personaGray, name: 'Gray F.', role: 'Maintenance technician' },
            { src: personaNatsu, name: 'Natsu D.', role: 'Maintenance technician' },
          ].map((p) => (
            <figure key={p.name} className="flex flex-col">
              <div className="case-figure" style={{ aspectRatio: '1 / 1' }}>
                <img
                  src={p.src}
                  alt={`${p.name}, ${p.role}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className="case-caption mt-2.5">
                {p.name}
                <span className="block">{p.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        title="Three calls that shaped the build"
        intro="Everything else was execution. These three were arguments."
        wide
      >
        <Decision
          index="01"
          kicker="Adjacency against focus"
          title="Merge maintenance into the safety dashboard instead of shipping a second product."
          tension="Our customers already lived in the safety dashboard all day. A separate maintenance tool would have been a second login and a second mental model, which is the exact problem we were selling against. But merging means maintenance inherits a product organised around driver events, not vehicles."
          call="One dashboard, two lenses. Safety and Maintenance became views over the same fleet, with the vehicle as the object both of them hang off. Nothing about a defect needed a new place to live."
          result="Managers stopped switching windows. The vehicle row is now the one place a hard braking event and an overdue inspection sit next to each other."
        >
          <ProofShot
            src={dashboardHero}
            alt="The vehicle list showing due inspections, DVIRs, DTCs, alerts and defect counts in one header"
            aspect="2280 / 1050"
            caption="Due PMIs, DVIRs, DTCs, alerts and defects, counted across one fleet in one header."
          />
        </Decision>

        <Decision
          index="02"
          kicker="Logging against closing"
          title="Give the defect a lifecycle, and give every stage an owner."
          tension="Defects were logged reliably and resolved unreliably. Roughly one in ten never reached a technician at all, because the handoff was a manager telling someone on the floor. Better forms do not fix a handoff."
          call="Five stages, each with a named owner, a timestamp and a notification. A defect cannot sit in a stage without someone&#8217;s name against it, and Verified is separate from Repaired on purpose."
          result="The loop closes on the record rather than in a conversation, and 35% fewer defects are left unresolved or recurring."
        >
          <StageFlow
            stages={STAGES}
            brokeAt="assigned"
            tableTitle="The five stages as a table"
            caption="Tap or hover a stage for what it used to be. The accent marks where defects were lost."
          />
        </Decision>

        <Decision
          index="03"
          kicker="Compliance against entry cost"
          title="Design the technician's screen for one hand, on a floor, beside a truck."
          tension="Technicians skipped or deferred inspections, and it read as a discipline problem. It was a data entry problem: the forms were long, desktop shaped, and offered no way to record what was actually wrong beyond a tick in a box."
          call="A guided mobile checklist with pass and fail toggles, progress saved on every tap, and a photo required to fail an item. The photo is the part that matters. It turns a technician's claim into a record a manager can act on without a phone call."
          result="40% faster completion, and a defect that arrives with its own evidence attached."
        >
          <div className="grid grid-cols-2 sm:grid-cols-[236px_236px] gap-4 sm:gap-6">
            <ProofVideo src={videoInspect} label="Digital inspection on a phone" aspect={PHONE} />
            <ProofVideo
              src={videoAssignMobile}
              label="The assignment flow on a phone"
              aspect={MOBILE}
              caption="Inspection and assignment, both at phone width."
            />
          </div>
        </Decision>
      </Section>

      <Section
        title="Four hands on one defect"
        intro="More than ten flows shipped. These four are the loop."
        wide
      >
        <SceneTabs scenes={scenes} />
      </Section>

      <Section title="One flow, three widths" wide>
        <p className="case-body">
          Managers work from a desk. Technicians work beside a vehicle, on whatever the fleet handed
          them. The assignment flow is the same object at all three widths rather than a desktop
          screen squeezed down to fit.
        </p>
        {/* Bottom aligned: three real device shapes have three different heights, and
            standing them on one baseline reads as a shelf rather than as a ragged row.
            It also lines the captions up with each other. */}
        <div className="grid sm:grid-cols-[minmax(0,1fr)_180px_150px] gap-5 sm:gap-6 mt-8 items-end">
          <ProofVideo
            src={videoAssignDesktop}
            label="Assigning a technician on the desktop dashboard"
            aspect={DESKTOP}
            caption="Desktop. The manager&#8217;s view."
          />
          <ProofVideo
            src={videoAssignTablet}
            label="Assigning a technician on a tablet"
            aspect={TABLET}
            caption="Tablet. Carried on the floor."
            className="max-w-[236px] sm:max-w-none"
          />
          <ProofVideo
            src={videoAssignMobile}
            label="Assigning a technician on a phone"
            aspect={MOBILE}
            caption="Phone. Whatever they were given."
            className="max-w-[200px] sm:max-w-none"
          />
        </div>
      </Section>

      <Section kicker="Impact" title="What changed, and how confident I am about it" wide>
        {/* Four columns need about 620px to keep their shape, so below md each
            row becomes its own block rather than scrolling off the right edge. */}
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
          Figures marked modelled are projections from the pilot fleet, not audited results. The
          before column is measured: it came out of the paper audit that opened the project.
        </Aside>
      </Section>

      <Section title="Three things I would do differently">
        <ol className="flex flex-col">
          {[
            {
              head: 'I designed for three fleet sizes and shipped for one.',
              body:
                'The small, medium and large segmentation was thorough, and the first release only ever served the middle. The modular architecture it justified bought nothing in the MVP.',
            },
            {
              head: 'Predictive maintenance stayed a slide.',
              body:
                'It was in every strategy document and no sprint. Carrying it as a good to have set expectations I could not pay off, and I should have cut it from the story earlier.',
            },
            {
              head: 'Verified is the stage that matters most and I designed it last.',
              body:
                'It is the step that makes the loop closed, and it is still a checkbox. A manager signing off a repair should owe the same evidence we ask a technician for.',
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

export default VehicleHealthV2;
