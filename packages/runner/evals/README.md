# Evals

PRD section 6.8: "Every production failure becomes a new golden task. Run the
suite before merging any prompt/tool change; block on regression."

```bash
node scripts/eval.ts                      # everything
node scripts/eval.ts landing              # the 30 briefs
node scripts/eval.ts landing --limit 5    # a sanity check, five briefs
ANTHROPIC_API_KEY=... node scripts/eval.ts landing
```

The runner exits non-zero below a 70% task success rate, which is PRD section
9's Phase 1 exit bar.

## The five suites

**Basics** (`hello-world.json`, `count-lines.json`, `recover-from-error.json`).
Tasks the agent should be able to finish with a shell and a filesystem. Each
declares its own checks. `recover-from-error` is the one worth keeping: it
passes only if the agent adapts to a failure rather than retrying the same
command, which is the behaviour PRD section 6.1's adopt-rule 5 exists for.

**Landing** (`landing.json`). Thirty real small businesses - hedgelayer, sourdough
bakery, employment solicitor, sports physio, wedding photographer, bookkeeper
for trades, dog groomer, electrician, Montessori nursery, joiner, Mandarin
tutor, coffee roaster, mobile bike mechanic, accountant, garden designer, house
clearance, yoga studio, drone surveyor, caterer, piano tuner, copywriter,
dyslexia assessor, tree surgeon, security consultancy, upholsterer, childminder,
commercial cleaner, van converter, translator, beekeeper.

Half are trades and half are not, on purpose: a template that only flatters
plumbers is not a template. Each is fed in through the business profile exactly
as the onboarding interview fills it, so the eval walks the same path a real
user does rather than a shortcut.

## What is checked

Per task: the task succeeded, a version was captured, the page builds, every
**blocking** browser check passes at both phone and desktop widths, the page
actually names the business, and none of the template's example content is left
on it.

Across the suite: **design variety**. Thirty pages that each pass on their own
but share one palette and one typeface is a template whose axes nobody chose,
and it is a failure only the suite can see. The runner prints the spread and
warns below three palettes.

**Research** (`research.json`). Six questions a real owner would ask, across
three businesses. The checks are about whether the report can be **trusted**
rather than whether it reads well: does every `[n]` resolve to a listed source,
are at least three distinct sources cited, is there a Sources section at all. A
report that reads beautifully and cites nothing is the failure worth catching.

These report N/A offline. The fixture search provider only covers the queries it
recorded, and a research suite that passes on recorded answers is measuring the
fixtures. Set `TAVILY_API_KEY` to run them.

**Slides** (`slides.json`). Four decks, scored on PPTAgent's PPTEval dimensions.
The mechanical half of each is asserted: **Content** is slide count, bullet
length, filler copy and whether metrics carry a real number; **Design** is
layout variety and whether any slide's text runs off the bottom, measured in a
browser because it is invisible in the JSON and fatal on a projector;
**Coherence** is opening on a title and closing on what happens next.

What is not asserted is whether the argument is any good. That is the part of
PPTEval a rubric and a person do, and pretending a script can is how an eval
suite stops meaning anything.

**Growth** (`growth.json`). Four briefs for posts and cold emails. Most of the
checks are about the copy - platform limits, filler, unbacked superlatives, and
the two things a cold email needs by law - but the one that matters is the
simplest: after a drafting task, **nothing has been executed**. If that ever
fails, Phase 3 has failed regardless of how good the posts are.

Also reported, because PRD sections 4 and 9 ask for them: task success rate,
total cost, cost per task, median duration, median cache hit rate.

## What is deliberately not here

- **An LLM judge.** Phase 1's outcomes are checkable - it built or it did not,
  the heading is two lines or it is three - and a judge would add cost and
  variance without adding signal. Where a model's opinion does earn its place is
  inside the build loop, as the advisory visual review that the builder can act
  on and no gate depends on.
- **Lighthouse.** The checks that matter for a static page with no JavaScript
  are contrast, layout shift and image sizing, and those are measured directly.
  A Lighthouse score would mostly be measuring the local static server.
- **A CI gate.** The suite has to be stable and to cost a known amount before it
  can block a merge. Run it by hand, watch the cost-per-task number, then wire
  it up.

## What is not an eval suite

Phase 4 - credits, quotas, metering - has no golden tasks, and should not. Its
correctness is not a matter of degree: a balance either reconciles or it does
not, a hold is either settled once or twice. Those are assertions, and they live
in `src/core/__tests__/ledger.test.ts` and in the acceptance script's Phase 4
section, where they run in under a second and cost nothing.

`node scripts/margin.ts` is the Phase 4 counterpart to an eval: it reads the
traces and reports what the routing actually costs, by agent and by model, with
the counterfactual for each tier. It measures spend rather than quality, and it
says so.

## Running it offline

The scripted provider replays one fixed script per agent, so exactly two tasks
can pass and the rest report N/A rather than failing. That tells you the harness
works. It tells you nothing about the agent.

## Adding a task

When something fails in production, add it here **before** fixing it. That is
the loop section 6.8 describes, and it is the only one that makes the suite grow
in the right direction.

A basics task is one JSON file with its own `checks`. A landing, research or
slides task is one more entry in that suite's `tasks` array - a profile and a
prompt, nothing else, because every task in a suite is checked the same way.

The research and slides suites name their profile rather than inlining it, so
adding a task for an existing business is one line.
