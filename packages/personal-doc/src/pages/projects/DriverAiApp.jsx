import { motion, useReducedMotion, staggerFor } from '@cloud-march/motion/react';
import useProjectAnalytics from '../../hooks/useProjectAnalytics';
import CaseShell from '../../components/case/CaseShell';
import { Section, Field, Pull, Aside, DrawnRule } from '../../components/case/Primitives';
import StatRow from '../../components/case/StatRow';
import PrototypeEmbed from '../../components/case/PrototypeEmbed';

/*
 * Driver app AI: the look and feel revamp, and the voice agent.
 *
 * Built on the same 2.0 primitives as Hours of Service. The project is still
 * running, so the evidence is the two working prototypes rather than shipped
 * screenshots, and each one sits in the middle of its own section.
 *
 * The counts in STATS are read off the prototypes themselves. The one target is
 * labelled as a target.
 */

const STATS = [
  { value: '7', label: 'Driver personas the assistant is rehearsed against', source: 'Prototype' },
  { value: '4', label: 'Vehicle states that change what it may say', source: 'Prototype' },
  { value: '2', label: 'Languages from day one, English and Español', source: 'Prototype' },
  { value: '0', label: 'Taps asked of a driver while the truck is moving', source: 'Target' },
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
          Netradyne Driver<span className="text-[var(--accent)]">&bull;</span>i &nbsp;/&nbsp; AI
          integration
        </motion.p>

        <motion.h1 {...line(1)} className="case-display mt-5 max-w-[16ch]">
          An assistant in the cab, not another screen.
        </motion.h1>

        <motion.p {...line(2)} className="case-lede mt-6 max-w-[48ch]">
          Rebuilding the driver app around an AI layer, then giving that layer a voice, so a driver
          can ask instead of hunt.
        </motion.p>

        <motion.dl
          {...line(3)}
          className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7 pt-7 border-t border-[var(--rule)]"
        >
          <Field label="Role" value="Lead product designer" note="Concept, prototypes, UI" />
          <Field label="Tracks" value="Two" note="Voice agent and UI revamp" />
          <Field label="Surfaces" value="Phone and tablet" note="Driver•i app" />
          <Field label="Status" value="In progress" note="Prototypes in review" />
        </motion.dl>
      </div>
    </header>
  );
}

/* The section header both tracks share: an index in the margin, the same way
   the Hours of Service decisions are numbered. */
function Track({ index, kicker, title, children }) {
  return (
    <>
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
          <h2 className="case-h2 max-w-[24ch]">{title}</h2>
        </div>
      </div>
      <div className="mt-7 sm:mt-9 sm:pl-[64px]">{children}</div>
    </>
  );
}

function Notes({ items }) {
  return (
    <dl className="grid sm:grid-cols-3 gap-x-8 gap-y-6 mt-8">
      {items.map((item) => (
        <div key={item.label}>
          <DrawnRule />
          <dt className="case-kicker mt-3 mb-2">{item.label}</dt>
          <dd className="case-body text-[15px]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const DriverAiApp = () => {
  useProjectAnalytics('Driver AI App');

  return (
    <CaseShell
      project="Driver AI App"
      nextTitle="Hours of Service"
      nextHref="/projects/hours-of-service-2"
      nextBlurb="FMCSA compliant logging, taken off a per-device vendor and into the driver app."
    >
      <Masthead />

      <Section kicker="Outcomes">
        <StatRow stats={STATS} />
        <p className="case-caption mt-8 max-w-[62ch]">
          Prototype means counted from the working build. Target means a constraint the design is
          held to, not a result.
        </p>
      </Section>

      <Section kicker="The brief" title="Drivers were hunting for answers the app already had">
        <p className="case-body">
          Hours left, a pending log, why a score moved, where to park tonight. All of it lived in
          Driver•i, spread across tabs a driver has to find with a thumb at a loading dock. The
          brief was to put one layer over the app that answers first and navigates second.
        </p>
        <Pull cite="The constraint for both tracks">
          If the truck is moving, the answer has to arrive without a tap.
        </Pull>
      </Section>

      <Section wide>
        <Track index="01" kicker="Voice chat agent" title="AI voice for new customers">
          <p className="case-body">
            A new fleet meets the assistant by talking to it. Ask why a score changed, where to
            park, or say that hard brake was a yellow light, and it answers in context. It delivers
            a spoken shift brief at the start, and a summary at the end. What it is allowed to say
            depends on whether the truck is parked, idling or moving.
          </p>

          <PrototypeEmbed
            src="/prototypes/driver-voice-agent.html"
            title="Driver•i voice agent"
            weight="10.8 MB"
            caption="Pick a persona and a scenario on the left, then set the vehicle state, shift moment and language. The right rail switches between voice and typed chat."
            className="mt-8"
          />

          <Notes
            items={[
              { label: 'Personas', value: 'Long haul, owner operator, regional reefer in Spanish, last mile, vocational, a week one hire, field service.' },
              { label: 'Modifiers', value: 'Skeptical veteran, privacy sensitive, slip seat truck, team drivers, low connectivity, India fleet.' },
              { label: 'Roles', value: 'Driver, safety manager and technician, each hearing a different version of the same day.' },
            ]}
          />

          <Aside label="The edge case it is built around">
            Asked something it cannot answer, the agent says so and hands over, instead of guessing.
            A driver who catches it inventing an answer once stops asking.
          </Aside>
        </Track>
      </Section>
      <Section wide>
        <Track index="02" kicker="Driver app" title="AI look and feel, and a UI revamp">
          <p className="case-body">
            The home screen becomes an AI zone with the next actions already drafted: pending logs,
            unassigned logs, certification. Each is a card to clear, not a menu to open. Below it,
            one prompt for anything else, and GreenZone rendered in the same material so good news
            and bad news read as one system.
          </p>

          <PrototypeEmbed
            src="/prototypes/driver-app-ui-revamp.html"
            title="Driver app, AI look and feel"
            weight="1.2 MB"
            caption="Switch between Home, HoS and Screensaver on the left. The right rail resizes the AI zone and flips GreenZone between positive and negative."
            className="mt-8"
          />

          <Notes
            items={[
              { label: 'AI zone', value: 'Two sizes, so the assistant can step back when the clocks matter more.' },
              { label: 'Action cards', value: 'Generated from the driver’s own backlog, dismissible, never modal.' },
              { label: 'Phone and tablet', value: 'One layout system, checked on both from the first pass.' },
            ]}
          />
        </Track>
      </Section>

    </CaseShell>
  );
};

export default DriverAiApp;
