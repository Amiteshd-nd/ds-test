/**
 * Turn data/raw-osm.json into a segment graph: one row per stretch of road
 * between two junctions, with a width, a provenance for that width, and the
 * consequence of parking a tanker on it.
 *
 *   npm run build:segments
 *
 * Outputs data/segments.geojson and data/render-scale.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_RING,
  CENTRE,
  ZOOM_STOPS,
  TANKER_WIDTH_M,
  CAR_REFUSAL_GAP_M,
  SQUEEZE_GAP_M,
  LAYOUT_NAME,
} from '../pilot.config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(HERE, '../data/raw-osm.json');
const SURVEY = resolve(HERE, '../data/survey-widths.csv');
const OUT_SEGMENTS = resolve(HERE, '../data/segments.geojson');
const OUT_SCALE = resolve(HERE, '../data/render-scale.json');

type LngLat = [number, number];
type WidthSource = 'survey' | 'osm_tag' | 'osm_est' | 'inferred_lanes' | 'class_default';
type Severity = 'blocked' | 'squeeze' | 'clear';

interface OsmNode { type: 'node'; id: number; lat: number; lon: number }
interface OsmWay { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }

// ── geometry ────────────────────────────────────────────────────────────────

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const lineLength = (coords: LngLat[]) =>
  coords.slice(1).reduce((sum, c, i) => sum + haversine(coords[i], c), 0);

/** Point at the halfway mark along a polyline. */
function midpoint(coords: LngLat[]): LngLat {
  const half = lineLength(coords) / 2;
  let run = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    if (run + d >= half) {
      const t = d === 0 ? 0 : (half - run) / d;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ];
    }
    run += d;
  }
  return coords[coords.length - 1];
}

/** Ray casting. ring is [lat, lng]; point is [lng, lat]. */
function inRing(pt: LngLat, ring: [number, number][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Metres from a point to the nearest vertex-to-vertex span of a polyline. */
function distToLine(pt: LngLat, coords: LngLat[]): number {
  let best = Infinity;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(rad(pt[1]));
  const px = pt[0] * mPerDegLng, py = pt[1] * mPerDegLat;
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0] * mPerDegLng, ay = coords[i - 1][1] * mPerDegLat;
    const bx = coords[i][0] * mPerDegLng, by = coords[i][1] * mPerDegLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    best = Math.min(best, Math.hypot(px - cx, py - cy));
  }
  return best;
}

// ── width parsing ───────────────────────────────────────────────────────────

/** OSM width tags are free text. "4", "4 m", "4m", "13'", "13'6\"", "15 ft". */
function parseWidth(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/);
  if (ftIn) return round1((Number(ftIn[1]) + Number(ftIn[2] ?? 0) / 12) * 0.3048);

  const ft = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)$/);
  if (ft) return round1(Number(ft[1]) * 0.3048);

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|metre|meter|metres|meters)?$/);
  if (m) {
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 0 && v < 60 ? round1(v) : null;
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const CLASS_DEFAULT: Record<string, number> = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 6,
  residential: 6, unclassified: 5.5, service: 4, living_street: 4.5,
  pedestrian: 5, road: 5.5, busway: 7,
};

// ── survey overrides ────────────────────────────────────────────────────────

function readSurvey(): Map<string, number> {
  const out = new Map<string, number>();
  if (!existsSync(SURVEY)) return out;
  for (const line of readFileSync(SURVEY, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('segment_id')) continue;
    const [id, width] = t.split(',');
    const w = Number(width);
    if (id && Number.isFinite(w) && w > 0) out.set(id.trim(), round1(w));
  }
  return out;
}

// ── build ───────────────────────────────────────────────────────────────────

interface Segment {
  id: string;
  osm_way_id: number;
  highway: string;
  name: string | null;
  coords: LngLat[];
  length_m: number;
  lanes: number | null;
  oneway: boolean;
  from_node: number;
  to_node: number;
  width_m: number;
  width_source: WidthSource;
  width_conf: number;
  tanker_gap_m: number;
  severity_if_tanker: Severity;
  width_note: string;
}

