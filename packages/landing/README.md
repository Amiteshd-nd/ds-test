# landing

A one-screen pre-launch page for an architecture platform. It takes an email address,
adds it to a Resend segment, and sends one confirmation email. The render sits in a
drafting-sheet frame that doubles as the teaser thumbnail and opens the video in a
modal. The page never scrolls and works with JavaScript off.

## Two iterations

| Route | Iteration | Look |
| --- | --- | --- |
| `/` | 2 | A white card on a crowd of hand-drawn architecture stickers. Modelled on the first seconds of the hilos launch film: paper, pills, a mascot, nothing moving. |
| `/v1` | 1 | Dark ground, aurora light, chrome, the render in a tilting frame. |

Both share the copy in `src/content.ts`, the form, the server action and the teaser.
To make iteration 1 the default, swap the two `page.tsx` files (and the render import
path in the one that moves). The share card follows iteration 2.

### Iteration 2

The crowd is 44 famous buildings as die-cut stickers: bold black line art, white
fill, no faces, a quarter of them Indian (Taj Mahal, Gateway of India, Lotus Temple,
Howrah Bridge, Red Fort, Qutub Minar, Hawa Mahal, Golden Temple, Meenakshi Temple,
Charminar, Mysore Palace). They were generated with Gemini's image model from the
descriptions in `src/lib/landmarks.ts` and cut out of their white backgrounds by
`scripts/cutout-stickers.py`, so they can pile up and overlap. The style prompt was
first proved in Figma (file "Plinth landing stickers", one credit) before the batch.

The crowd is real DOM, not a background image, so every sticker reacts to the
pointer: it pops, tilts, rises above its neighbours and fills with one colour on hover
(CSS only). The fill is painted inside the drawing's own lines: `scripts/colour-stickers.py`
finds every enclosed white region of each sticker and paints it a flat colour from
`src/lib/landmarks.ts` (`color` for the body, `tint` for the upper material, `base` for
a pedestal or plinth, small details a step darker), writing `public/stickers/fill/`.
The page multiplies that over the sticker on hover, so the building reads as solid
colour blocks bounded by its lines, like a coloured sticker. Re-run the script after
changing a colour or a sticker. A click opens a label by the sticker
(`crowd-tips.tsx`): the name in semibold with a button that copies it, the place
below in grey. It measures itself and stays inside the window. Click again, click
elsewhere or press Escape to close. They are
laid out once on a seeded, brick-offset grid in a fixed field that is centred and
scaled to the screen, with no repeat within two cells, so it is the same crowd on
every screen. Rows sit half a sticker apart with no vertical jitter and are drawn top
to bottom, so each row shingles over the one above: the bottom edge of every sticker
is hidden by the stickers below it, and no white shows through.
Two layers: the crowd sits behind the card, except along the card's bottom edge,
where the stickers that touch it sit in front, clip its border (never its words) and
lift above the card on hover. The server makes a first guess from the desktop card
size; after load (and on resize) the provider in `crowd.tsx` measures the real card
and recomputes which stickers are in front, so the split is right on every screen.
The arrangement is reshuffled with a random seed on every load, after the first
paint. On phones the front layer is off, because the card is a different shape there.

To change the set: edit `src/lib/landmarks.ts`, put a Gemini key in `.env.local` as
`GEMINI_API_KEY`, and run `node scripts/generate-stickers.mjs`. It only generates
what is missing (raw renders are kept in `.stickers-raw/`, gitignored) and re-cuts
everything into `public/stickers/`. Pass a slug to redo one, `--force` to redo all.
The mascot on the card is `src/components/mascot.tsx`.

### Iteration 1

Dark ground, lit by three slow aurora lights and one that follows the pointer. Chrome
(the wordmark, the primary button, the play badge) is the only "material"; mint is the
only accent. Newsreader for the headline, Geist for UI, Geist Mono for labels, and the
blackletter wordmark. The layout is asymmetric: copy and form left, the framed render
right, stacked on phones.

Motion, all through `@cloud-march/motion` tokens: a staggered blur-in on first paint,
the pointer light on a slow spring, the frame tilting a few degrees toward the cursor
with a sheen that follows it, a one-shot sheen across the button on hover, and the
player dialog fading up. Every one of them collapses under `prefers-reduced-motion`,
and the pointer light is off for touch devices. There is no custom cursor on purpose.

