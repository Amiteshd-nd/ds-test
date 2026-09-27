# Ask Amitesh — every prompt and every answer

Everything the chat surface can say, and every button that can ask it. This is a
reading and editing copy: the single source of truth is
[`src/lib/portfolioBrain.js`](../src/lib/portfolioBrain.js), and nothing here is
loaded at runtime. Mark it up however you like and the changes get carried back
into that file.

Provenance, so you know what you are reading: this content was written before
the current session and is not machine-generated prose. The document was
assembled by loading the real module and dumping it, so the wording below is
byte-for-byte what ships — but **it is a snapshot**, and it will drift the
moment the source changes.

---

## There is no model here

Worth being blunt about it, because it governs everything else. The chat does
not generate anything. It is a **keyword-scored lookup over eleven hand-written
entries**. A question is matched to one entry, and that entry's prose is
returned verbatim. There is no paraphrasing, no blending of two topics, and no
ability to answer something nobody wrote down.

That has one consequence worth holding on to while you edit: **the only way to
make it answer a new question is to write the answer**. Rewording a trigger word
changes what gets matched, never what gets said.

```
your question
     ↓
score against all 11 topics ──── best score < 3 ? ──→ the fallback answer
     ↓ best score ≥ 3
the winning topic
     ↓
depth control decides how much of it comes back  (quick / balanced / deep / study)
tone control decides whether the connective prose survives  (normal / concise / story)
     ↓
blocks → rendered, word by word, after a 430ms fake "thinking" pause
```

---

## How a question gets matched

`score()` in `portfolioBrain.js`. Each topic owns a list of trigger words, each
with a weight. For a given question:

1. The question is lowercased and stripped of punctuation.
2. **Whole-word match.** A trigger word found as a standalone word scores its
   weight. `driver` matches "driver" but not "drivers" — matching is on
   space-delimited words, so plurals and possessives miss unless listed.
3. **Phrase bonus.** A multi-word trigger that appears intact scores its weight
   **× 1.5**. `hours of service` is worth 9, not 6.
4. **Partial nudge.** Any word in the question longer than three letters, that
   is not a stop word, and that appears as a substring inside *any* of the
   topic's trigger words, adds **0.5**.
5. Highest total wins. **If the winner scores under 3, the fallback is returned
   instead** — no topic at all.

Stop words, ignored in step 4: `the a an is are was were do does did of to in on
for and or me my your you it that this with about what how why can tell show
please`

The threshold of 3 is the dial that matters most. Lower it and the chat starts
confidently answering the wrong question; raise it and it shrugs more often.
Note what it implies: **a question containing exactly one weight-2 trigger word
and nothing else cannot ever match.**

---

## The two controls in the prompt bar

**Depth** is cumulative — each level appends to the one before it, it does not
replace it. Every answer therefore always opens with its Quick paragraph.

| id | Label | Hint shown in the menu | What it adds |
| --- | --- | --- | --- |
| `quick` | Quick answer | One tight paragraph | The `quick` line, plus **one** project card |
| `balanced` | Balanced | Context plus the highlights | `+ balanced` blocks, and **all** cards |
| `deep` | Deep dive | Decisions, trade-offs, numbers | `+ deep` blocks (this is where the numbers live) |
| `study` | Case study | Everything, with the walkthrough | `+ study` blocks |

Default: **Balanced**.

**Tone** is thinner than it looks, and this is the one place the UI currently
over-promises:

| id | Label | Hint shown in the menu | What it actually does |
| --- | --- | --- | --- |
| `normal` | Normal | How I would say it in a review | Nothing. Everything passes through. |
| `concise` | Concise | Straight to the outcome | Keeps the first block, plus every list, stat, card and link. **Drops the connective paragraphs.** |
| `story` | Story | The narrative, start to finish | **Nothing — identical to Normal.** See the audit. |

---

## What the answers are made of

Each depth tier is a list of blocks. Six kinds exist, and the renderer handles
each differently:

| Block | Written as | Renders as |
| --- | --- | --- |
| `p` | `p('…')` | A paragraph |
| `list` | `list(['…','…'])` | A bulleted list |
| `stats` | `stats([{ value, label }])` | The big-number row |
| `cards` | `cards(['project-id'])` | Project cards — added automatically from `cardIds` |
| `links` | `links([{ label, href, external }])` | A link list |
| `note` | `note('…')` | The set-aside line at the end |

