import { motion } from '@cloud-march/motion/react';
import FolderCard from '../components/FolderCard';

/*
 * The work, as a set of folder cards.
 *
 * Each card carries its own headline number and a reading time, so the list
 * answers "is this worth opening" before anything is opened. The artwork is
 * generated per project rather than a pile of unrelated icons, which is what the
 * old list was.
 */

const PROJECTS = [
  {
    title: 'Hours of Service',
    eyebrow: 'Netradyne\nELD compliance',
    subtitle: 'FMCSA logging, in-house',
    description:
      'Taking Hours of Service off a per-device vendor and into the driver app 270,000 drivers already had.',
    stat: '$72K',
    statLabel: 'saved a year',
    note: '3 min read',
    palette: 'citrus',
    link: '/projects/hours-of-service-2',
  },
  {
    title: 'Vehicle Health',
    eyebrow: 'Netradyne\nFleet maintenance',
    subtitle: 'A defect, closed properly',
    description:
      'Paper inspections and verbal repair handoffs, rebuilt as one lifecycle with an owner at every stage.',
    stat: '35%',
    statLabel: 'fewer open defects',
    note: '3 min read',
    palette: 'ember',
    link: '/projects/vehicle-health-2',
  },
  {
    title: 'Ask Amitesh',
    eyebrow: 'This site\nHome 2.2',
    subtitle: 'A portfolio you can talk to',
    description:
      'This portfolio as a chat surface, with a liquid-glass prompt bar and thirteen swappable design systems.',
    stat: '13',
    statLabel: 'themes',
    note: 'Live demo',
    palette: 'dusk',
    link: '/home-2.2',
  },
  {
    title: 'Museum',
    eyebrow: 'This site\nRendering',
    subtitle: 'The assets, on plinths',
    description:
      'A glass cube raymarched in WebGL and the point-cloud material it replaced, live and documented.',
    stat: '2',
    statLabel: 'shaders',
    note: 'Live demo',
    palette: 'steel',
    link: '/museum',
  },
  {
    title: 'Bangalore Times',
    eyebrow: 'Side project\nGame',
    subtitle: 'Namma Quest',
    description: 'A casual social game set in Bangalore, built with Phaser and React.',
    stat: '1',
    statLabel: 'city',
    note: 'Playable',
    palette: 'moss',
    link: '/game/bangalore-times',
  },
  {
    title: 'Gazebo Design System',
    eyebrow: 'Netradyne\nDesign system',
    subtitle: 'One library, many surfaces',
    description:
      'The running component library behind Gazebo, published as a Storybook rather than a Figma page.',
    stat: 'Live',
    statLabel: 'design.gaz3bo.com',
    note: 'Storybook',
    palette: 'tide',
    link: 'https://design.gaz3bo.com',
  },
  {
    title: 'Gazebo Complex Organisms',
    eyebrow: 'Gazebo\nDesign system',
    subtitle: 'The hard components',
    description:
      'Six composite organisms for a hiring platform, specified once and published as a live library.',
    stat: '6',
    statLabel: 'organisms',
    note: '3 min read',
    palette: 'tide',
    link: '/projects/gazebo-complex-organisms-2',
  },
  {
    title: 'Vending Analytics',
    eyebrow: 'Kellogg\u2019s\nRetail analytics',
    subtitle: 'A dashboard in one hand',
    description:
      'Dense desktop retail analytics, rebuilt for a sales rep in an aisle with a phone and ninety seconds.',
    stat: '0',
    statLabel: 'metrics dropped',
    note: '2 min read',
    palette: 'steel',
    link: '/projects/vending-analytics-2',
  },
  {
    title: 'Telugu Streaming',
    eyebrow: 'Client work\nUnder NDA',
    subtitle: 'Paying and watching',
    description:
      'Subscription and language onboarding for a regional platform, built for four languages and how India pays.',
    stat: '4',
    statLabel: 'languages',
    note: '3 min read',
    palette: 'rose',
    link: '/projects/telugu-streaming-2',
  },
  {
    title: 'Behance',
    eyebrow: 'Elsewhere\nProfile',
    subtitle: 'Earlier work',
    description: 'Previous work that does not have a case study here.',
    stat: '↗',
    statLabel: 'behance.net',
    note: 'External',
    palette: 'dusk',
    link: 'https://www.behance.net/archisapien',
  },
];

const Works = () => (
  <motion.main
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.5 }}
    className="min-h-screen pt-32 pb-32 px-6 sm:px-8"
  >
    <div className="max-w-[1135px] mx-auto">
      <div className="max-w-[760px] mx-auto grid gap-6 sm:gap-8">
        {PROJECTS.map((project, index) => (
          <FolderCard key={project.title} {...project} index={index} />
        ))}
      </div>

      <footer className="text-center mt-16">
        <p
          className="font-outfit text-base leading-[1.34em]"
          style={{ letterSpacing: '-0.32px', color: 'var(--site-fg-2)' }}
        >
          © 2025 Made with ❤️ by Amitesh using Claude code and Figma MCP
        </p>
      </footer>
    </div>
  </motion.main>
);

export default Works;
