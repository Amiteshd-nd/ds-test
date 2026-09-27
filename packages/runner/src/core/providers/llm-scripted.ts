/**
 * A deterministic `LLMProvider` that replays fixed scripts.
 *
 * It exists so the acceptance test, the unit tests and a first look at the UI
 * all run with no API key, no cost and no flake. It is a test double, not a
 * model: it does not read the prompt, and it will happily "succeed" at a task
 * it never understood. Nothing about agent quality can be concluded from a
 * green run against this provider.
 *
 * Phase 1 added a second agent, so a single list of turns is no longer enough -
 * the orchestrator and the web builder interleave, and which one is speaking is
 * knowable only from the system prompt. Hence routes: each has its own matcher
 * and its own turn counter, and an unmatched request is an error rather than a
 * silent fallthrough that would look like the wrong agent answering.
 *
 * The token and cache numbers it reports are **simulated**, derived from the
 * real prefix/suffix split of the request. They exercise the plumbing that
 * measures cache hit rate; they are not evidence that caching works. Only a run
 * against `AnthropicProvider` is that.
 */

import type { LLMProvider, LLMRequest, LLMResponse, LLMContentBlock } from './interfaces.ts';
import { priceOf } from './llm-anthropic.ts';
import type { Usage } from '../types.ts';

/** Rough enough for a simulation, and it costs nothing. */
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export type Script = Array<{ content: LLMContentBlock[]; stop_reason: string }>;

export interface ScriptRoute {
  /** For the error message when the script runs out. */
  name: string;
  /** Matched against the system prompt, which is what identifies the agent. */
  when: (request: LLMRequest) => boolean;
  script: Script;
}

export class ScriptedProvider implements LLMProvider {
  readonly name = 'scripted';
  private readonly routes: ScriptRoute[];
  private readonly turns = new Map<string, number>();
  /** Prefix length of the first request per route, treated as the cacheable prefix. */
  private readonly prefixes = new Map<string, number>();

  constructor(script: Script | ScriptRoute[]) {
    this.routes = Array.isArray(script) && script.length > 0 && 'when' in script[0]
      ? (script as ScriptRoute[])
      : [{ name: 'default', when: () => true, script: script as Script }];
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const route = this.routes.find((r) => r.when(request));
    if (!route) {
      throw new Error(
        'the scripted provider has no route for this request. Its system prompt matched none of: ' +
          this.routes.map((r) => r.name).join(', '),
      );
    }

    const turn = this.turns.get(route.name) ?? 0;
    const step = route.script[turn];
    if (!step) {
      throw new Error(
        `scripted route "${route.name}" ran out of script at turn ${turn}; the loop asked for more turns than it has`,
      );
    }
    this.turns.set(route.name, turn + 1);

    const prefix = estimateTokens(request.system) + estimateTokens(JSON.stringify(request.tools));
    const suffix = estimateTokens(JSON.stringify(request.messages));

    // Turn one writes the cache; every later turn reads it. That is the shape a
    // correctly-built request produces, which is what the reporting code should
    // be exercised against.
    if (!this.prefixes.has(route.name)) this.prefixes.set(route.name, prefix);
    const first = turn === 0;

    const usage: Usage = {
      input_tokens: suffix,
      cache_creation_input_tokens: first ? prefix : 0,
      cache_read_input_tokens: first ? 0 : this.prefixes.get(route.name)!,
      output_tokens: estimateTokens(JSON.stringify(step.content)),
    };

    // Stream the text the same way the real provider does, so the UI path is
    // identical under both.
    if (request.onTextDelta) {
      for (const block of step.content) {
        if (block.type !== 'text') continue;
        for (const word of block.text.split(/(?<=\s)/)) request.onTextDelta(word);
      }
    }

    const tier = request.tier ?? 'step';
    return {
      content: step.content,
      stop_reason: step.stop_reason,
      usage,
      model: `scripted/${route.name}/${tier}`,
      // Priced as the tier it stands in for, so a scripted run produces a
      // number in the same units as a real one.
      cost_usd: priceOf(
        { plan: 'claude-opus-5', step: 'claude-sonnet-5', fast: 'claude-haiku-4-5' }[tier],
        usage,
      ),
    };
  }
}

