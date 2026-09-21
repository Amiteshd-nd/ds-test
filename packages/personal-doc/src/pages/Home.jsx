import { motion } from '@cloud-march/motion/react';
import Hero from '../components/Hero';
import FolderCard from '../components/FolderCard';

/*
 * Home 1.0. Three cards, in the portrait variant, on the same folder shape the
 * works list uses so the two pages read as one site.
 */

const FEATURED = [
  {
    title: 'Hours of Service',
    eyebrow: 'Netradyne\nELD compliance',
    subtitle: 'FMCSA logging, in-house',
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
    stat: '13',
    statLabel: 'themes',
    note: 'Live demo',
    palette: 'dusk',
    link: '/home-2.2',
  },
];

const Home = () => (
  <motion.main
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.5 }}
    className="min-h-screen pt-32 pb-32 px-6 sm:px-8"
  >
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-12 md:mb-section">
        <Hero />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-[1120px] mx-auto">
        {FEATURED.map((project, index) => (
          <FolderCard key={project.title} {...project} index={index} variant="tile" />
        ))}
      </div>
    </div>
  </motion.main>
);

export default Home;