function main() {
  if (!existsSync(RAW)) {
    console.error('data/raw-osm.json is missing. Run `npm run fetch` first.');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RAW, 'utf8'));
  const elements: (OsmNode | OsmWay)[] = raw.elements ?? [];
  const nodes = new Map<number, LngLat>();
  for (const e of elements) if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]);
  const ways = elements.filter((e): e is OsmWay => e.type === 'way' && Array.isArray(e.nodes));

  // Node usage across every way — a node touched by two or more ways is a junction.
  const wayCount = new Map<number, number>();
  for (const w of ways) {
    for (const n of new Set(w.nodes)) wayCount.set(n, (wayCount.get(n) ?? 0) + 1);
  }

  const survey = readSurvey();
  const all: Segment[] = [];

  for (const way of ways) {
    const tags = way.tags ?? {};
    const highway = tags.highway ?? 'unclassified';
    const nodeIds = way.nodes.filter((n) => nodes.has(n));
    if (nodeIds.length < 2) continue;

    // Cut points: both endpoints, plus every junction node in between.
    const cuts = new Set<number>([0, nodeIds.length - 1]);
    nodeIds.forEach((n, i) => {
      if (i > 0 && i < nodeIds.length - 1 && (wayCount.get(n) ?? 0) >= 2) cuts.add(i);
    });
    const cutList = [...cuts].sort((a, b) => a - b);

    for (let piece = 0; piece < cutList.length - 1; piece++) {
      const slice = nodeIds.slice(cutList[piece], cutList[piece + 1] + 1);
      const coords = slice.map((n) => nodes.get(n)!);
      const length_m = lineLength(coords);
      if (length_m < 1) continue;

      const id = `w${way.id}:${piece}`;
      const lanes = Number.isFinite(Number(tags.lanes)) ? Number(tags.lanes) : null;
      const oneway = tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === '-1';

      const { width_m, width_source, width_conf, width_note } = resolveWidth(id, tags, lanes, highway, survey);
      const tanker_gap_m = round1(width_m - TANKER_WIDTH_M);
      const severity_if_tanker: Severity =
        lanes === 1 && oneway ? 'blocked'
        : tanker_gap_m < CAR_REFUSAL_GAP_M ? 'blocked'
        : tanker_gap_m < SQUEEZE_GAP_M ? 'squeeze'
        : 'clear';

      all.push({
        id, osm_way_id: way.id, highway, name: tags.name ?? null, coords,
        length_m: Math.round(length_m * 10) / 10, lanes, oneway,
        from_node: slice[0], to_node: slice[slice.length - 1],
        width_m, width_source, width_conf, width_note,
        tanker_gap_m, severity_if_tanker,
      });
    }
  }

  // Degree before clipping — lets us tell a polygon-edge cut from a real stub.
  const degreeBefore = new Map<number, number>();
  for (const s of all) {
    degreeBefore.set(s.from_node, (degreeBefore.get(s.from_node) ?? 0) + 1);
    degreeBefore.set(s.to_node, (degreeBefore.get(s.to_node) ?? 0) + 1);
  }

  // Overpass returns whole ways that merely touch the polygon. Keep the pieces
  // whose midpoint is actually inside it.
  const kept = all.filter((s) => inRing(midpoint(s.coords), PILOT_RING));

  nameUnnamed(kept);
  assertGraph(kept, degreeBefore);
  writeOut(kept, all.length);
}

