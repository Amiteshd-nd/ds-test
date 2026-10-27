# Manual tasks

Everything below needs a person: an account, a DNS record, a decision, or a file only
you can produce. The code is done and runs locally without any of it (signups are logged
to the terminal instead of stored). Tick items off as you go.

## Before launch: required

### 0. Pick the iteration
- [ ] `/` is iteration 2 (white card on the sticker crowd); `/v1` is iteration 1 (dark,
      aurora, chrome). Decide which ships. The README says how to swap them.
- [ ] If iteration 2 ships: look over `public/stickers/` and drop any you do not
      like (delete the PNG and its line in `src/lib/landmarks.ts`). To add or redo
      one, edit the list and run `node scripts/generate-stickers.mjs <slug>`; it needs
      `GEMINI_API_KEY` in `.env.local`.
- [ ] The Figma file "Plinth landing stickers" (your personal team) holds the one
      test render; delete it if you do not want it around.
- [ ] Delete the iteration that does not ship (its `page.tsx` and its components), so
      search engines do not see two versions of the page.

### 1. Decide the name and contact address
- [ ] Replace the placeholder `Plinth` and `hello@plinth.example` in `src/content.ts`.
      Everything else (wordmark, footer, page title, favicon, share card, email) reads
      from there.
- [ ] Re-read the headline and support line in the same file.

### 2. Hero render (iteration 1 only)
- [ ] Generate the image with the prompt in `BACKGROUND-PROMPT.md` (3:2 landscape).
- [ ] Save it over `public/bg.jpg` and run `pnpm build:landing` to check it.
- [ ] Look at it at desktop and phone widths inside the frame.

### 3. Teaser video
- [x] The Plinth film from `packages/teaser` is in: `public/teaser/plinth-teaser.mp4`
      (1080p with sound, 1:25, 28 MB, encoded for streaming) with its first frame as
      the poster.
- [ ] If you re-render the film, copy `packages/teaser/out/teaser-1080p.mp4` over it
      and update `duration` in `src/content.ts` if the length changed.
- [ ] 28 MB is fine on Vercel, but if you want adaptive quality on slow phones, host it
      on Mux or Cloudflare Stream and put that URL in `src`.

### 4. Resend account (this is where signups are stored)
- [ ] Create an account at https://resend.com.
- [ ] **Domains → Add domain.** Use a sending subdomain, e.g. `mail.yourdomain.com`.
- [ ] Add the DNS records Resend shows (SPF, DKIM, MX) at your DNS provider.
- [ ] Add a DMARC record if the domain has none: `_dmarc` TXT `v=DMARC1; p=none;`
- [ ] Wait until the domain shows **Verified**.
- [ ] **Audience / Segments → Create**, name it `Waitlist`, copy its ID.
- [ ] **API Keys → Create** with **Full access** (sending-only keys cannot add contacts).

### 5. Environment variables
- [ ] `cp .env.example .env.local` and fill in:
  - `RESEND_API_KEY`
  - `RESEND_AUDIENCE_ID` (the segment ID)
  - `EMAIL_FROM`, e.g. `Plinth <hello@mail.yourdomain.com>` (must be on the verified domain)
  - `NEXT_PUBLIC_SITE_URL`, e.g. `https://yourdomain.com` (no trailing slash)
- [ ] Run `pnpm dev:landing`, sign up with your own address, and confirm: the contact
      appears in the Resend segment, and the email arrives (check spam too).

### 6. Deploy to Vercel
- [ ] Import the repo in Vercel. **Root Directory: `packages/landing`.** Leave build and
      install commands on their defaults.
- [ ] Add the four env vars from step 5 under Settings → Environment Variables
      (Production, and Preview if you want previews to send real email).
- [ ] Attach your domain under Settings → Domains.
- [ ] After the first deploy, sign up once more on the live URL.

### 7. Check the live site
- [ ] Paste the URL into https://www.opengraph.xyz (or a Slack/X message) to see the
      share card.
- [ ] Run Lighthouse on the live URL and compare with the README. Use measured
      throttling for mobile, the simulated default under-reports this page:
      `npx lighthouse <url> --form-factor=mobile --throttling-method=devtools`
      and `npx lighthouse <url> --preset=desktop`. The real render becomes the largest
      element, so check Performance and LCP again.

## Later: recommended

- [ ] **Shared rate limit.** The current limit (5 per minute per IP) lives in server
      memory, so on Vercel each instance counts separately. Create an Upstash Redis
      database, add `@upstash/ratelimit`, and replace the body of
      `src/lib/rate-limit.ts` (TODO in the file).
- [ ] **Privacy note.** You are collecting email addresses. If you expect EU/UK
      visitors, add a one-line privacy notice or link near the form.
- [ ] **Launch email.** When you open, send it to the `Waitlist` segment from Resend →
      Broadcasts. Broadcasts add the unsubscribe link for you.
- [ ] **Moving off Resend storage.** If you outgrow it, rewrite only
      `src/lib/waitlist.ts` (Postgres/Supabase `insert ... on conflict do nothing`) and
      export the existing contacts from Resend as CSV to import.

## Where the signups are

| Environment | Where an email goes | How to see the list |
| --- | --- | --- |
| Local, no `RESEND_API_KEY` | Nowhere. One line is printed in the terminal running `pnpm dev:landing` | Read the terminal |
| Local or live, with keys | Resend → your `Waitlist` segment | Resend dashboard → Audience / Contacts, filter by segment. Export as CSV from there |