`quick` is a bare string, not a block list. Everything else is an array.

---

## Editing it

- **Change wording** — edit the `quick` string or the block arrays in the topic.
  No other file needs to know.
- **Make a question match** — add a trigger word to the topic's `keywords`, with
  a weight. Use 5–6 for a phrase only this topic would own, 2–3 for a word that
  several topics might plausibly claim. Check nothing else now scores higher for
  the questions it used to win.
- **Add a topic** — copy any block in `TOPICS`. `quick` and `keywords` are the
  only required fields; `balanced`, `deep`, `study`, `cardIds` and `followUps`
  may all be empty.
- **Change the chips or the rotating placeholder** — `SUGGESTIONS` and
  `TYPED_PROMPTS` at the bottom of the file.
- **After any edit, re-run the audit below.** Follow-up buttons are plain
  strings fed back through the same matcher, so renaming a trigger word can kill
  a button somewhere else in the file with nothing to warn you.

---

## Audit — every clickable prompt, checked against the matcher

Run on the live module. Every suggested or clickable prompt in the product was
fed through `respond()` to see which topic it actually reaches.

### Six dead prompts

These are prompts the product *offers* and then cannot answer — they score under
3 and land on the fallback, which replies "that one is outside what I have been
briefed on".

**Two are follow-up buttons, which is the worse case** — the visitor clicks a
button the page suggested and gets a shrug:

| Button | Shown under | Why it misses |
| --- | --- | --- |
| "What made the business case land?" | `hours-of-service` | No topic lists `business` or `case`. The answer it wants is already written, in `hours-of-service` → Deep dive. |
| "What else have you built?" | `gazebo` | `built this` exists in `meta` as a phrase, but "have you built" does not contain it intact. |

**Four are rotating placeholder prompts** (`TYPED_PROMPTS`) — lower stakes, since
they are suggestions rather than buttons, but each one invites a question the
chat then refuses:

| Prompt | Why it misses |
| --- | --- |
| "Are you actually an AI?" | `meta` lists the phrase `are you ai`, and "are you **actually** an AI" breaks it up. The single word `ai` is not a trigger anywhere. |
| "Show me something you shipped under pressure" | `shipped` and `pressure` are not triggers on any topic. |
| "How do you design for someone under time pressure?" | Same — `process` owns the answer but not the words. |
| "Which decision here would you take back?" | `decision` is not a trigger anywhere. |

### One mis-route

"What else do you build for yourself?" is offered under `game`, and lands on
`about`. Not broken — the answer is reasonable — but it is not the one the
button is promising.

### Everything else resolves correctly

All 5 suggestion chips, the remaining 6 typed prompts, and the remaining 12
follow-up buttons reach the topic they are aiming at.

### Tone: `story` is inert

`toneAdjust()` has a branch for `concise` and no branch for `story`, so picking
Story returns exactly what Normal returns. The menu advertises "The narrative,
start to finish" and delivers the default. Either the branch needs writing, or
the option needs removing.

---

## The suggestion chips

The five buttons under the prompt bar. The chip shows only the short label; it
submits the full prompt.

| Label | Prompt it submits | Lands on |
| --- | --- | --- |
| Start here | Who are you and what do you work on? | `about` |
| Flagship project | Tell me about Hours of Service | `hours-of-service` |
| Design systems | What did you build for the Gazebo design system? | `gazebo` |
| Outcomes | How do you measure whether a design worked? | `process` |
| Process | What does your design process actually look like? | `process` |

Two chips both resolve to `process`, so Outcomes and Process return an identical
answer.

---

## The rotating placeholder

`TYPED_PROMPTS` — typed and erased in the hero headline and in the home page ask
box. Clicking the headline drops the current one into the input, so these are
effectively buttons too.

| # | Prompt | Lands on |
| --- | --- | --- |
| 1 | Tell me about this year's best work | `best-work` |
| 2 | How did you cut HoS violations by a third? | `hours-of-service` |
| 3 | What belongs in a design system? | `gazebo` |
| 4 | Show me something you shipped under pressure | **`fallback`** |
| 5 | Are you actually an AI? | **`fallback`** |
| 6 | What do you do when research says no? | `process` |
| 7 | How do you design for someone under time pressure? | **`fallback`** |
| 8 | Which decision here would you take back? | **`fallback`** |
| 9 | What does a defect lifecycle actually look like? | `vehicle-health` |
| 10 | How can I reach you about a role? | `contact` |