function resolveWidth(
  id: string,
  tags: Record<string, string>,
  lanes: number | null,
  highway: string,
  survey: Map<string, number>,
): { width_m: number; width_source: WidthSource; width_conf: number; width_note: string } {
  const surveyed = survey.get(id);
  if (surveyed !== undefined) {
    return { width_m: surveyed, width_source: 'survey', width_conf: 0.95, width_note: 'measured on site' };
  }

  const tagged = parseWidth(tags.width);
  if (tagged !== null) {
    return { width_m: tagged, width_source: 'osm_tag', width_conf: 0.85, width_note: 'tagged in OpenStreetMap' };
  }

  const estimated = parseWidth(tags.est_width);
  if (estimated !== null) {
    return { width_m: estimated, width_source: 'osm_est', width_conf: 0.6, width_note: 'estimated in OpenStreetMap' };
  }

  if (lanes && lanes > 0) {
    const parked = Object.keys(tags).some((k) => k.startsWith('parking:')) ? 1.5 : 0;
    return {
      width_m: round1(lanes * 3.0 + parked),
      width_source: 'inferred_lanes',
      width_conf: 0.4,
      width_note: `estimated from ${lanes} lane${lanes === 1 ? '' : 's'}${parked ? ' plus kerbside parking' : ''}`,
    };
  }

  return {
    width_m: CLASS_DEFAULT[highway] ?? 5.5,
    width_source: 'class_default',
    width_conf: 0.2,
    width_note: `assumed from road class (${highway.replace(/_/g, ' ')}) — unverified`,
  };
}

/** "unnamed service road off Kaggadasapura Main Road" beats "unnamed". */
function nameUnnamed(segments: Segment[]) {
  const named = segments.filter((s) => s.name);
  for (const s of segments) {
    if (s.name) continue;
    const mid = midpoint(s.coords);
    let best: Segment | null = null;
    let bestD = Infinity;
    for (const n of named) {
      const d = distToLine(mid, n.coords);
      if (d < bestD) { bestD = d; best = n; }
    }
    const kind = s.highway.replace(/_/g, ' ');
    s.name = best ? `unnamed ${kind} off ${best.name}` : `unnamed ${kind}`;
  }
}

/**
 * Every segment endpoint has to be a junction, another segment's endpoint, a
 * cul-de-sac, or a cut at the polygon edge. Anything else is geometry that
 * looks connected and is not — the failure mode that quietly breaks routing
 * in Phase 4. Fail loudly here instead.
 */
function assertGraph(segments: Segment[], degreeBefore: Map<number, number>) {
  const nullWidth = segments.filter((s) => s.width_m == null || !s.width_source);
  if (nullWidth.length) {
    fail(`${nullWidth.length} segments have a null width or width_source: ${nullWidth.slice(0, 5).map((s) => s.id).join(', ')}`);
  }

  const degree = new Map<number, number>();
  for (const s of segments) {
    degree.set(s.from_node, (degree.get(s.from_node) ?? 0) + 1);
    degree.set(s.to_node, (degree.get(s.to_node) ?? 0) + 1);
  }

  const stubs: string[] = [];
  let culDeSacs = 0;
  let clipped = 0;

  for (const s of segments) {
    for (const [node, end] of [[s.from_node, 'start'], [s.to_node, 'end']] as const) {
      if ((degree.get(node) ?? 0) >= 2) continue;              // joins another segment
      if ((degreeBefore.get(node) ?? 0) >= 2) { clipped++; continue; } // cut at the polygon edge

      // Terminal. Legitimate if it is genuinely the end of the road; a stub if
      // it dies within 5 m of another segment it is not connected to.
      const pt = nodes_of(s, end);
      const near = segments.find(
        (o) => o.id !== s.id && o.from_node !== node && o.to_node !== node && distToLine(pt, o.coords) < 5,
      );
      if (near) stubs.push(`${s.id} ${end} floats 5 m from ${near.id} without joining it`);
      else culDeSacs++;
    }
  }

  if (stubs.length) {
    fail(
      `${stubs.length} floating stub${stubs.length === 1 ? '' : 's'} in the segment graph:\n` +
        stubs.slice(0, 10).map((l) => `    ${l}`).join('\n') +
        '\n\n  Fix the geometry in OpenStreetMap, re-run `npm run fetch`, or shrink the polygon.',
    );
  }
  console.log(`  graph ok — ${culDeSacs} cul-de-sac ends, ${clipped} ends cut at the polygon edge, 0 floating stubs`);
}