```bash
pnpm dev:landing            # http://localhost:6186
pnpm --filter landing email:preview   # React Email preview, http://localhost:6187
pnpm build:landing
```

With no `RESEND_API_KEY` in development, signups log what they would have done and
succeed, so the page is testable offline. In production a missing key is an error.

## Layout of the package

```
src/content.ts                 every string on the page and in the email
src/app/page.tsx               iteration 2, the default
src/app/v1/page.tsx            iteration 1
src/lib/landmarks.ts           the buildings in the crowd, and how to describe them to the model
src/lib/stickers.ts            the seeded crowd layout
scripts/generate-stickers.mjs  generates the stickers with Gemini, then cuts them out
scripts/cutout-stickers.py     the cut-out step (white background → transparent)
src/app/actions.ts             the server action: honeypot → zod → rate limit → store → email
src/components/waitlist-form.tsx  the form (client, progressively enhanced, glass input)
src/components/hero-frame.tsx  (v1) the framed render: tilt, sheen, and the <dialog> player
src/components/aurora.tsx      (v1) the aurora lights and the pointer light
src/components/crowd.tsx       (v2) the sticker crowd as DOM: layout, reshuffle, back and front layers
src/components/crowd-tips.tsx  (v2) the click label: name, copy button, place
src/components/teaser-link.tsx (v2) text link + <dialog> player
src/components/mascot.tsx      (v2) the house on a skateboard
src/components/entrance.tsx    the staggered first-paint entrance
src/lib/waitlist.ts            the store. The only file that knows it is Resend
src/lib/mailer.tsx             renders and sends the confirmation
src/lib/rate-limit.ts          in-memory token bucket, 5/min per IP
emails/confirmation.tsx        the React Email template
public/bg.jpg                  (v1) the hero render (drawn placeholder until the real one exists)
public/stickers/               (v2) the 44 cut-out stickers
public/teaser/                 the teaser film (from packages/teaser) and its poster
public/fonts/                  TTFs for the OG image, favicon and email (OFL, licences alongside)
assets/reference/              the reference the layout was matched against. Not served
BACKGROUND-PROMPT.md           the prompt for the real render
MANUAL-TASKS.md                everything left that needs a person
```

## Setup

### 1. Resend: verify a domain

1. Sign in at [resend.com](https://resend.com) → **Domains** → **Add domain**. Use a
   subdomain you control for sending, for example `mail.yourdomain.com`.
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `CNAME`s, and the `MX` for bounces)
   at your DNS provider. Add a DMARC record too if you do not have one:
   `_dmarc` `TXT` `v=DMARC1; p=none;`.
3. Wait for **Verified**. `EMAIL_FROM` must use this domain, for example
   `Gazebo <hello@mail.yourdomain.com>`.

### 2. Resend: create the segment (formerly "audience")

Resend renamed Audiences to Segments in late 2025; old audience IDs still work as
segment IDs. **Audience** / **Segments** → **Create** → name it `Waitlist` → copy the ID
into `RESEND_AUDIENCE_ID`.

### 3. API key

**API Keys** → **Create**. Give it **Full access**: adding contacts needs more than the
"Sending access" permission. Put it in `RESEND_API_KEY`.

### 4. Local env

```bash
cp .env.example .env.local
```

Fill in the four values. `NEXT_PUBLIC_SITE_URL` is the absolute origin with no trailing
slash; it feeds the canonical URL, Open Graph tags and the font URLs in the email.

### 5. Deploy to Vercel

1. Import the repo in Vercel. Set **Root Directory** to `packages/landing`. Vercel
   detects Next.js and pnpm; leave the build and install commands on their defaults.
   (It installs from the repo root, which the `@cloud-march/motion` workspace
   dependency needs.)
2. Add the four env vars under **Settings → Environment Variables**. If you leave
   `NEXT_PUBLIC_SITE_URL` unset, the production domain Vercel assigns is used.
3. Deploy. Submit your own address once and check it lands in the segment and the
   inbox.

## Swapping things

**The render.** Replace `public/bg.jpg` with the real one (3:2 landscape, at least
2400px wide, JPEG around quality 80) and rebuild. Dimensions, the blur placeholder and
the Open Graph card all regenerate from the file. It is shown inside a frame now, not
full-bleed, so the whole image is visible and nothing needs repositioning. The prompt is
in `BACKGROUND-PROMPT.md`.