/* ------------------------------------------------------------ the scripts */

const IS_ORCHESTRATOR = (r: LLMRequest) => r.system.startsWith('You are Runner');

/**
 * What the task actually asked for, so one provider can serve every demo.
 *
 * The goal only, not the whole first message. The message also carries the
 * business brief, and that brief contains labels like "Why them and not a
 * competitor" - so matching the whole thing routed a landing-page task to the
 * research script because of a word in a field label. A router named
 * `goalMatches` should read the goal.
 */
const goalMatches = (r: LLMRequest, pattern: RegExp): boolean => {
  const first = r.messages[0]?.content;
  const text = typeof first === 'string' ? first : JSON.stringify(first);
  const task = text.split('## Task').at(-1) ?? text;
  return pattern.test(task);
};
const IS_BUILDER = (r: LLMRequest) => r.system.startsWith('You build landing pages');
const IS_REVIEWER = (r: LLMRequest) => r.system.startsWith('You review landing pages');
const IS_PLANNER = (r: LLMRequest) => r.system.startsWith('You break a research request');
const IS_RESEARCHER = (r: LLMRequest) => r.system.startsWith('You research one question');
const IS_SYNTHESISER = (r: LLMRequest) => r.system.startsWith("You merge several researchers'");
const IS_DECK = (r: LLMRequest) => r.system.startsWith('You build short decks');
const IS_DRAFTER = (r: LLMRequest) => r.system.startsWith('You draft social posts');

/**
 * The Phase 0 acceptance script: "create a hello-world Python script and run it".
 *
 * It exercises every tool that phase shipped - the plan file, a write, a shell
 * command, a read-back verification - in the order the system prompt asks for.
 */
export const helloWorldScript: Script = [
  {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: "I'll write the plan down first." },
      {
        type: 'tool_use',
        id: 'call_plan_1',
        name: 'file_write',
        input: {
          path: 'todo.md',
          contents:
            '# Plan\n\n- [ ] Write hello.py\n- [ ] Run it with python3\n- [ ] Verify the output reads "Hello, world!"\n',
        },
      },
    ],
  },
  {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'call_write_1',
        name: 'file_write',
        input: { path: 'hello.py', contents: 'print("Hello, world!")\n' },
      },
    ],
  },
  {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'call_shell_1',
        name: 'shell_exec',
        input: { command: 'python3 hello.py' },
      },
    ],
  },
  {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'call_plan_2',
        name: 'file_write',
        input: {
          path: 'todo.md',
          contents:
            '# Plan\n\n- [x] Write hello.py\n- [x] Run it with python3\n- [x] Verify the output reads "Hello, world!"\n',
        },
      },
    ],
  },
  {
    stop_reason: 'end_turn',
    content: [
      {
        type: 'text',
        text: 'Done. `hello.py` prints `Hello, world!` and running it under python3 confirmed the output.',
      },
    ],
  },
];

/**
 * The Phase 1 acceptance script: a business description becomes a built site.
 *
 * The builder's content below is a real, valid `site.ts` for a fictional
 * business, because the point of this script is to prove that the
 * seed-edit-build-check-capture pipeline works. The model's job of writing good
 * copy is exactly the part a test double cannot stand in for.
 */
