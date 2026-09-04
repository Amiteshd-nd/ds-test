/**
 * Snap accuracy against hand-labelled ground truth.
 *
 *   npm run eval:snap
 *
 * The Phase 2 exit criterion is ≥90% on 40 hand-labelled reports. Those forty
 * rows can only come from standing in the layout with the app open and writing
 * down which road you were actually on — see MANUAL.md → "Label 40 snap fixes".
 * Until the file has 40 rows this reports but does not pass.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapIndex, snap, type SnapIndex } from '../src/report/snap.ts';
import { bearing, METRES_PER_DEG_LAT, metresPerDegLng, type LngLat } from '../src/report/geo.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEGMENTS = resolve(HERE, '../data/segments.geojson');
const TRUTH = resolve(HERE, '../data/snap-ground-truth.csv');
const TARGET = 0.9;
const REQUIRED_ROWS = 40;

interface Row {
  lat: number;
  lng: number;
  heading_deg: number | null;
  expected: string;
  note: string;
}

function readTruth(): Row[] {
  if (!existsSync(TRUTH)) return [];
  const rows: Row[] = [];
  for (const line of readFileSync(TRUTH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('lat,')) continue;
    const [lat, lng, heading, expected, ...rest] = t.split(',');
    if (!expected) continue;
    rows.push({
      lat: Number(lat),
      lng: Number(lng),
      heading_deg: heading?.trim() === '' || heading === undefined ? null : Number(heading),
      expected: expected.trim(),
      note: rest.join(',').trim(),
    });
  }
  return rows;
}

function main() {
  const fc = JSON.parse(readFileSync(SEGMENTS, 'utf8'));
  const index = buildSnapIndex(
    fc.features.map((f: { properties: { id: string }; geometry: { coordinates: LngLat[] } }) => ({
      id: f.properties.id,
      coordinates: f.geometry.coordinates,
    })),
  );
  const known = new Set<string>(fc.features.map((f: { properties: { id: string } }) => f.properties.id));

  const rows = readTruth();
  if (!rows.length) {
    console.log('\n  data/snap-ground-truth.csv is empty — no field labels to measure.');
    console.log('  See MANUAL.md → "Label 40 snap fixes".');
    selfCheck(fc.features, index);
    return;
  }

  const bad = rows.filter((r) => !known.has(r.expected));
  if (bad.length) {
    console.error(`\n  ${bad.length} row(s) name a segment id that is not in segments.geojson:`);
    for (const r of bad.slice(0, 5)) console.error(`    ${r.expected}  (${r.note})`);
    console.error('  Ids look like w123456:0 and change when the polygon moves.\n');
    process.exit(1);
  }

  let hits = 0;
  let headingWins = 0;
  const misses: string[] = [];

  for (const r of rows) {
    const got = snap({ lat: r.lat, lng: r.lng, heading_deg: r.heading_deg }, index);
    if (got?.segment_id === r.expected) {
      hits++;
      if (got.decided_by === 'heading') headingWins++;
    } else {
      misses.push(
        `    expected ${r.expected}, got ${got?.segment_id ?? 'nothing'}` +
          `${got ? ` at ${got.snap_distance_m} m` : ''}${r.note ? `  — ${r.note}` : ''}`,
      );
    }
  }

  const acc = hits / rows.length;
  console.log(`\n  ${hits}/${rows.length} correct — ${(acc * 100).toFixed(1)}%`);
  console.log(`  ${headingWins} decided by heading rather than distance alone`);
  if (misses.length) {
    console.log('\n  Misses:');
    console.log(misses.slice(0, 12).join('\n'));
  }

  if (rows.length < REQUIRED_ROWS) {
    console.log(`\n  ${rows.length} of ${REQUIRED_ROWS} labelled fixes. Not enough to claim the exit criterion.\n`);
    return;
  }
  if (acc < TARGET) {
    console.error(`\n  Below the ${TARGET * 100}% exit criterion.\n`);
    process.exit(1);
  }
  console.log(`\n  Meets the ${TARGET * 100}% exit criterion.\n`);
}

/**
 * Regression guard, NOT the exit criterion.
 *
 * Offset a synthetic fix 7 m perpendicular to each segment's midpoint and check
 * it snaps back. It catches a broken projection or a flipped bearing instantly.
 * It does not measure real accuracy: on a dense grid, stepping 7 m sideways off
 * a 2 m stub genuinely puts you nearer a different road, and the snap is right
 * to say so. Only hand-labelled fixes can settle that.
 */
function selfCheck(
  features: { properties: { id: string }; geometry: { coordinates: LngLat[] } }[],
  index: SnapIndex,
) {
  let hit = 0;
  let ambiguous = 0;

  for (const f of features) {
    const cs = f.geometry.coordinates;
    const i = Math.max(1, Math.floor(cs.length / 2));
    const [a, b] = [cs[i - 1], cs[i]];
    const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const brg = bearing(a, b);
    const perp = ((brg + 90) * Math.PI) / 180;
    const p: LngLat = [
      mid[0] + (Math.sin(perp) * 7) / metresPerDegLng(mid[1]),
      mid[1] + (Math.cos(perp) * 7) / METRES_PER_DEG_LAT,
    ];

    const got = snap({ lat: p[1], lng: p[0], heading_deg: brg }, index);
    if (got?.segment_id === f.properties.id) hit++;
    else if (got && got.snap_distance_m < 7) ambiguous++;
  }

  const pct = ((hit / features.length) * 100).toFixed(1);
  console.log(`\n  Self-check (synthetic, not the criterion): ${hit}/${features.length} snapped back — ${pct}%`);
  console.log(`  ${ambiguous} landed nearer a different road, which on this grid is the honest answer.`);
  if (hit / features.length < 0.75) {
    console.error('\n  Below 75% on synthetic offsets — the geometry itself is broken.\n');
    process.exit(1);
  }
  console.log('');
}

main();
