import { useEffect, useMemo, useState } from 'react';

/*
 * A GitHub contribution calendar.
 *
 * ── Setting the account ────────────────────────────────────────────────────
 * Put a username in GITHUB_USERNAME below and the grid fills itself. Leave it
 * empty and the component renders the same grid with every day at zero, which
 * is the state it ships in.
 *
 * ── Why a third party ──────────────────────────────────────────────────────
 * Contribution counts are public — anyone can read them off a profile page —
 * but GitHub serves that page without an `Access-Control-Allow-Origin` header,
 * so a browser cannot fetch it directly. The official GraphQL API does expose
 * `contributionsCollection`, and it needs a token, which cannot ship in code
 * a visitor downloads. So the options are a public proxy, which is this, or a
 * build-time fetch with a CI token writing a static file, which never goes
 * down but goes stale between deploys.
 *
 * Nothing here is authenticated and the endpoint is read-only, so the worst
 * case is that it stops answering. When it does, the grid stays at zero rather
 * than showing an error: a portfolio should not have a broken panel on it.
 *
 * ── Note on what the graph actually contains ───────────────────────────────
 * Work in private repositories does not count toward it unless the account has
 * "Include private contributions on my profile" turned on in GitHub's settings.
 * An account whose work is mostly private will look far emptier here than it
 * really is.
 */

/** The account to display. Empty renders the zero-state grid. */
const GITHUB_USERNAME = '';

const API = (user) =>
  `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`;

const WEEKS = 53;
const CELL = 10;
const GAP = 3;
const PITCH = CELL + GAP;
const LABEL_W = 30; // room for the weekday initials
const LABEL_H = 18; // room for the month row

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Monochrome on purpose. The site has fourteen themes with grounds from black
 * to bone to acid yellow, and a fixed green ramp would be unreadable on at
 * least four of them. Mixing the ink against the ground instead means the
 * scale re-derives itself per theme and keeps its contrast either way. */
const LEVEL = [
  'color-mix(in oklab, var(--site-fg) 8%, transparent)',
  'color-mix(in oklab, var(--site-fg) 26%, transparent)',
  'color-mix(in oklab, var(--site-fg) 45%, transparent)',
  'color-mix(in oklab, var(--site-fg) 68%, transparent)',
  'color-mix(in oklab, var(--site-fg) 92%, transparent)',
];

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * The 53×7 grid of dates ending today, aligned so every column is one week
 * starting on Sunday — which is why it begins on the Sunday on or before the
 * day 52 weeks back rather than exactly a year ago.
 */
function buildGrid() {
  const today = new Date();
  today.setHours(12, 0, 0, 0); // midday, so a DST shift cannot roll the date

  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS - 1) * 7 - today.getDay());

  const columns = [];
  for (let w = 0; w < WEEKS; w += 1) {
    const days = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      days.push(date > today ? null : date);
    }
    columns.push(days);
  }
  return columns;
}

export default function ContributionHeatmap({ username = GITHUB_USERNAME }) {
  const columns = useMemo(buildGrid, []);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!username) return undefined;

    const ac = new AbortController();
    fetch(API(username), { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        const byDate = new Map(json.contributions.map((c) => [c.date, c]));
        setData({ byDate, total: json.total?.lastYear ?? 0 });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          // Deliberately quiet. See the note at the top: the grid simply stays
          // at zero rather than putting an error on a portfolio page.
          console.warn('[ContributionHeatmap] could not load contributions —', err.message);
        }
      });

    return () => ac.abort();
  }, [username]);

  /* Month labels sit above the first column in which that month appears, and
     only when there is room since the last one — otherwise a short month at a
     column boundary collides with its neighbour. */
  const monthLabels = useMemo(() => {
    const out = [];
    let lastMonth = -1;
    let lastX = -Infinity;
    columns.forEach((days, w) => {
      const first = days.find(Boolean);
      if (!first) return;
      const m = first.getMonth();
      const x = LABEL_W + w * PITCH;
      if (m !== lastMonth && x - lastX > 28) {
        out.push({ x, label: MONTHS[m] });
        lastMonth = m;
        lastX = x;
      }
    });
    return out;
  }, [columns]);

  const width = LABEL_W + WEEKS * PITCH - GAP;
  const height = LABEL_H + 7 * PITCH - GAP;

  const summary = !username
    ? 'No account connected yet'
    : data
      ? `${data.total.toLocaleString()} contributions in the last year`
      : 'Loading contributions…';

  return (
    /* No card, no heading, no legend — just the grid.
       The summary line that used to sit above it has not been dropped so much
       as moved: it is the SVG's `aria-label`, so a screen reader still gets
       "N contributions in the last year" instead of 365 anonymous squares.
       Losing it visually costs nothing, because the shape of a contribution
       calendar is self-describing to anyone who can see it.

       `min-w-0` stays and is load-bearing. This is a grid item, and a grid
       item's default `min-width: auto` resolves to its min-content width —
       here the 716px SVG — so without it the block refuses to shrink, the
       scroll wrapper never engages, and the page gains 380px of horizontal
       overflow on a phone. */
    <div className="min-w-0 py-6 sm:py-8">

      {/* Scrolls on narrow screens rather than shrinking the cells to mush.
          The site hides scrollbars globally, so this is a drag/swipe strip. */}
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
          style={{ display: 'block' }}
        >
          {monthLabels.map(({ x, label }) => (
            <text
              key={`${label}-${x}`}
              x={x}
              y={11}
              fontSize="10"
              fill="var(--site-fg-2)"
              fontFamily="var(--site-font)"
            >
              {label}
            </text>
          ))}

          {/* Mon / Wed / Fri only. All seven is noise at this cell size. */}
          {[
            [1, 'Mon'],
            [3, 'Wed'],
            [5, 'Fri'],
          ].map(([row, label]) => (
            <text
              key={label}
              x={0}
              y={LABEL_H + row * PITCH + CELL - 1}
              fontSize="9"
              fill="var(--site-fg-2)"
              fontFamily="var(--site-font)"
            >
              {label}
            </text>
          ))}

          {columns.map((days, w) =>
            days.map((date, d) => {
              if (!date) return null;
              const key = iso(date);
              const hit = data?.byDate.get(key);
              const count = hit?.count ?? 0;
              const level = hit?.level ?? 0;
              return (
                <rect
                  key={key}
                  x={LABEL_W + w * PITCH}
                  y={LABEL_H + d * PITCH}
                  width={CELL}
                  height={CELL}
                  rx="2.5"
                  fill={LEVEL[level]}
                >
                  {/* Per-cell values, so the scale is never colour alone. */}
                  <title>{`${count} contribution${count === 1 ? '' : 's'} on ${key}`}</title>
                </rect>
              );
            }),
          )}
        </svg>
      </div>

    </div>
  );
}