/** A valid `site.ts`, written to pass the template's own content rules. */
const KESTREL_SITE = `import { assertSite } from './guard';
import type { Site } from './types';

export const site: Site = assertSite({
  design: { palette: 'olive', type: 'character', rhythm: 'offset', radius: 'sharp' },

  meta: {
    title: 'Kestrel Hedgelaying - hedge laying in Herefordshire',
    description:
      'Midland style hedgelaying and hedgerow restoration for farms and estates across Herefordshire and the Welsh borders. Two people, laid by hand, working since 2016.',
  },

  brand: {
    name: 'Kestrel Hedgelaying',
    tagline: 'Midland style hedgelaying, Herefordshire and the borders.',
  },

  cta: { label: 'Get a quote', href: '#contact' },

  nav: {
    links: [
      { label: 'What we do', href: '#offer' },
      { label: 'How it works', href: '#process' },
      { label: 'Recent work', href: '#work' },
      { label: 'Questions', href: '#questions' },
    ],
  },

  hero: {
    headline: 'Hedges laid by hand, the Midland way',
    subtext:
      'Two of us, working farms and estates across Herefordshire and the borders since 2016. No flails, no contractors.',
    image: {
      src: 'https://picsum.photos/seed/herefordshire-laid-hedge-winter/1400/1050',
      alt: 'A newly laid hedge running along the edge of a winter field',
      width: 1400,
      height: 1050,
    },
  },

  proof: [
    { label: 'Working since', detail: '2016' },
    { label: 'Style', detail: 'Midland, laid by hand' },
    { label: 'Covering', detail: 'Herefordshire and the Welsh borders' },
    { label: 'Season', detail: 'September to March' },
  ],

  offer: {
    heading: 'What we take on',
    services: [
      {
        title: 'Laying an established hedge',
        body: 'Pleaching, staking and binding a hedge that has got away, so it thickens from the base again and stops being a line of trees with gaps underneath.',
      },
      {
        title: 'Restoring a derelict hedgerow',
        body: 'Where a hedge has been flailed to nothing or left for thirty years. Usually coppicing and gapping up first, then laying it two winters later.',
      },
      {
        title: 'Stewardship and grant work',
        body: 'Hedgerow work written into a Countryside Stewardship agreement, done to the specification and recorded the way the inspection wants it.',
      },
    ],
  },

  process: {
    heading: 'How the work goes',
    steps: [
      { title: 'A walk along the hedge', body: 'Free, and usually enough to tell you whether it wants laying this winter or in three years.' },
      { title: 'A price per chain', body: 'Measured in chains, twenty two yards, the way the work has always been priced. Fixed before we start.' },
      { title: 'The work, in winter', body: 'September to March only, while the sap is down. A two person team, roughly a chain a day each.' },
      { title: 'Brash cleared', body: 'Burnt on site or stacked for habitat, whichever suits you. We leave the field edge tidy.' },
    ],
  },

  work: {
    heading: 'Recent hedges',
    items: [
      {
        title: 'Forty chains of roadside hedge',
        place: 'Bodenham, Herefordshire',
        image: {
          src: 'https://picsum.photos/seed/bodenham-roadside-hedge-laying/1200/900',
          alt: 'A long roadside hedge freshly laid and staked',
          width: 1200,
          height: 900,
        },
      },
      {
        title: 'Derelict boundary brought back',
        place: 'Clun valley, Shropshire',
        image: {
          src: 'https://picsum.photos/seed/clun-valley-derelict-hedgerow/1200/900',
          alt: 'An overgrown hedgerow part way through being coppiced',
          width: 1200,
          height: 900,
        },
      },
      {
        title: 'Stewardship hedge on a tenanted farm',
        place: 'Kington, Herefordshire',
        image: {
          src: 'https://picsum.photos/seed/kington-farm-hedge-stakes/1200/900',
          alt: 'Hazel stakes and binders along a newly laid hedge',
          width: 1200,
          height: 900,
        },
      },
    ],
  },

  questions: {
    heading: 'What people ask',
    items: [
      { q: 'What does it cost?', a: 'We price by the chain and it depends on what is in the hedge. A straightforward thorn hedge is at the lower end, a neglected one with ash and elder in it is not.' },
      { q: 'When can you do it?', a: 'Between September and March. Outside that the sap is up and laying the hedge would kill it, and the birds are nesting.' },
      { q: 'Will it look bare afterwards?', a: 'For one season, yes. By the second summer it is thicker at the base than it was before.' },
      { q: 'Do you travel outside Herefordshire?', a: 'Into Shropshire, Powys and Monmouthshire without a charge. Further if the job is big enough to be worth the drive.' },
    ],
  },

  contact: {
    heading: 'Get a quote',
    body: 'Tell us roughly where the hedge is and how long it runs. We will come and walk it with you before quoting.',
    email: 'hello@kestrelhedgelaying.example',
    phone: '01432 660194',
    area: 'Herefordshire and the Welsh borders',
    hours: 'Most days, September to March',
  },
});
`;

