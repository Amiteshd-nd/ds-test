/* The answer layer behind the /home-2.2 chat surface.
 *
 * This is a curated retrieval brain, not a language model: every sentence here
 * was written by hand from the case studies that already live in
 * src/pages/projects/. Intent matching is keyword scoring, and the "depth"
 * control in the prompt bar genuinely changes how much of an entry is
 * returned rather than just re-skinning the same paragraph.
 *
 * Swapping this for a real API later means replacing respond() with a fetch —
 * the block shapes it returns are what the UI renders, so nothing else moves.
 */

import hoursOfServiceImg from '../assets/images/hours-of-service.webp';
import vehicleHealthImg from '../assets/images/vehicle-health.webp';
import gazeboDsImg from '../assets/images/gazebo-ds.webp';
import vendingAnalyticsImg from '../assets/images/vending-analytics.webp';
import teluguStreamingImg from '../assets/images/telugu-streaming.webp';

/* ------------------------------------------------------------------ config */

export const DEPTHS = [
  { id: 'quick', label: 'Quick answer', hint: 'One tight paragraph', icon: 'bolt' },
  { id: 'balanced', label: 'Balanced', hint: 'Context plus the highlights', icon: 'scale' },
  { id: 'deep', label: 'Deep dive', hint: 'Decisions, trade-offs, numbers', icon: 'bulb' },
  { id: 'study', label: 'Case study', hint: 'Everything, with the walkthrough', icon: 'flask' },
];

export const TONES = [
  { id: 'normal', label: 'Normal', hint: 'How I would say it in a review' },
  { id: 'concise', label: 'Concise', hint: 'Straight to the outcome' },
  { id: 'story', label: 'Story', hint: 'The narrative, start to finish' },
];

const DEPTH_ORDER = DEPTHS.map((d) => d.id);
const rank = (depth) => Math.max(0, DEPTH_ORDER.indexOf(depth));

/* ---------------------------------------------------------------- projects */

export const PROJECTS = {
  'hours-of-service': {
    title: 'Hours of Service',
    blurb: 'Native ELD and HoS for drivers, run from a manager web portal.',
    route: '/projects/hours-of-service',
    image: hoursOfServiceImg,
    accent: 'magenta',
  },
  'vehicle-health': {
    title: 'Vehicle Health',
    blurb: 'Inspections, defect management and maintenance scheduling.',
    route: '/projects/vehicle-health',
    image: vehicleHealthImg,
    accent: 'cool',
  },
  'gazebo-complex-organisms': {
    title: 'Gazebo Complex Organisms',
    blurb: 'The hard end of a design system: organisms that carry real logic.',
    route: '/projects/gazebo-complex-organisms',
    image: gazeboDsImg,
    accent: 'violet',
  },
  'vending-analytics': {
    title: 'Vending Analytics',
    blurb: 'An analytics dashboard across desktop and mobile. Under NDA.',
    route: '/projects/vending-analytics',
    image: vendingAnalyticsImg,
    accent: 'warm',
  },
  'telugu-streaming': {
    title: 'Telugu Streaming Platform',
    blurb: 'Onboarding, subscription and playback for a regional OTT. Under NDA.',
    route: '/projects/telugu-streaming',
    image: teluguStreamingImg,
    accent: 'cool',
  },
  'bangalore-times': {
    title: 'Bangalore Times',
    blurb: 'Namma Quest - a casual social game built with Phaser and React.',
    route: '/game/bangalore-times',
    image: teluguStreamingImg,
    accent: 'violet',
  },
};

/* ------------------------------------------------------------------ topics */

const p = (text) => ({ type: 'p', text });
const list = (items) => ({ type: 'list', items });
const stats = (items) => ({ type: 'stats', items });
const cards = (ids) => ({ type: 'cards', ids });
const links = (items) => ({ type: 'links', items });
const note = (text) => ({ type: 'note', text });

