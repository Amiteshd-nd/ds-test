# blockmodel

A throwaway, single-user UX prototype: take phone photos → [KIRI Engine](https://www.kiriengine.app/api)
reconstructs a 3D model → view/spin it in the browser. Three screens: **capture &
upload → processing → viewer**. Built to *feel out the UX*, not to ship.

Next.js (App Router, TS) · SQLite (better-sqlite3) · local `./storage` · three.js via
@react-three/fiber + drei · Tailwind.

---

## Setup

```bash
cd blockmodel
npm install
cp .env.example .env.local     # then paste your KIRI API key into .env.local
npm run smoke                  # optional: verifies the key works (costs 0 credits)
npm run dev
```

Open **http://localhost:3000** on your laptop.

### Get a KIRI API key

1. Make a developer account at https://www.kiriengine.app and create an API key
   (format `kiri-…`). Put it in `.env.local` as `KIRI_API_KEY=...`.
2. **Cost:** 1 credit = **$1**, and each scan costs ~1 credit. New accounts get
   ~10–20 free credits. **The minimum paid top-up is 500 credits ($500)** — there is
   no small refill, so plan around the free credits. The home screen always shows your
   remaining balance.

Without a key the app still runs — you'll see "credits unavailable" and can't submit a
real scan.

---

## Open it on your phone (same Wi-Fi)

The dev server binds to all interfaces (`next dev -H 0.0.0.0`), so:

1. Make sure your phone and laptop are on the **same Wi-Fi**.
2. Find your laptop's LAN IP:
   ```bash
   ipconfig getifaddr en0
   ```
3. On your phone, open **http://<that-ip>:3000** (e.g. `http://10.184.165.89:3000`).
4. If it doesn't load: macOS may prompt to allow incoming connections the first time
   (allow it), and check **System Settings → Network → Firewall** isn't blocking Node.

The file picker uses `accept="image/*" multiple`, so on the phone it opens the camera
roll for multi-select.

---

## How it works

- **Photos & models** live under `./storage/<jobId>/` (gitignored).
- **Job records** live in `./data/blockmodel.db` (SQLite, gitignored).
- **Every KIRI request/response** is appended to `./logs/kiri.log` (one JSON line each)
  — read this first when something breaks.
- Reconstruction uses KIRI's **Photo Scan** (photogrammetry), output requested as
  **GLB** so the viewer can load it directly. The processing screen **polls** KIRI for
  status; closing the tab is safe (the job persists and reappears under "Your scans").
- Swap seams are isolated: `src/lib/db.ts` (→ Postgres later), `src/lib/storage.ts`
  (→ R2/S3 later), `src/lib/kiri.ts` (the API client).

## Not built (by design)

Auth, sharing, annotations, PDF export, billing, deployment, CI, and tests beyond the
single `npm run smoke` check.
