/**
 * Pull the pilot polygon's road graph from Overpass, once, by hand.
 *
 *   npm run fetch
 *
 * The result is committed as data/raw-osm.json. Nothing at runtime touches
 * Overpass — reproducibility matters more than freshness for a pilot dataset,
 * and a demo that dies when Overpass is busy is not a demo.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PILOT_RING, LAYOUT_NAME } from '../pilot.config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../data/raw-osm.json');

// Overpass wants "lat lng lat lng ..." for poly.
const POLY = PILOT_RING.map(([lat, lng]) => `${lat} ${lng}`).join(' ');

const EXCLUDED = ['footway', 'path', 'steps', 'cycleway', 'construction', 'proposed'];

const QUERY = `[out:json][timeout:120];
way["highway"]["highway"!~"^(${EXCLUDED.join('|')})$"](poly:"${POLY}");
(._;>;);
out body;`;

// overpass-api.de is the reference instance and the flakiest. Fall through the
// mirrors rather than failing on one 504.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function tryEndpoint(url: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass mirrors 406 an anonymous client. Identify the tool and a contact.
      'User-Agent': 'gully-phase1/0.1 (Bengaluru layout pilot; https://openstreetmap.org)',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ data: QUERY }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  if (!text.trimStart().startsWith('{')) {
    // Overpass reports runtime errors as HTML with a 200.
    throw new Error(`non-JSON response: ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log(`Fetching ${LAYOUT_NAME}`);
  console.log(`Polygon: ${PILOT_RING.length} points\n`);

  let data: any = null;
  for (const url of ENDPOINTS) {
    process.stdout.write(`  ${new URL(url).host} … `);
    try {
      data = await tryEndpoint(url);
      console.log('ok');
      break;
    } catch (err) {
      console.log(`failed (${(err as Error).message})`);
    }
  }
  if (!data) {
    console.error('\nEvery Overpass mirror refused. Wait a minute and re-run.');
    process.exit(1);
  }

  const elements: any[] = data.elements ?? [];
  const ways = elements.filter((e) => e.type === 'way');
  const nodes = elements.filter((e) => e.type === 'node');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data, null, 1));

  console.log(`\n${ways.length} ways, ${nodes.length} nodes → data/raw-osm.json`);
  if (ways.length > 200) {
    console.warn(
      `\n  ${ways.length} ways is past the 200 ceiling in the build brief.\n` +
        '  Shrink PILOT_RING in pilot.config.ts rather than filtering here —\n' +
        '  a smaller dense polygon beats a larger thin one.',
    );
  }
}

main();