**The copy.** Everything is in `src/content.ts`, including the product name, which the
wordmark, footer, metadata, favicon, share card and email all read from. Page copy has
no em-dashes by repo rule (see `.claude/skills/taste-skill`).

**The store.** `src/lib/waitlist.ts` exports `addToWaitlist(email)` and nothing else.
To move to Postgres or Supabase, rewrite that function with an
`insert ... on conflict (email) do nothing` and leave the rest alone.

**The teaser.** The film itself is rendered from code in `packages/teaser`
(`pnpm render:teaser` writes `out/teaser-1080p.mp4` and `out/teaser-4k.mp4`). The 1080p
cut is copied to `public/teaser/gazebo-teaser.mp4`, with its first frame as the poster;
after a re-render, copy it again and update `duration` in `src/content.ts`. Hovering
"Watch the teaser" shows a preview card with the poster; a longer hover plays the film
inside it, muted and looping (not on touch screens, and never under reduced motion). A
click opens it in a dialog with sound. Without JavaScript the link goes straight to the
file.

## Where signups go

The form posts to a Next.js **server action** (`src/app/actions.ts`); there is no
separate backend or database to run. The action validates the address, rate-limits by
IP, then calls `addToWaitlist` in `src/lib/waitlist.ts`, which creates a **contact in
Resend** and adds it to the segment in `RESEND_AUDIENCE_ID`. That segment *is* the list:
view, search and export it (CSV) in the Resend dashboard under Audience / Contacts, and
send the launch email to it from Broadcasts. With no API key in development nothing is
stored; the terminal shows a `[waitlist] dry run` line instead.

## Behaviour worth knowing

- **Never says whether an address is already on the list.** An existing contact is
  attached to the segment and gets the same success message.
- **The confirmation is idempotent for 24 hours.** It is sent with an idempotency key
  per address, so double submits and retries after a half-failed signup cannot send two
  copies. After 24 hours a repeat signup gets the email again, which is the reassuring
  outcome for someone who forgot they signed up.
- **Honeypot hits get a success response** and touch nothing.
- **The rate limit is per server instance.** On Vercel that makes it looser than 5/min.
  The TODO in `src/lib/rate-limit.ts` describes the Upstash swap.
- **Without JavaScript** the form posts to the server action and the page re-renders
  with the result, success message included.

## Checked

At 1440×900, 1280×720, 1024×1366, 768×1024, 390×844, 375×667, 844×390 and 1024×600:
no overflow in either axis and nothing under the footer. On 844×390 the frame, eyebrow
and lede give way to a pill that opens the same player.

Lighthouse on the production build, with the placeholder render and teaser:

| Route | Run | Performance | A11y | Best practices | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` (iteration 2) | Mobile, measured throttling | 96 | 100 | 100 | 100 | 1.7 s | 0.002 |
| `/` (iteration 2) | Desktop preset | 99 | 100 | 100 | 100 | 1.0 s | 0 |
| `/v1` (iteration 1) | Mobile, measured throttling | 99 | 100 | 100 | 100 | 1.6 s | 0.001 |
| `/v1` (iteration 1) | Desktop preset | 99 | 100 | 100 | 100 | 0.8 s | 0 |

"Measured throttling" is `--throttling-method=devtools`. Lighthouse's default *simulated*
mobile run reports Performance 84 on iteration 1 with LCP pinned at 4.5 s. That is a
modelling artifact of its Lantern simulator on that page (the number equals its
time-to-interactive estimate in every run and does not move when the LCP element
changes). The measured runs are the ones to trust; the commands are in
`MANUAL-TASKS.md` so you can re-run them on the live URL.

Iteration 2's crowd is about 390 `<img>` elements over 44 PNGs (712 KB for the set,
each loaded once, lazily). That is the price of stickers that react to the pointer; a
background image would be cheaper and inert. If it ever matters, cut `cols`/`rows`
in `src/components/crowd.tsx`.

Two things that bit during this and are worth keeping:

- An element whose first paint is at `opacity: 0` is never counted as painted (the fade
  that follows is compositor-only), so the headline and frame start their entrance at
  35% opacity. See `.enter-large` in `globals.css`.
- `max-width` in `ch` is measured in the current font, so it changes when the web font
  swaps in and the text rewraps: a 0.11 layout shift. The headline and lede use `em`.
