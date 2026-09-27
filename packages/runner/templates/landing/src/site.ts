/**
 * The content of this site. This is the file you edit.
 *
 * Everything below is example content for a fictional two-person surveying
 * practice, here so the template renders something real out of the box. Replace
 * all of it. Leaving any of it in place is how a generated site ends up
 * advertising a business that does not exist.
 *
 * `assertSite` runs at build time and fails the build on the rules that matter
 * (see src/guard.ts). Read its error message: it says what to change.
 */

import { assertSite } from './guard';
import type { Site } from './types';

export const site: Site = assertSite({
  design: {
    palette: 'forest',
    type: 'grotesk',
    rhythm: 'split',
    radius: 'sharp',
  },

  meta: {
    title: 'Halstead & Rowe - damp and timber surveys in Bristol',
    description:
      'Independent damp, timber and structural moisture surveys for Bristol and Bath. Two surveyors, no sales team, no tie to a treatment contractor.',
  },

  brand: {
    name: 'Halstead & Rowe',
    tagline: 'Independent damp and timber surveys, Bristol and Bath.',
  },

  cta: { label: 'Book a survey', href: '#contact' },

  nav: {
    links: [
      { label: 'What we do', href: '#offer' },
      { label: 'How it works', href: '#process' },
      { label: 'Recent work', href: '#work' },
      { label: 'Questions', href: '#questions' },
    ],
  },

  hero: {
    headline: 'A damp report that owes nothing to a treatment firm',
    subtext:
      'We survey, we write it up, and we walk away. No remedial arm, no commission, no upsell.',
    image: {
      src: 'https://picsum.photos/seed/bristol-victorian-terrace-survey/1400/1050',
      alt: 'A surveyor examining the base of a wall in a Victorian terraced house',
      width: 1400,
      height: 1050,
    },
  },

  proof: [
    { label: 'Working since', detail: '2011' },
    { label: 'Regulated by', detail: 'RICS and the PCA' },
    { label: 'Covering', detail: 'Bristol, Bath, north Somerset' },
    { label: 'Typical report', detail: 'Back within three working days' },
  ],

  offer: {
    heading: 'What we are asked for',
    services: [
      {
        title: 'Pre-purchase damp and timber survey',
        body: 'You are buying, the lender or the level 3 survey has flagged damp, and you need to know what it will actually cost before you commit. We measure, we photograph, and we tell you which of it is urgent.',
      },
      {
        title: 'Second opinion on a treatment quote',
        body: 'A contractor has quoted for a chemical damp-proof course. We look at the same wall and tell you whether it is rising damp, a failed gutter, or a bridged cavity, and what the cheaper fix would be.',
      },
      {
        title: 'Timber and rot investigation',
        body: 'Suspended floors, roof timbers, embedded joist ends. We open up where we have to, identify the species and the moisture route, and specify the repair in a form a joiner can price.',
      },
      {
        title: 'Expert reports for disputes',
        body: 'Written to be read by a solicitor or a judge, with the methodology and the instrument readings set out in full.',
      },
    ],
  },

  process: {
    heading: 'How a survey runs',
    steps: [
      {
        title: 'A call first, free',
        body: 'Fifteen minutes on the phone. Often we can tell you straight away that you do not need us, which saves you a few hundred pounds.',
      },
      {
        title: 'On site, two to three hours',
        body: 'Protimeter readings on a grid, thermal imaging where the wall build-up is unclear, drainage and ground levels outside, and a look in the roof.',
      },
      {
        title: 'The report, three working days',
        body: 'Photographs keyed to a floor plan, a moisture map, the cause of each defect, and a repair specification with rough costs.',
      },
      {
        title: 'A call afterwards, also free',
        body: 'You will have questions once you have read it. We would rather answer them than have you guess.',
      },
    ],
  },

  work: {
    heading: 'Recent jobs',
    items: [
      {
        title: 'Failed rainwater goods read as rising damp',
        place: 'Totterdown, Bristol',
        image: {
          src: 'https://picsum.photos/seed/totterdown-terrace-gutter/1200/900',
          alt: 'A cast iron downpipe running past a stained brick wall',
          width: 1200,
          height: 900,
        },
      },
      {
        title: 'Dry rot behind a boxed-in bath',
        place: 'Oldfield Park, Bath',
        image: {
          src: 'https://picsum.photos/seed/bath-georgian-floorboards-rot/1200/900',
          alt: 'Lifted floorboards showing joists in a first floor bathroom',
          width: 1200,
          height: 900,
        },
      },
      {
        title: 'Bridged cavity under a new patio',
        place: 'Nailsea',
        image: {
          src: 'https://picsum.photos/seed/nailsea-patio-cavity-bridge/1200/900',
          alt: 'A paved patio finished tight against the base of a rendered house wall',
          width: 1200,
          height: 900,
        },
      },
    ],
  },

  questions: {
    heading: 'What people ask',
    items: [
      {
        q: 'Do you carry out the remedial work?',
        a: 'No, and we will not recommend a firm either. The moment we have a stake in the repair, the report stops being worth anything.',
      },
      {
        q: 'What does a survey cost?',
        a: 'Most residential surveys land between four and six hundred pounds plus VAT, depending on size and access. We quote a fixed fee before we visit.',
      },
      {
        q: 'My lender wants a damp report. Will yours do?',
        a: 'In almost every case, yes. Send us the wording the lender used and we will confirm before you book.',
      },
      {
        q: 'How far do you travel?',
        a: 'Bristol, Bath and north Somerset without a travel charge. Further afield by arrangement.',
      },
    ],
  },

  contact: {
    heading: 'Book a survey',
    body: 'Tell us the address, what has been flagged, and roughly when you need the report. We will come back with a fixed fee and a date.',
    email: 'hello@halsteadrowe.example',
    phone: '0117 214 8830',
    area: 'Bristol, Bath and north Somerset',
    hours: 'Monday to Friday, 8am to 6pm',
  },
});