const TOPICS = [
  {
    id: 'hours-of-service',
    keywords: [
      ['hours of service', 6], ['hos', 5], ['eld', 6], ['fmcsa', 5], ['compliance', 3],
      ['duty status', 5], ['driver log', 4], ['logs', 2], ['roadside', 4], ['trucking', 3],
      ['fleet', 2], ['violation', 4], ['netradyne', 2], ['driver', 2],
    ],
    quick:
      'Hours of Service is the work I point people at first. Netradyne was paying an external vendor for ELD, and that vendor sat between the fleet and its own driving data. I designed a native ELD and Hours-of-Service experience inside the driver app, with a manager web portal behind it, so the whole duty-status loop stayed in-house.',
    balanced: [
      p('The brief had three edges pulling against each other: it had to be cheaper than the vendor, it had to satisfy FMCSA to the letter, and it could not feel like a new tool to a driver who had already learned the old one.'),
      list([
        'Replace the third-party ELD system and the per-device fee attached to it.',
        'Give drivers a dedicated dashboard for duty cycles, logs and edits.',
        'Keep the patterns drivers already knew, then fix the parts failing them.',
        'Hold FMCSA compliance across duty cycles, inspections and roadside checks.',
      ]),
    ],
    deep: [
      p('The money argument was the easy half. At $6 per device per month, a thousand-device fleet was spending $6,000 a month - $72,000 a year - on something we could own. That framing is what bought the project its runway.'),
      stats([
        { value: '$72k', label: 'Annual saving, per 1,000 devices' },
        { value: '~270k', label: 'Drivers in scope' },
        { value: '20-35%', label: 'Target cut in HoS violations' },
      ]),
      p('The design argument was harder and mattered more. Violations are rarely defiance - they are a driver who did not see the wall coming. So the interface leans on three principles: duty status changes are effortless and automated wherever the data allows, violations and log edits are surfaced loudly instead of buried, and every log stays transparent and correctable so a mistake does not become a permanent mark against someone.'),
    ],
    study: [
      p('Where it got genuinely difficult was the roadside inspection. That is the one moment where a stressed driver, an officer with no patience for your UI, and a federal data format all meet at once. It is designed as its own mode - one screen, no navigation, nothing to fumble - because the cost of a wrong tap there is not a support ticket, it is a citation.'),
      p('The manager side is the mirror of that. Fleet managers needed to see unassigned logs, pending edit suggestions and diagnostics without drowning in them, so the portal sorts by what is about to become a compliance problem rather than by what changed most recently.'),
    ],
    cardIds: ['hours-of-service'],
    followUps: [
      'How did you handle roadside inspections?',
      'What made the business case land?',
      'Show me the Vehicle Health project',
    ],
  },

  {
    id: 'vehicle-health',
    keywords: [
      ['vehicle health', 6], ['maintenance', 5], ['defect', 5], ['inspection', 4],
      ['technician', 4], ['dvir', 4], ['repair', 3], ['scheduling', 3],
    ],
    quick:
      'Vehicle Health is the maintenance and defect-management side of fleet work: drivers run daily inspections, defects get logged and assigned, technicians resolve them, and managers can prove all of it happened when an audit asks.',
    balanced: [
      p('The failure mode I was designing against is familiar to anyone who has shipped an internal tool - the tool that forces operators to adapt to it gets worked around, and once people work around it the data underneath stops being true.'),
      list([
        'Daily vehicle inspections a driver can actually finish before a shift.',
        'Defect reporting and tracking that holds up for compliance.',
        'Assignment and resolution flows spanning mobile, tablet and desktop.',
        'Exportable reports and permission-based controls for audits.',
      ]),
    ],
    deep: [
      p('The numbers moved because the friction moved. Speed was the lever: an inspection that fits in the gap before a shift gets done properly, and a defect that takes one screen to log gets logged instead of remembered.'),
      stats([
        { value: '40%', label: 'Faster inspection completion' },
        { value: '+25%', label: 'Daily inspection compliance' },
        { value: '35%', label: 'Fewer recurring defects' },
        { value: '>80', label: 'SUS score in usability testing' },
      ]),
      p('The recurring-defect number is the one I care about most. It means the loop actually closed - that a defect raised by a driver reached a technician and came back resolved, rather than being re-reported every week by someone who assumed nobody was listening.'),
    ],
    study: [
      p('It is built as one system across three devices rather than three products. A driver logs a defect on a phone at the vehicle, a supervisor triages it on a tablet, a technician works it on a desktop - same objects, same states, different densities. Deciding that early is what kept the defect lifecycle coherent instead of forking into three slightly different truths.'),
    ],
    cardIds: ['vehicle-health'],
    followUps: [
      'How do you measure design outcomes?',
      'Tell me about Hours of Service',
      'What does your process look like?',
    ],
  },

  {
    id: 'gazebo',
    keywords: [
      ['gazebo', 6], ['design system', 6], ['component library', 5], ['organism', 5],
      ['atomic', 3], ['token', 3], ['mega menu', 4], ['notification', 3], ['bulk', 4],
      ['recruiter', 3], ['scoring', 4],
    ],
    quick:
      'Gazebo is a unified design system and component library, and the part I documented is the hard end of it - complex organisms. Buttons are a solved problem. A mega menu, a notification panel, a bulk-action flow and a job card displaying a live scoring model are where a design system either earns its keep or quietly falls apart.',
    balanced: [
      p('Complex organisms are where system thinking stops being about consistency and starts being about logic. Each one carries state, permissions and edge cases a token file cannot express.'),
      list([
        'Mega menu, across default and focus states.',
        'Notification panel: default, hovered, active, and action-taken.',
        'Search across its default, focused and mid-interaction states.',
        'Bulk selection, bulk compose and the full bulk-action flow.',
        'Job cards, recruiter dashboards and application progress states.',
      ]),
    ],
    deep: [
      p('The job card is the piece worth pulling out. It surfaces a real-time conversion probability, and the design problem was making a weighted model legible without pretending it is a promise.'),
      list([
        'Pool-based normalisation: 25%, against 330 applications.',
        'Stage elevated to "Viewed": +10%.',
        'Strong profile match: +5%.',
        'Recruiter pinned the job: +4%.',
      ]),
      p('Each factor contributes a weighted score and the sum is the live conversion probability. Showing the breakdown rather than the single number is deliberate - an unexplained percentage is either ignored or over-trusted, and both are worse than a number you can interrogate.'),
    ],
    study: [
      p('There is a smaller decision in there I still like: counts cap at 99 visually, and anything beyond that moves into a detail view on click. It sounds trivial. It is the difference between a dashboard that stays scannable at a glance and one that turns into a wall of four-digit numbers nobody reads.'),
    ],
    cardIds: ['gazebo-complex-organisms'],
    followUps: [
      'How do you decide what belongs in a design system?',
      'What else have you built?',
      'Tell me about your process',
    ],
  },

  {
    id: 'nda-work',
    keywords: [
      ['nda', 6], ['vending', 5], ['telugu', 5], ['streaming', 5], ['ott', 4],
      ['kellogg', 4], ['subscription', 3], ['player', 3],
    ],
    quick:
      'Two of the projects sit under NDA, so the public write-ups are deliberately thin: a vending analytics dashboard spanning desktop and mobile, and a Telugu streaming platform covering language onboarding, the subscription flow and the player itself.',
    balanced: [
      p('What I can talk about is the shape of the problems rather than the screens. The streaming work was about a first-run experience where language choice is the single most consequential decision a user makes, and a subscription flow that had to survive being the thing standing between someone and the film they came for.'),
      list([
        'Language-first onboarding, before anything else is asked.',
        'Subscription flow designed around the moment of intent, not a settings page.',
        'Player controls covering quality selection and skip-song behaviour.',
        'A style guide holding the whole surface together.',
      ]),
    ],
    deep: [
      p('If you want the detail behind either of these, ask me directly - most of it I can walk through in a conversation even where I cannot publish the artefacts.'),
    ],
    study: [],
    cardIds: ['telugu-streaming', 'vending-analytics'],
    followUps: ['How can I reach you?', 'Show me work that is not under NDA'],
  },

  {
    id: 'game',
    keywords: [
      ['game', 5], ['bangalore', 5], ['phaser', 5], ['namma', 5], ['quest', 3],
      ['play', 3], ['side project', 4],
    ],
    quick:
      'Bangalore Times - Namma Quest - is a casual social game set in Bangalore, built with Phaser and React. It runs inside this site rather than linking out, and yes, it is playable right now.',
    balanced: [
      p('It is the side project that keeps me honest. Designing a game means no dashboard patterns to fall back on: if the feedback loop is not satisfying in the first ten seconds, nothing else you did matters. That lesson transfers back into product work more often than it has any right to.'),
    ],
    deep: [
      p('It is lazy-loaded so the Phaser bundle only downloads if you actually open it - about a megabyte nobody visiting the portfolio should have to pay for.'),
    ],
    study: [],
    cardIds: ['bangalore-times'],
    followUps: ['What else do you build for yourself?', 'Tell me about your process'],
  },

  {
    id: 'process',
    keywords: [
      ['process', 6], ['how do you work', 6], ['approach', 5], ['method', 4],
      ['workflow', 4], ['research', 4], ['discovery', 4], ['testing', 3],
      ['collaborate', 3], ['measure', 4], ['outcome', 3], ['philosophy', 4],
      ['worked', 3],
    ],
    quick:
      'I start from the operational reality rather than the screen. Most of my work has been for people doing a job under time pressure - drivers, technicians, fleet managers - and in that world the best interface is usually the one that disappears fastest.',
    balanced: [
      p('Practically, that means the same four moves, in roughly this order:'),
      list([
        'Find the workaround. People have already solved the problem badly; that solution tells you the real constraint.',
        'Make the business case in the language of the business. $6 per device per month bought Hours of Service its runway.',
        'Design for the worst moment, not the happy path - the roadside stop, the failed inspection, the mistake that needs undoing.',
        'Instrument it, then argue from the numbers instead of from taste.',
      ]),
    ],
    deep: [
      p('The measurement habit matters more than it sounds. "40% faster inspections" and "SUS above 80" are not decoration on a case study - they are what let the next proposal get funded. Design that cannot describe its own effect gets treated as decoration, and then gets cut first.'),
      p('I also try to preserve familiarity aggressively. On Hours of Service we kept patterns from the third-party app people were already trained on, even ones I would not have chosen from scratch, and spent the redesign budget on the parts genuinely failing. Novelty is a cost you pay out of someone else’s working day.'),
    ],
    study: [
      p('And I build. This page, the game, the prototypes in this repo - being able to get a real thing running changes what I am willing to propose, because I am not guessing at whether it can be made.'),
    ],
    cardIds: [],
    followUps: ['What are you looking for next?', 'Show me your best work', 'How can I reach you?'],
  },

  {
    id: 'about',
    keywords: [
      ['who are you', 7], ['about you', 6], ['yourself', 5], ['amitesh', 6],
      ['background', 4], ['experience', 4], ['bio', 4], ['designer', 3],
      ['introduce', 5], ['hello', 3], ['hey', 3],
    ],
    quick:
      'I am Amitesh - a product designer working mostly on fleet safety and compliance software at Netradyne. Dense, operational, regulated interfaces, used by people who did not choose the software and cannot afford it to waste their time.',
    balanced: [
      p('The portfolio splits into three groups: fleet products (Hours of Service, Vehicle Health), design-system work (Gazebo), and earlier platform work now under NDA. There is also a game, because not everything has to be a dashboard.'),
    ],
    deep: [
      p('If you want the fastest read on how I think, open Hours of Service. It has the clearest version of the thing I care about - a design argument and a financial argument making the same case, so nobody had to choose between them.'),
    ],
    study: [],
    cardIds: ['hours-of-service', 'vehicle-health'],
    followUps: ['What does your process look like?', 'Show me your best work', 'How can I reach you?'],
  },

  {
    id: 'contact',
    keywords: [
      ['contact', 6], ['reach', 5], ['email', 6], ['hire', 6], ['resume', 6],
      ['cv', 5], ['available', 4], ['freelance', 4], ['work together', 6],
      ['linkedin', 3], ['behance', 5], ['opportunity', 4], ['role', 4],
    ],
    quick:
      'Easiest route is email: amiteshdebnath98@gmail.com. The resume is a download away, and older work that never made it into this portfolio lives on Behance.',
    balanced: [
      links([
        { label: 'amiteshdebnath98@gmail.com', href: 'mailto:amiteshdebnath98@gmail.com', external: true },
        { label: 'Download resume (PDF)', href: '/Amitesh_SPD.pdf', external: true },
        { label: 'Behance - archisapien', href: 'https://www.behance.net/archisapien', external: true },
      ]),
    ],
    deep: [
      p('If you are reading this because you are hiring: tell me what is actually broken rather than what the job description says, and I will tell you honestly whether I am the right person for it.'),
    ],
    study: [],
    cardIds: [],
    followUps: ['What are you looking for next?', 'Tell me about your process'],
  },

  {
    id: 'meta',
    keywords: [
      ['this site', 5], ['this page', 5], ['built this', 5], ['how does this work', 6],
      ['are you ai', 6], ['chatbot', 5], ['llm', 5], ['real ai', 6], ['gpt', 4],
      ['claude', 4], ['tech stack', 5], ['react', 3],
    ],
    quick:
      'Straight answer: I am not a language model. I am a curated retrieval layer - every sentence here was written by Amitesh, matched to your question by keyword scoring. The chat framing is the interface, not a claim about what is underneath.',
    balanced: [
      p('The page is React 19, React Router and Framer Motion, with the material above the input drawn as a point cloud on a 2D canvas - roughly 2,200 points on a noise-deformed sphere, no 3D library involved. The glass is CSS: layered translucency, a masked 1px gradient rim, and a pointer-tracked glow running on springs.'),
    ],
    deep: [
      p('The depth control in the prompt bar is real, not decorative - it changes how much of an entry comes back. Everything here is designed so that swapping this brain for an actual model API is a single function replacement, with the rendering layer untouched.'),
    ],
    study: [],
    cardIds: [],
    followUps: ['Tell me about your process', 'Show me your best work'],
  },

  {
    id: 'best-work',
    keywords: [
      ['best work', 6], ['proud', 5], ['favourite', 5], ['favorite', 5],
      ['strongest', 4], ['highlight', 4], ['portfolio', 4],
      ['projects', 5], ['trends', 3], ['everything', 3],
    ],
    quick:
      'Here is the whole shelf. If you only have time for one, make it Hours of Service - it is the clearest example of a design argument and a business argument arriving at the same answer.',
    balanced: [
      list([
        'Hours of Service - native ELD and duty-status for ~270,000 drivers.',
        'Vehicle Health - inspections and defect management, 40% faster completion.',
        'Gazebo Complex Organisms - the load-bearing end of a design system.',
        'Telugu Streaming and Vending Analytics - earlier platform work, under NDA.',
        'Bangalore Times - a Phaser game, playable inside this site.',
      ]),
    ],
    deep: [],
    study: [],
    cardIds: ['hours-of-service', 'vehicle-health', 'gazebo-complex-organisms'],
    followUps: ['Tell me about Hours of Service', 'What does your process look like?', 'How can I reach you?'],
  },

  {
    id: 'next',
    keywords: [
      ['looking for', 5], ['next', 4], ['future', 4], ['goal', 4], ['want to work', 5],
      ['interested in', 4], ['ambition', 4],
    ],
    quick:
      'I want to keep working where the stakes are real and the constraints are honest - regulated, operational products where a design decision shows up in someone’s day rather than in an engagement metric.',
    balanced: [
      p('The thing pulling at me lately is exactly what this page is: interfaces where the primary control is language. Most of the design craft for that is still unwritten, and the products shipping it are mostly ignoring the operational users I have spent my career on.'),
    ],
    deep: [],
    study: [],
    cardIds: [],
    followUps: ['How can I reach you?', 'Tell me about your process'],
  },
];

