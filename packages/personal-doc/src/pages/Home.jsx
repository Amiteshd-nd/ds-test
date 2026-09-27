import { motion } from '@cloud-march/motion/react';
import Hero from '../components/Hero';
import FolderCard from '../components/FolderCard';
import HeroPrompt from '../components/HeroPrompt';

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
    locked: true,
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
    locked: true,
  },
  /* Ask Amitesh used to sit here. The hero now opens straight into it, so the
     card was pointing at the thing directly above it — this slot is worth more
     spent on work that has nowhere else to appear on the home page. */
  {
    title: 'Gazebo Design System',
    eyebrow: 'Netradyne\nDesign system',
    subtitle: 'One library, many surfaces',
    stat: 'Live',
    statLabel: 'design.gaz3bo.com',
    note: 'Storybook',
    palette: 'tide',
    link: 'https://design.gaz3bo.com',
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
    {/*
      * A flex column purely so the ask box can change places below the tablet
      * breakpoint. Nothing else about the stack depends on it: three block
      * children in source order lay out identically either way.
      */}
    <div className="max-w-[1400px] mx-auto flex flex-col">
      <div className="mb-12 md:mb-section">
        <Hero />
      </div>

      {/* 1014, not 1120: the cards are 10% narrower, the gaps between them are
          not. Scaling the whole grid would have taken 10% off the gutters too
          and the row would read tighter rather than smaller. */}
      {/* `w-full` is load-bearing now that the parent is a flex column: an
          auto inline margin on a flex item switches off cross-axis stretch, so
          without it the grid falls back to fit-content and collapses to the
          width of its narrowest content. */}
      {/*
        * Fixed columns, reflowing count — not fractional columns that stretch.
        *
        * `sm:grid-cols-2 lg:grid-cols-3` sized each card as a share of whatever
        * width was going, so the card was a different size at almost every
        * viewport: about 276px at the 2-column breakpoint, 467px just under
        * 1024, then snapping back to 317 the moment the third column appeared.
        * The artwork, the tab and the type inside are all tuned for one size.
        *
        * `auto-fit` at a fixed track holds that size and drops a column when
        * there is no longer room for it, which is the behaviour you actually
        * want: three across, then two, then one, never a resized card. The
        * track is the exact 3-up width — (1014 - two 32px gaps) / 3 — written
        * as the arithmetic so it stays true if the container or gap changes.
        *
        * `min(…, 100%)` is the floor for phones narrower than the card itself:
        * below roughly 365px the track would otherwise overflow the gutter, so
        * it gives up and fills instead.
        */}
      <div
        className="order-2 mx-auto grid w-full max-w-[1014px] justify-center gap-8 min-[1080px]:order-none"
        style={{ gridTemplateColumns: 'repeat(auto-fit, min(calc((1014px - 64px) / 3), 100%))' }}
      >
        {FEATURED.map((project, index) => (
          <FolderCard key={project.title} {...project} index={index} variant="tile" />
        ))}
      </div>

      {/*
        * On a tablet and up the ask box reads as the next thing to do after the
        * three cards: those are the curated answers, this is for everything
        * they do not cover.
        *
        * Under 1080px it moves up to sit directly under the headline, ahead of
        * the cards. That threshold is the cards' doing rather than a device
        * size: 1080 is roughly where the third column stops fitting, and once
        * the row wraps, "after the cards" starts meaning "off the bottom of
        * the page" — the one control that answers an arbitrary question was
        * the thing nobody would ever see. It still comes after the headline
        * rather than before it: the page has to say what it is before it
        * offers a box to type into, and a bare input above the title reads as
        * a search bar bolted onto the top of the site.
        *
        * `order` rather than a second copy of the component, so there is one
        * input with one piece of state and nothing remounts when a phone is
        * rotated past the breakpoint. The cost is that below 1080 the tab
        * order still follows the source and reaches the box after the cards.
        * That is the right way round of the trade: reordering the source
        * instead would move the mismatch onto the widest layouts, where
        * keyboard navigation is by far the most common.
        */}
      <div className="order-1 mx-auto mb-12 w-full max-w-[560px] min-[1080px]:order-none min-[1080px]:mb-0 min-[1080px]:mt-12">
        <HeroPrompt />
      </div>
    </div>
  </motion.main>
);

export default Home;