---

## The fallback

Returned whenever nothing scores 3 or more, and for an empty submit.

That one is outside what I have been briefed on - I only carry what Amitesh has actually written down, so I would rather say so than invent an answer.

Things I can genuinely help with:

- Any of the projects - Hours of Service, Vehicle Health, Gazebo, the NDA work, the game.
- How he works: research, trade-offs, how outcomes get measured.
- How this page is built, and what is really behind the chat.
- How to get in touch, or the resume.

> For anything else, email is the honest route: amiteshdebnath98@gmail.com

**Follow-up buttons:** "Show me your best work" → `best-work`, "What does your
process look like?" → `process`, "How can I reach you?" → `contact`

---

## The eleven topics

Listed in file order, which is also the order ties are broken in — an exact
score tie goes to whichever appears first.

| # | Topic | Covers | Cards |
| --- | --- | --- | --- |
| 1 | `hours-of-service` | ELD, HoS, FMCSA, the flagship | 1 |
| 2 | `vehicle-health` | Inspections, defects, maintenance | 1 |
| 3 | `gazebo` | The design system, complex organisms | 1 |
| 4 | `nda-work` | Vending analytics, Telugu streaming | 2 |
| 5 | `game` | Bangalore Times / Namma Quest | 1 |
| 6 | `process` | How he works, how outcomes get measured | — |
| 7 | `about` | Who he is, the shape of the portfolio | 2 |
| 8 | `contact` | Email, resume, Behance | — |
| 9 | `meta` | "Are you an AI", how the page is built | — |
| 10 | `best-work` | The whole shelf | 3 |
| 11 | `next` | What he is looking for | — |

---

## `hours-of-service`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`hours of service`&nbsp;**6**, `hos`&nbsp;**5**, `eld`&nbsp;**6**, `fmcsa`&nbsp;**5**, `compliance`&nbsp;**3**, `duty status`&nbsp;**5**, `driver log`&nbsp;**4**, `logs`&nbsp;**2**, `roadside`&nbsp;**4**, `trucking`&nbsp;**3**, `fleet`&nbsp;**2**, `violation`&nbsp;**4**, `netradyne`&nbsp;**2**, `driver`&nbsp;**2**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Hours of Service is the work I point people at first. Netradyne was paying an external vendor for ELD, and that vendor sat between the fleet and its own driving data. I designed a native ELD and Hours-of-Service experience inside the driver app, with a manager web portal behind it, so the whole duty-status loop stayed in-house.

**Balanced** — added on top of everything above.

The brief had three edges pulling against each other: it had to be cheaper than the vendor, it had to satisfy FMCSA to the letter, and it could not feel like a new tool to a driver who had already learned the old one.

- Replace the third-party ELD system and the per-device fee attached to it.
- Give drivers a dedicated dashboard for duty cycles, logs and edits.
- Keep the patterns drivers already knew, then fix the parts failing them.
- Hold FMCSA compliance across duty cycles, inspections and roadside checks.

**Deep dive** — added on top of everything above.

The money argument was the easy half. At $6 per device per month, a thousand-device fleet was spending $6,000 a month - $72,000 a year - on something we could own. That framing is what bought the project its runway.

- **$72k** — Annual saving, per 1,000 devices
- **~270k** — Drivers in scope
- **20-35%** — Target cut in HoS violations

The design argument was harder and mattered more. Violations are rarely defiance - they are a driver who did not see the wall coming. So the interface leans on three principles: duty status changes are effortless and automated wherever the data allows, violations and log edits are surfaced loudly instead of buried, and every log stays transparent and correctable so a mistake does not become a permanent mark against someone.

**Case study** — added on top of everything above.

Where it got genuinely difficult was the roadside inspection. That is the one moment where a stressed driver, an officer with no patience for your UI, and a federal data format all meet at once. It is designed as its own mode - one screen, no navigation, nothing to fumble - because the cost of a wrong tap there is not a support ticket, it is a citation.

The manager side is the mirror of that. Fleet managers needed to see unassigned logs, pending edit suggestions and diagnostics without drowning in them, so the portal sorts by what is about to become a compliance problem rather than by what changed most recently.