export const landingPageRoutes: ScriptRoute[] = [
  {
    name: 'orchestrator',
    when: IS_ORCHESTRATOR,
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Writing the plan, then handing the page to the builder.' },
          {
            type: 'tool_use',
            id: 'o1',
            name: 'file_write',
            input: {
              path: 'todo.md',
              contents: '# Plan\n\n- [ ] Brief the web builder\n- [ ] Check the result\n',
            },
          },
        ],
      },
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'o2',
            name: 'site_create',
            input: {
              brief:
                'Kestrel Hedgelaying. Two people who lay and restore hedgerows for farms and ' +
                'estates across Herefordshire and the Welsh borders. Working since 2016. ' +
                'Midland style, done by hand. Customers are farm managers and estate agents ' +
                'for large country properties. Tone: plain, unhurried, a little proud of the ' +
                'craft. Contact hello@kestrelhedgelaying.example, 01432 660194.',
            },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'The site is built and the browser checks passed. You can preview it and publish when you are happy.',
          },
        ],
      },
    ],
  },
  {
    name: 'builder',
    when: IS_BUILDER,
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'b1',
            name: 'file_write',
            input: { path: 'site/src/site.ts', contents: KESTREL_SITE },
          },
        ],
      },
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'b2', name: 'site_build', input: {} }],
      },
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'b3', name: 'site_check', input: {} }],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'Built a page for Kestrel Hedgelaying: olive palette, character type, offset hero, sharp corners. The build is clean and the browser checks pass.',
          },
        ],
      },
    ],
  },
  {
    name: 'reviewer',
    when: IS_REVIEWER,
    script: [
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'The page is fine.' }],
      },
    ],
  },
];

/** A valid deck, written to pass the deck rules. */
const KESTREL_DECK = `{
  "design": {
    "palette": "olive",
    "type": "character"
  },
  "title": "Kestrel Hedgelaying",
  "subtitle": "Hedgerow work for farms and estates",
  "slides": [
    {
      "layout": "title",
      "title": "A hedge laid by hand is still a hedge in twenty years",
      "subtitle": "Kestrel Hedgelaying. Herefordshire and the Welsh borders, since 2016."
    },
    {
      "layout": "statement",
      "text": "A flail keeps a hedge tidy. It also keeps it thin at the base, which is where a hedge has to be thick.",
      "note": "The gaps appear about eight years in, and by then laying it costs twice as much."
    },
    {
      "layout": "two-column",
      "title": "Two ways to manage the same hedge",
      "left": {
        "heading": "Flailed every winter",
        "body": "Cheap per year, tidy from the road, and thinning from the bottom up. Eventually it becomes a line of trees with gaps underneath."
      },
      "right": {
        "heading": "Laid once a generation",
        "body": "A cost in one winter, bare for a season, then thicker at the base than it has been in decades and stock proof without wire."
      }
    },
    {
      "layout": "bullets",
      "title": "What you get from us that you do not get from a contractor",
      "points": [
        "Two people, on your hedge, all winter",
        "Midland style, pleached and staked by hand",
        "Priced by the chain, fixed before we start",
        "Brash burnt or stacked, your choice"
      ]
    },
    {
      "layout": "metrics",
      "title": "What the work looks like",
      "metrics": [
        {
          "value": "22",
          "label": "Yards in a chain",
          "note": "How the work is priced"
        },
        {
          "value": "2",
          "label": "Chains a day",
          "note": "For a two person team"
        },
        {
          "value": "7",
          "label": "Months of season",
          "note": "September to March only"
        }
      ]
    },
    {
      "layout": "quote",
      "quote": "They laid the roadside hedge three winters ago and I have not had a beast through it since.",
      "attribution": "Farm manager, Bodenham"
    },
    {
      "layout": "closing",
      "title": "Come and walk the hedge with us",
      "lines": [
        "Free, and about half an hour",
        "hello@kestrelhedgelaying.example",
        "01432 660194",
        "Herefordshire and the Welsh borders"
      ]
    }
  ]
}`;

/* ----------------------------------------------------------- phase 2 --- */

/**
 * Research, scripted.
 *
 * The researcher's script searches and reports rather than opening pages,
 * because the fixture provider returns URLs on a `.test` domain that no browser
 * can reach. That is the honest offline shape: fixtures carry long snippets so
 * a researcher rarely needs the page, and a fetch of one fails cleanly.
 *
 * Every route here has one turn per researcher, and the same route serves all
 * of them - so a fan-out of three questions consumes three turns of this
 * script, which is why it repeats.
 */
