/**
 * Brier score for the rhythm forecast.
 *
 *   npm run eval:forecast
 *
 * PRD §7 Phase 4 exit criterion: beat a naive "always clear" baseline over a
 * held-out week. The Brier score is the mean squared error of a probabilistic
 * forecast — lower is better, and it punishes confident wrongness far harder
 * than it punishes hedging, which is exactly the property we want from
 * something that will be telling people whether to leave now.
 *
 * This needs a week of real reports that the aggregate has never seen. Until
 * that exists it reports what it has and does not pretend to a verdict.
 * See MANUAL.md → "Hold out a week".
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRhythm, bucketOf, cellKey, MIN_DAYS } from '../src/rhythm/aggregate.ts';
import { buildEvents } from '../src/state/engine.ts';
import type { LocalReport } from '../src/report/types.ts';
import type { SegmentFacts } from '../src/state/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEGMENTS = resolve(HERE, '../data/segments.geojson');
const REPORTS = resolve(HERE, '../data/reports-export.json');

const DAY = 86_400_000;

interface Outcome {
  segment_id: string;
  at: number;
  blocked: boolean;
}

const brier = (pairs: { p: number; actual: boolean }[]) =>
  pairs.reduce((sum, x) => sum + (x.p - (x.actual ? 1 : 0)) ** 2, 0) / pairs.length;

function main() {
  const fc = JSON.parse(readFileSync(SEGMENTS, 'utf8'));
  const segments = new Map<string, SegmentFacts>(
    fc.features.map((f: { properties: SegmentFacts }) => [f.properties.id, f.properties]),
  );

  if (!existsSync(REPORTS)) {
    console.log('\n  data/reports-export.json is missing.');
    console.log('  Export the pilot\'s reports there, then re-run.');
    console.log('  Nothing to score yet — see MANUAL.md → "Hold out a week".\n');
    return;
  }

  const reports: LocalReport[] = JSON.parse(readFileSync(REPORTS, 'utf8'));
  if (!reports.length) {
    console.log('\n  No reports in the export.\n');
    return;
  }

  // The split is by time, never at random: a random split leaks this morning's
  // tanker into the model that is asked to predict this morning's tanker, and
  // every score after that is fiction.
  const latest = Math.max(...reports.map((r) => r.created_at));
  const cutoff = latest - 7 * DAY;
  const train = reports.filter((r) => r.created_at < cutoff);
  const test = reports.filter((r) => r.created_at >= cutoff);

  console.log(`\n  ${train.length} reports to train on, ${test.length} in the held-out week`);

  if (!train.length || !test.length) {
    console.log('  Not enough history either side of the split to score anything.\n');
    return;
  }

  const rhythm = buildRhythm(buildEvents(train, { now: cutoff, segments }), cutoff);
  const testEvents = buildEvents(test, { now: latest, segments });

  // Every (segment, quarter-hour) the held-out week actually covers, labelled.
  const outcomes: Outcome[] = [];
  const blockedSlots = new Set<string>();
  for (const ev of testEvents) {
    if (ev.ended_at === null) continue;
    for (let t = ev.started_at; t <= ev.ended_at; t += 15 * 60_000) {
      blockedSlots.add(`${ev.segment_id}|${Math.floor(t / (15 * 60_000))}`);
    }
  }

  const segmentsSeen = new Set(test.map((r) => r.segment_id));
  for (let t = cutoff; t < latest; t += 15 * 60_000) {
    const slot = Math.floor(t / (15 * 60_000));
    for (const segment_id of segmentsSeen) {
      outcomes.push({ segment_id, at: t, blocked: blockedSlots.has(`${segment_id}|${slot}`) });
    }
  }

  const scored: { p: number; actual: boolean }[] = [];
  let suppressed = 0;
  for (const o of outcomes) {
    const d = new Date(o.at);
    const cell = rhythm.get(cellKey(o.segment_id, d.getDay(), bucketOf(d)));
    if (!cell || cell.n_days < MIN_DAYS) {
      suppressed++;
      continue;
    }
    scored.push({ p: cell.p_blocked, actual: o.blocked });
  }

  if (!scored.length) {
    console.log(`  Every slot was suppressed for thin evidence (under ${MIN_DAYS} days).`);
    console.log('  The forecast is not making claims yet, so there is nothing to score.\n');
    return;
  }

  const forecast = brier(scored);
  // The baseline PRD §7 names: assume nothing is ever blocked.
  const baseline = brier(scored.map((x) => ({ p: 0, actual: x.actual })));
  const rate = scored.filter((x) => x.actual).length / scored.length;

  console.log(`  ${scored.length} slots scored, ${suppressed} suppressed for thin evidence`);
  console.log(`  base rate: ${(rate * 100).toFixed(1)}% of slots were actually blocked\n`);
  console.log(`  forecast Brier   ${forecast.toFixed(4)}`);
  console.log(`  "always clear"   ${baseline.toFixed(4)}`);

  if (forecast < baseline) {
    const better = (((baseline - forecast) / baseline) * 100).toFixed(1);
    console.log(`\n  Beats the baseline by ${better}%. Meets the Phase 4 exit criterion.\n`);
  } else {
    console.log('\n  Does NOT beat "always clear". The forecast is not yet worth showing.\n');
    process.exitCode = 1;
  }
}

main();