**Project cards shown:** `hours-of-service`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "How did you handle roadside inspections?" → `hours-of-service`
- "What made the business case land?" → `fallback`  ← **dead, see audit**
- "Show me the Vehicle Health project" → `vehicle-health`


---

## `vehicle-health`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`vehicle health`&nbsp;**6**, `maintenance`&nbsp;**5**, `defect`&nbsp;**5**, `inspection`&nbsp;**4**, `technician`&nbsp;**4**, `dvir`&nbsp;**4**, `repair`&nbsp;**3**, `scheduling`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Vehicle Health is the maintenance and defect-management side of fleet work: drivers run daily inspections, defects get logged and assigned, technicians resolve them, and managers can prove all of it happened when an audit asks.

**Balanced** — added on top of everything above.

The failure mode I was designing against is familiar to anyone who has shipped an internal tool - the tool that forces operators to adapt to it gets worked around, and once people work around it the data underneath stops being true.

- Daily vehicle inspections a driver can actually finish before a shift.
- Defect reporting and tracking that holds up for compliance.
- Assignment and resolution flows spanning mobile, tablet and desktop.
- Exportable reports and permission-based controls for audits.

**Deep dive** — added on top of everything above.

The numbers moved because the friction moved. Speed was the lever: an inspection that fits in the gap before a shift gets done properly, and a defect that takes one screen to log gets logged instead of remembered.

- **40%** — Faster inspection completion
- **+25%** — Daily inspection compliance
- **35%** — Fewer recurring defects
- **>80** — SUS score in usability testing

The recurring-defect number is the one I care about most. It means the loop actually closed - that a defect raised by a driver reached a technician and came back resolved, rather than being re-reported every week by someone who assumed nobody was listening.

**Case study** — added on top of everything above.

It is built as one system across three devices rather than three products. A driver logs a defect on a phone at the vehicle, a supervisor triages it on a tablet, a technician works it on a desktop - same objects, same states, different densities. Deciding that early is what kept the defect lifecycle coherent instead of forking into three slightly different truths.

**Project cards shown:** `vehicle-health`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "How do you measure design outcomes?" → `process`
- "Tell me about Hours of Service" → `hours-of-service`
- "What does your process look like?" → `process`


---

## `gazebo`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`gazebo`&nbsp;**6**, `design system`&nbsp;**6**, `component library`&nbsp;**5**, `organism`&nbsp;**5**, `atomic`&nbsp;**3**, `token`&nbsp;**3**, `mega menu`&nbsp;**4**, `notification`&nbsp;**3**, `bulk`&nbsp;**4**, `recruiter`&nbsp;**3**, `scoring`&nbsp;**4**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Gazebo is a unified design system and component library, and the part I documented is the hard end of it - complex organisms. Buttons are a solved problem. A mega menu, a notification panel, a bulk-action flow and a job card displaying a live scoring model are where a design system either earns its keep or quietly falls apart.

**Balanced** — added on top of everything above.

Complex organisms are where system thinking stops being about consistency and starts being about logic. Each one carries state, permissions and edge cases a token file cannot express.

- Mega menu, across default and focus states.
- Notification panel: default, hovered, active, and action-taken.
- Search across its default, focused and mid-interaction states.
- Bulk selection, bulk compose and the full bulk-action flow.
- Job cards, recruiter dashboards and application progress states.

**Deep dive** — added on top of everything above.

The job card is the piece worth pulling out. It surfaces a real-time conversion probability, and the design problem was making a weighted model legible without pretending it is a promise.

- Pool-based normalisation: 25%, against 330 applications.
- Stage elevated to "Viewed": +10%.
- Strong profile match: +5%.
- Recruiter pinned the job: +4%.

Each factor contributes a weighted score and the sum is the live conversion probability. Showing the breakdown rather than the single number is deliberate - an unexplained percentage is either ignored or over-trusted, and both are worse than a number you can interrogate.

**Case study** — added on top of everything above.

There is a smaller decision in there I still like: counts cap at 99 visually, and anything beyond that moves into a detail view on click. It sounds trivial. It is the difference between a dashboard that stays scannable at a glance and one that turns into a wall of four-digit numbers nobody reads.