/* ---------------------------------------------------------------- matching */

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'of', 'to',
  'in', 'on', 'for', 'and', 'or', 'me', 'my', 'your', 'you', 'it', 'that',
  'this', 'with', 'about', 'what', 'how', 'why', 'can', 'tell', 'show', 'please',
]);

function score(query, topic) {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  let total = 0;

  for (const [phrase, weight] of topic.keywords) {
    if (phrase.includes(' ')) {
      if (q.includes(` ${phrase} `)) total += weight * 1.5;
    } else if (q.includes(` ${phrase} `)) {
      total += weight;
    }
  }

  // A small nudge for raw token overlap, so partial phrasings still land.
  const tokens = q.trim().split(' ').filter((t) => t.length > 3 && !STOP.has(t));
  for (const t of tokens) {
    if (topic.keywords.some(([k]) => k.includes(t))) total += 0.5;
  }

  return total;
}

/* --------------------------------------------------------------- responses */

function toneAdjust(blocks, tone) {
  if (tone === 'concise') {
    // Concise keeps the spine - opening claim, hard numbers, cards and links -
    // and drops the connective prose.
    return blocks.filter(
      (b, i) =>
        i === 0 || b.type === 'stats' || b.type === 'cards' || b.type === 'links' || b.type === 'list',
    );
  }
  return blocks;
}