export const researchRoutes: ScriptRoute[] = [
  {
    name: 'orchestrator:research',
    when: (r) => IS_ORCHESTRATOR(r) && goalMatches(r, /research|competitor|market|what do .* charge/i),
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Handing this to the researcher.' },
          {
            type: 'tool_use',
            id: 'r1',
            name: 'research_run',
            input: {
              question:
                'What do independent damp and timber surveyors charge in Bristol, and how do ' +
                'survey-only practices price against treatment firms that offer free surveys?',
            },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'The report is written and filed. It is saved in the sandbox and you can open it from the panel.',
          },
        ],
      },
    ],
  },
  {
    name: 'research:planner',
    when: IS_PLANNER,
    script: [
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text:
              '- What does a damp survey cost in the UK\n' +
              '- How many damp surveyors operate in Bristol\n' +
              '- How do damp competitor firms price against each other',
          },
        ],
      },
    ],
  },
  {
    name: 'research:researcher',
    when: IS_RESEARCHER,
    // Three researchers, two turns each: search, then report.
    script: Array.from({ length: 3 }).flatMap((_, i) => [
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use' as const,
            id: `s${i}`,
            name: 'search_web',
            input: { query: ['damp survey cost', 'damp survey bristol', 'damp competitor'][i] },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text' as const,
            text:
              [
                'Independent damp surveys sit well above the free ones. Cost guides put a standard survey at \u00a3150 to \u00a3400 [1], while independent consultants who do not tender for the remedial work charge \u00a3350 to \u00a3550 plus VAT [2]. One Bristol practice publishes a fixed \u00a3425 plus VAT and has held it since 2024 [3].',
                'The gap is structural rather than a premium: a free survey is recovered through the treatment quotation [2], so the two are not the same product.',
              ][i % 2] ??
              'Around 34 damp businesses are listed in Bristol, of which 11 describe themselves as survey only [4]. Nineteen RICS regulated firms cover the BS and BA postcodes [5].',
          },
        ],
      },
    ]),
  },
  {
    name: 'research:synthesiser',
    when: IS_SYNTHESISER,
    script: [
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: `# What damp surveyors charge in Bristol

Independent, survey-only practices charge roughly \u00a3350 to \u00a3550 plus VAT, against a headline range of \u00a3150 to \u00a3400 for the market as a whole [1][2]. The difference is not a premium for quality: a free or cheap survey is paid for out of the remedial work that follows [2], so the two are different products sold under the same name.

## What the market looks like

Around 34 damp businesses are listed in the Bristol area, of which 11 describe themselves as independent and survey-only [4]. Nineteen RICS regulated firms cover the BS and BA postcodes [5].

## What it means for you

Pricing at the top of the independent range is defensible, but only if the page says plainly why the survey is not free. The nearest published comparison is a Bristol practice at a fixed \u00a3425 plus VAT, held since 2024 [3].

## Sources

[1] How much does a damp survey cost? - Checkatrade - https://www.example-checkatrade.test/cost-guides/damp-survey-cost
[2] Damp and timber survey fees explained - Property Care Association - https://www.example-pca.test/homeowners/survey-fees
[3] What I charge for a damp survey, and why - Bristol Damp Consultancy - https://www.example-bristoldamp.test/fees
[4] Damp surveyors in Bristol - Which? Trusted Traders - https://www.example-which.test/trusted-traders/bristol/damp-proofing
[5] RICS members offering damp and timber reports, South West - https://www.example-rics.test/find-a-surveyor/south-west/damp`,
          },
        ],
      },
    ],
  },
];