**Project cards shown:** `gazebo-complex-organisms`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "How do you decide what belongs in a design system?" → `gazebo`
- "What else have you built?" → `fallback`  ← **dead, see audit**
- "Tell me about your process" → `process`


---

## `nda-work`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`nda`&nbsp;**6**, `vending`&nbsp;**5**, `telugu`&nbsp;**5**, `streaming`&nbsp;**5**, `ott`&nbsp;**4**, `kellogg`&nbsp;**4**, `subscription`&nbsp;**3**, `player`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Two of the projects sit under NDA, so the public write-ups are deliberately thin: a vending analytics dashboard spanning desktop and mobile, and a Telugu streaming platform covering language onboarding, the subscription flow and the player itself.

**Balanced** — added on top of everything above.

What I can talk about is the shape of the problems rather than the screens. The streaming work was about a first-run experience where language choice is the single most consequential decision a user makes, and a subscription flow that had to survive being the thing standing between someone and the film they came for.

- Language-first onboarding, before anything else is asked.
- Subscription flow designed around the moment of intent, not a settings page.
- Player controls covering quality selection and skip-song behaviour.
- A style guide holding the whole surface together.

**Deep dive** — added on top of everything above.

If you want the detail behind either of these, ask me directly - most of it I can walk through in a conversation even where I cannot publish the artefacts.

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** `telugu-streaming`, `vending-analytics`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "How can I reach you?" → `contact`
- "Show me work that is not under NDA" → `nda-work`


---

## `game`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`game`&nbsp;**5**, `bangalore`&nbsp;**5**, `phaser`&nbsp;**5**, `namma`&nbsp;**5**, `quest`&nbsp;**3**, `play`&nbsp;**3**, `side project`&nbsp;**4**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Bangalore Times - Namma Quest - is a casual social game set in Bangalore, built with Phaser and React. It runs inside this site rather than linking out, and yes, it is playable right now.

**Balanced** — added on top of everything above.

It is the side project that keeps me honest. Designing a game means no dashboard patterns to fall back on: if the feedback loop is not satisfying in the first ten seconds, nothing else you did matters. That lesson transfers back into product work more often than it has any right to.

**Deep dive** — added on top of everything above.

It is lazy-loaded so the Phaser bundle only downloads if you actually open it - about a megabyte nobody visiting the portfolio should have to pay for.

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** `bangalore-times`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "What else do you build for yourself?" → `about`
- "Tell me about your process" → `process`


---

## `process`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`process`&nbsp;**6**, `how do you work`&nbsp;**6**, `approach`&nbsp;**5**, `method`&nbsp;**4**, `workflow`&nbsp;**4**, `research`&nbsp;**4**, `discovery`&nbsp;**4**, `testing`&nbsp;**3**, `collaborate`&nbsp;**3**, `measure`&nbsp;**4**, `outcome`&nbsp;**3**, `philosophy`&nbsp;**4**, `worked`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

I start from the operational reality rather than the screen. Most of my work has been for people doing a job under time pressure - drivers, technicians, fleet managers - and in that world the best interface is usually the one that disappears fastest.

**Balanced** — added on top of everything above.

Practically, that means the same four moves, in roughly this order:

- Find the workaround. People have already solved the problem badly; that solution tells you the real constraint.
- Make the business case in the language of the business. $6 per device per month bought Hours of Service its runway.
- Design for the worst moment, not the happy path - the roadside stop, the failed inspection, the mistake that needs undoing.
- Instrument it, then argue from the numbers instead of from taste.

**Deep dive** — added on top of everything above.

The measurement habit matters more than it sounds. "40% faster inspections" and "SUS above 80" are not decoration on a case study - they are what let the next proposal get funded. Design that cannot describe its own effect gets treated as decoration, and then gets cut first.

I also try to preserve familiarity aggressively. On Hours of Service we kept patterns from the third-party app people were already trained on, even ones I would not have chosen from scratch, and spent the redesign budget on the parts genuinely failing. Novelty is a cost you pay out of someone else’s working day.

**Case study** — added on top of everything above.

And I build. This page, the game, the prototypes in this repo - being able to get a real thing running changes what I am willing to propose, because I am not guessing at whether it can be made.

**Project cards shown:** none

**Follow-up buttons under the answer:**

- "What are you looking for next?" → `next`
- "Show me your best work" → `best-work`
- "How can I reach you?" → `contact`


---

