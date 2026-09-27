# Editing this template

You are filling a fixed landing-page template for a small business. Read this
before you touch a file. The rules below are not style preferences: most of them
are enforced by `src/guard.ts` and will fail the build if you break them.

## Where things live

| File | What it is | How often you edit it |
| --- | --- | --- |
| `src/site.ts` | All the content, plus the four design axes | Every task |
| `src/components/*.astro` | The section layouts | Only when a brief needs a structure that is not there |
| `src/styles/global.css` | Palettes, type pairings, radius systems | Almost never. Add a palette rather than overriding one |
| `src/guard.ts` | The build-time rules | Never. If a rule is wrong, say so; do not weaken it |

Start with `src/site.ts`. Most briefs need nothing else.

## The four design axes

Set these in `site.design`. They are what stops every business getting the same
page, so **choose them from the brief**, do not leave the defaults.

- **`palette`**: `forest` (trades, outdoors, physical work) · `cobalt`
  (professional services, finance, legal) · `terracotta` (food, hospitality,
  makers) · `olive` (garden, land, agriculture) · `ink` (design, architecture,
  photography, anything where the work should carry the colour) · `signal`
  (health, care, clinics)
- **`type`**: `grotesk` (default, neutral and current) · `warm` (friendly,
  consumer-facing) · `character` (distinctive, for a business with personality)
  · `heritage` (the only serif, and it needs a reason that is about this
  business - forty years of trading, a craft tradition, a family firm. "It feels
  premium" is not a reason)
- **`rhythm`**: `split` (copy and image side by side) · `offset` (headline runs
  wide, image below) · `frame` (narrow copy column, large image)
- **`radius`**: `sharp` · `soft` · `pill`. Locked for the whole page.

Rotate them. If the last site you built was forest + grotesk, this one should
not be.

## Rules the build enforces

`astro build` fails with a message naming the field if you break any of these:

- **No em dashes** anywhere a visitor can read, including alt text. Use a
  period, a comma, parentheses, or ` - `.
- **Headline** max 52 characters. The real rule is two lines at desktop.
- **Hero subtext** max 20 words. If the offer needs more, it is not clear yet.
- **CTA label** max 3 words, or the button wraps.
- **Nav** max 5 links, or it wraps to a second line at desktop.
- **No filler verbs**: elevate, seamless, unleash, next-gen, revolutionize,
  cutting-edge, world-class, best-in-class.
- **No placeholder names**: Acme, Jane Doe, John Doe, "Your Business".
- **At least 3 real images**, each with width, height and real alt text.
- 2 to 5 services, 3 to 5 process steps, at least 3 questions.

## Rules the build cannot enforce. Follow them anyway.

- **One CTA, one label.** There is a single `cta` in `site.ts` and the nav, the
  hero and the form all use it. Do not add a second call to action with the same
  intent worded differently.
- **No eyebrows.** There is no field for the small uppercase label above a
  section heading, and you should not add one to a component. Every generated
  page has one above every section, and the rhythm is the giveaway.
- **Write like the owner talks.** A plumber does not say "bespoke solutions", he
  says "I'll come and look at it". Specific beats impressive: "back within three
  working days" is worth more than "fast turnaround".
- **Use the real numbers from the brief.** If the brief says fourteen years, do
  not write "over a decade". If it gives no number, leave the field out rather
  than inventing one.
- **Nothing centered in the hero.** The three rhythms are all asymmetric on
  purpose.
- **Never three equal cards in a row.** `Offer.astro` is a divided list for this
  reason. Do not rewrite it as a grid.

## Images

**The owner's own photographs come first.** If any were supplied you will find
them listed in your brief, already sitting in `public/assets/`. Reference them
as `/assets/<filename>` and use the dimensions given. That path works in the
preview, in the published site and in an export, so do not rewrite it.

Match the photograph to the slot by what it actually shows. A picture of a
finished hedge belongs in the work section; a picture of the van does not belong
in the hero. If the owner's description and the slot do not match, leave the
photograph out rather than captioning it into something it is not.

**Only where there is no photograph**, fall back to
`https://picsum.photos/seed/<descriptive-slug>/<w>/<h>`. Understand what that
gives you: Picsum returns a real photograph chosen at random by the seed. It is
not a photograph of this business, of this trade, or of anything related. It is
a stand-in that keeps the layout honest about needing images.

**Say which slots are still placeholders** in your summary, by name. "The hero
and the second work item are still placeholders" is useful. "Images are
placeholders" is not, and neither is silence.

## Commands

```bash
npm run build     # type-check, run the guard, write dist/
npm run dev       # a dev server, if you need to look at something interactively
```

`npm run build` is the gate. If it fails, read the message: it names the field
and says what to change.