/** A deck, scripted. The content is a valid deck for the same fictional business. */
export const slidesRoutes: ScriptRoute[] = [
  {
    name: 'orchestrator:slides',
    when: (r) => IS_ORCHESTRATOR(r) && goalMatches(r, /deck|slides|presentation|pitch/i),
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Building the deck.' },
          {
            type: 'tool_use',
            id: 'd1',
            name: 'slides_create',
            input: {
              brief:
                'A short deck for a meeting with a farm estate manager who is deciding whether to ' +
                'put their hedgerow work out to a specialist. Ten minutes, one person in the room. ' +
                'We want them to book a walk along the hedge.',
            },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'The deck is built. There is a PDF and an editable PowerPoint file in the panel.',
          },
        ],
      },
    ],
  },
  {
    name: 'slides:builder',
    when: IS_DECK,
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'k1',
            name: 'file_write',
            input: { path: 'deck/deck.json', contents: KESTREL_DECK },
          },
        ],
      },
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'k2', name: 'slides_build', input: {} }],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'Seven slides on why a hand-laid hedge outlasts a flailed one, ending on booking a walk.',
          },
        ],
      },
    ],
  },
];

/** Posts and a cold email, scripted. All of it passes the copy and legal rules. */
export const growthRoutes: ScriptRoute[] = [
  {
    name: 'orchestrator:growth',
    when: (r) =>
      IS_ORCHESTRATOR(r) && goalMatches(r, /post|social|email|linkedin|twitter|campaign|outreach/i),
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Drafting these for you to look at.' },
          {
            type: 'tool_use',
            id: 'g1',
            name: 'growth_draft',
            input: {
              brief:
                'Three posts for the start of the hedgelaying season, one for LinkedIn and two ' +
                'for X, plus one cold email to a local estate manager we have not worked with.',
            },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text:
              'Four drafts are in the queue. Nothing has been sent: have a look and approve the ' +
              'ones you want, and they go out then.',
          },
        ],
      },
    ],
  },
  {
    name: 'growth:drafter',
    when: IS_DRAFTER,
    script: [
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'q1',
            name: 'growth_queue',
            input: {
              items: [
                {
                  kind: 'social_post',
                  platform: 'linkedin',
                  text:
                    'Hedgelaying season opens in September and closes in March, and the reason is ' +
                    'not tradition. Lay a hedge with the sap up and you kill it. We are booking ' +
                    'from the first week of September, working Herefordshire and the borders.',
                  hashtags: ['hedgelaying', 'farming'],
                },
                {
                  kind: 'social_post',
                  platform: 'x',
                  text:
                    'A flailed hedge looks tidy and thins from the bottom up. You notice about ' +
                    'year eight, when the gaps appear and the stock start walking through.',
                  hashtags: ['hedgelaying'],
                },
                {
                  kind: 'social_post',
                  platform: 'x',
                  text:
                    'Forty chains laid at Bodenham three winters ago. The farmer has not had a ' +
                    'beast through it since, and there is no wire in it.',
                },
                {
                  kind: 'email',
                  to: 'estates@example.test',
                  to_name: 'Estate office',
                  subject: 'Hedgerow work on the Bodenham boundary',
                  body:
                    'I laid forty chains on the neighbouring farm three winters ago and noticed ' +
                    'the roadside boundary on your side is starting to gap at the base. It is at ' +
                    'the stage where laying it is still cheaper than replanting.\n\n' +
                    'We work September to March, two of us, by hand, priced by the chain and fixed ' +
                    'before we start.\n\n' +
                    'Would it be worth half an hour walking it with you before the season fills up?',
                  from_identity: 'Tom Wexford, Kestrel Hedgelaying, Herefordshire.',
                  opt_out: 'If you would rather I did not write again, reply with "no thanks" and I will not.',
                },
              ],
            },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text:
              'Four queued: one LinkedIn post on the season opening, two on X, and a cold email ' +
              'to the neighbouring estate.',
          },
        ],
      },
    ],
  },
];

/**
 * The set the registry hands out.
 *
 * Routed on the goal as well as the agent, so that a first `pnpm dev` with no
 * API key can demonstrate any phase: ask for a hello-world script, a website, a
 * competitor report or a deck, and you get the matching script. Order matters -
 * the first matching route wins, so the specific ones come first.
 */
export const defaultScriptRoutes: ScriptRoute[] = [
  {
    name: 'orchestrator:hello-world',
    when: (r) => IS_ORCHESTRATOR(r) && goalMatches(r, /hello[ -]?world|python script/i),
    script: helloWorldScript,
  },
  ...researchRoutes,
  ...slidesRoutes,
  ...growthRoutes,
  ...landingPageRoutes,
];