## `about`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`who are you`&nbsp;**7**, `about you`&nbsp;**6**, `yourself`&nbsp;**5**, `amitesh`&nbsp;**6**, `background`&nbsp;**4**, `experience`&nbsp;**4**, `bio`&nbsp;**4**, `designer`&nbsp;**3**, `introduce`&nbsp;**5**, `hello`&nbsp;**3**, `hey`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

I am Amitesh - a product designer working mostly on fleet safety and compliance software at Netradyne. Dense, operational, regulated interfaces, used by people who did not choose the software and cannot afford it to waste their time.

**Balanced** — added on top of everything above.

The portfolio splits into three groups: fleet products (Hours of Service, Vehicle Health), design-system work (Gazebo), and earlier platform work now under NDA. There is also a game, because not everything has to be a dashboard.

**Deep dive** — added on top of everything above.

If you want the fastest read on how I think, open Hours of Service. It has the clearest version of the thing I care about - a design argument and a financial argument making the same case, so nobody had to choose between them.

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** `hours-of-service`, `vehicle-health`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "What does your process look like?" → `process`
- "Show me your best work" → `best-work`
- "How can I reach you?" → `contact`


---

## `contact`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`contact`&nbsp;**6**, `reach`&nbsp;**5**, `email`&nbsp;**6**, `hire`&nbsp;**6**, `resume`&nbsp;**6**, `cv`&nbsp;**5**, `available`&nbsp;**4**, `freelance`&nbsp;**4**, `work together`&nbsp;**6**, `linkedin`&nbsp;**3**, `behance`&nbsp;**5**, `opportunity`&nbsp;**4**, `role`&nbsp;**4**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Easiest route is email: amiteshdebnath98@gmail.com. The resume is a download away, and older work that never made it into this portfolio lives on Behance.

**Balanced** — added on top of everything above.