function build(topic, depth, tone) {
  const r = rank(depth);
  const blocks = [p(topic.quick)];

  if (r >= 1) blocks.push(...(topic.balanced || []));
  if (r >= 2) blocks.push(...(topic.deep || []));
  if (r >= 3) blocks.push(...(topic.study || []));

  if (topic.cardIds?.length) {
    blocks.push(cards(r === 0 ? topic.cardIds.slice(0, 1) : topic.cardIds));
  }

  return {
    topicId: topic.id,
    blocks: toneAdjust(blocks, tone),
    followUps: topic.followUps || [],
  };
}

const FALLBACK = {
  topicId: 'fallback',
  blocks: [
    p('That one is outside what I have been briefed on - I only carry what Amitesh has actually written down, so I would rather say so than invent an answer.'),
    p('Things I can genuinely help with:'),
    list([
      'Any of the projects - Hours of Service, Vehicle Health, Gazebo, the NDA work, the game.',
      'How he works: research, trade-offs, how outcomes get measured.',
      'How this page is built, and what is really behind the chat.',
      'How to get in touch, or the resume.',
    ]),
    note('For anything else, email is the honest route: amiteshdebnath98@gmail.com'),
  ],
  followUps: ['Show me your best work', 'What does your process look like?', 'How can I reach you?'],
};