function nodes_of(s: Segment, end: 'start' | 'end'): LngLat {
  return end === 'start' ? s.coords[0] : s.coords[s.coords.length - 1];
}

function fail(msg: string): never {
  console.error(`\n  BUILD FAILED\n  ${msg}\n`);
  process.exit(1);
}

/**
 * Metres covered by one screen pixel, at MapLibre's own scale.
 *
 * The familiar 156543.03392 is the zoom-0 resolution for a **256 px** tile
 * (40075016.686 / 256). MapLibre GL renders 512 px tiles, so its zoom levels
 * are one step finer and the constant halves to 78271.51696. Get this wrong and
 * every road draws at exactly half its real width — which looks plausible until
 * you hold it against the scale bar.
 *
 * Verified against map.unproject() at zoom 18: 0.2906 m/px, matching.
 */
const METRES_PER_PIXEL_Z0 = 40075016.686 / 512;

const metresPerPixel = (lat: number, zoom: number) =>
  (METRES_PER_PIXEL_Z0 * Math.cos(rad(lat))) / 2 ** zoom;

function writeOut(segments: Segment[], preClip: number) {
  const fc = {
    type: 'FeatureCollection' as const,
    properties: { layout: LAYOUT_NAME, generated_from: 'data/raw-osm.json' },
    features: segments.map((s) => ({
      type: 'Feature' as const,
      id: hashId(s.id),
      geometry: { type: 'LineString' as const, coordinates: s.coords },
      properties: {
        id: s.id, osm_way_id: s.osm_way_id, name: s.name, highway: s.highway,
        length_m: s.length_m, lanes: s.lanes, oneway: s.oneway,
        from_node: s.from_node, to_node: s.to_node,
        width_m: s.width_m, width_source: s.width_source, width_conf: s.width_conf,
        width_note: s.width_note,
        tanker_gap_m: s.tanker_gap_m, severity_if_tanker: s.severity_if_tanker,
      },
    })),
  };
  writeFileSync(OUT_SEGMENTS, JSON.stringify(fc));

  const scale = {
    centre_lat: CENTRE.lat,
    note: 'metres per screen pixel at the pilot centre latitude, per zoom stop',
    stops: ZOOM_STOPS.map((z) => [z, metresPerPixel(CENTRE.lat, z)] as [number, number]),
  };
  writeFileSync(OUT_SCALE, JSON.stringify(scale, null, 2));

  const by = <T extends string>(pick: (s: Segment) => T) =>
    segments.reduce<Record<string, number>>((a, s) => ((a[pick(s)] = (a[pick(s)] ?? 0) + 1), a), {});

  const w = by((s) => s.width_source);
  const sev = by((s) => s.severity_if_tanker);
  const metres = Math.round(segments.reduce((a, s) => a + s.length_m, 0));

  console.log(`\n  ${segments.length} segments kept of ${preClip} built · ${metres} m of road`);
  console.log(`  width source   survey ${w.survey ?? 0} · osm_tag ${w.osm_tag ?? 0} · osm_est ${w.osm_est ?? 0} · inferred_lanes ${w.inferred_lanes ?? 0} · class_default ${w.class_default ?? 0}`);
  console.log(`  tanker fit     blocked ${sev.blocked ?? 0} · squeeze ${sev.squeeze ?? 0} · clear ${sev.clear ?? 0}`);
  console.log(`\n  → data/segments.geojson, data/render-scale.json`);

  if (segments.length < 40 || segments.length > 120) {
    console.warn(`\n  ${segments.length} segments is outside the 40–120 target. Adjust PILOT_RING.`);
  }
}

/** MapLibre feature state needs a numeric id; the string id stays in properties. */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

main();