- [amiteshdebnath98@gmail.com](mailto:amiteshdebnath98@gmail.com)
- [Download resume (PDF)](/Amitesh_SPD.pdf)
- [Behance - archisapien](https://www.behance.net/archisapien)

**Deep dive** — added on top of everything above.

If you are reading this because you are hiring: tell me what is actually broken rather than what the job description says, and I will tell you honestly whether I am the right person for it.

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** none

**Follow-up buttons under the answer:**

- "What are you looking for next?" → `next`
- "Tell me about your process" → `process`


---

## `meta`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`this site`&nbsp;**5**, `this page`&nbsp;**5**, `built this`&nbsp;**5**, `how does this work`&nbsp;**6**, `are you ai`&nbsp;**6**, `chatbot`&nbsp;**5**, `llm`&nbsp;**5**, `real ai`&nbsp;**6**, `gpt`&nbsp;**4**, `claude`&nbsp;**4**, `tech stack`&nbsp;**5**, `react`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Straight answer: I am not a language model. I am a curated retrieval layer - every sentence here was written by Amitesh, matched to your question by keyword scoring. The chat framing is the interface, not a claim about what is underneath.

**Balanced** — added on top of everything above.

The page is React 19, React Router and Framer Motion, with the material above the input drawn as a point cloud on a 2D canvas - roughly 2,200 points on a noise-deformed sphere, no 3D library involved. The glass is CSS: layered translucency, a masked 1px gradient rim, and a pointer-tracked glow running on springs.

**Deep dive** — added on top of everything above.

The depth control in the prompt bar is real, not decorative - it changes how much of an entry comes back. Everything here is designed so that swapping this brain for an actual model API is a single function replacement, with the rendering layer untouched.

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** none

**Follow-up buttons under the answer:**

- "Tell me about your process" → `process`
- "Show me your best work" → `best-work`


---

## `best-work`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`best work`&nbsp;**6**, `proud`&nbsp;**5**, `favourite`&nbsp;**5**, `favorite`&nbsp;**5**, `strongest`&nbsp;**4**, `highlight`&nbsp;**4**, `portfolio`&nbsp;**4**, `projects`&nbsp;**5**, `trends`&nbsp;**3**, `everything`&nbsp;**3**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

Here is the whole shelf. If you only have time for one, make it Hours of Service - it is the clearest example of a design argument and a business argument arriving at the same answer.

**Balanced** — added on top of everything above.

- Hours of Service - native ELD and duty-status for ~270,000 drivers.
- Vehicle Health - inspections and defect management, 40% faster completion.
- Gazebo Complex Organisms - the load-bearing end of a design system.
- Telugu Streaming and Vending Analytics - earlier platform work, under NDA.
- Bangalore Times - a Phaser game, playable inside this site.

**Deep dive** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** `hours-of-service`, `vehicle-health`, `gazebo-complex-organisms`  
_(Quick answer shows only the first; every other depth shows all.)_

**Follow-up buttons under the answer:**

- "Tell me about Hours of Service" → `hours-of-service`
- "What does your process look like?" → `process`
- "How can I reach you?" → `contact`


---

## `next`

**Trigger words** (word, weight) — a multi-word phrase scores its weight × 1.5:

`looking for`&nbsp;**5**, `next`&nbsp;**4**, `future`&nbsp;**4**, `goal`&nbsp;**4**, `want to work`&nbsp;**5**, `interested in`&nbsp;**4**, `ambition`&nbsp;**4**

### Answer, by depth

**Quick answer** — always shown, the first paragraph of every depth.

I want to keep working where the stakes are real and the constraints are honest - regulated, operational products where a design decision shows up in someone’s day rather than in an engagement metric.

**Balanced** — added on top of everything above.

The thing pulling at me lately is exactly what this page is: interfaces where the primary control is language. Most of the design craft for that is still unwritten, and the products shipping it are mostly ignoring the operational users I have spent my career on.

**Deep dive** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Case study** — added on top of everything above.

_(nothing at this tier — it inherits everything above)_

**Project cards shown:** none

**Follow-up buttons under the answer:**

- "How can I reach you?" → `contact`
- "Tell me about your process" → `process`

---

## Project cards

`PROJECTS` in the same file. A topic's `cardIds` point in here; these are the
card title, blurb and destination, not answer text.

| id | Title | Blurb | Route |
| --- | --- | --- | --- |
| `hours-of-service` | Hours of Service | Native ELD and HoS for drivers, run from a manager web portal. | `/projects/hours-of-service` |
| `vehicle-health` | Vehicle Health | Inspections, defect management and maintenance scheduling. | `/projects/vehicle-health` |
| `gazebo-complex-organisms` | Gazebo Complex Organisms | The hard end of a design system: organisms that carry real logic. | `/projects/gazebo-complex-organisms` |
| `vending-analytics` | Vending Analytics | An analytics dashboard across desktop and mobile. Under NDA. | `/projects/vending-analytics` |
| `telugu-streaming` | Telugu Streaming Platform | Onboarding, subscription and playback for a regional OTT. Under NDA. | `/projects/telugu-streaming` |
| `bangalore-times` | Bangalore Times | Namma Quest - a casual social game built with Phaser and React. | `/game/bangalore-times` |

`bangalore-times` reuses `telugu-streaming`'s image — it has no artwork of its own.

---

## Where each piece lives

| What | File |
| --- | --- |
| Topics, answers, matcher, fallback, chips, placeholders | `src/lib/portfolioBrain.js` |
| The chat page — thinking delay, streaming, regenerate | `src/pages/HomeV22.jsx` |
| Prompt bar, depth and tone menus, dictation | `src/components/chat/PromptBar.jsx` |
| The suggestion chips | `src/components/chat/SuggestionRail.jsx` |
| The rotating headline | `src/components/chat/TypedHeadline.jsx` |
| The home page ask box that hands over via `?q=` | `src/components/HeroPrompt.jsx` |
| Block rendering | `src/components/chat/Transcript.jsx` |

Two other hardcoded strings, both in `HomeV22.jsx`: the kicker
**"Portfolio, as a conversation"**, and the input placeholder — **"Ask anything…"**
before the first question, **"Ask a follow-up…"** after it.

The 430ms pause before an answer appears (`THINK_MS`) is deliberate staging, not
computation. Nothing is being worked out during it.

---

## Replacing this with a real model

The file is built so that this is one function. `respond(query, depth, tone)`
returns `{ topicId, blocks, followUps }`, and the rendering layer knows only
those block shapes. Swap the body for a `fetch`, keep the return shape, and no
component changes.

If that happens, this document stops describing a lookup table and starts
describing a system prompt — the topics become the grounding corpus rather than
the answers themselves, and the audit above stops mattering because matching
stops being lexical.