/**
 * Resolve a question into renderable blocks.
 * @param {string} query raw user input
 * @param {string} depth one of DEPTHS ids
 * @param {string} tone one of TONES ids
 */
export function respond(query, depth = 'balanced', tone = 'normal') {
  const clean = (query || '').trim();
  if (!clean) return FALLBACK;

  let best = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    const s = score(clean, topic);
    if (s > bestScore) {
      bestScore = s;
      best = topic;
    }
  }

  if (!best || bestScore < 3) return FALLBACK;
  return build(best, depth, tone);
}

/* ------------------------------------------------------------- suggestions */

export const SUGGESTIONS = [
  { icon: 'compass', label: 'Start here', prompt: 'Who are you and what do you work on?' },
  { icon: 'chart', label: 'Flagship project', prompt: 'Tell me about Hours of Service' },
  { icon: 'grid', label: 'Design systems', prompt: 'What did you build for the Gazebo design system?' },
  { icon: 'pulse', label: 'Outcomes', prompt: 'How do you measure whether a design worked?' },
  { icon: 'spark', label: 'Process', prompt: 'What does your design process actually look like?' },
  { icon: 'mail', label: 'Get in touch', prompt: 'How can I reach you about a role?' },
];

/* The rotating headline. These read as things a real visitor would type. */
export const TYPED_PROMPTS = [
  'Tell me about this year’s best work',
  'How did you cut HoS violations by a third?',
  'What belongs in a design system?',
  'Show me something you shipped under pressure',
  'Are you actually an AI?',
];
