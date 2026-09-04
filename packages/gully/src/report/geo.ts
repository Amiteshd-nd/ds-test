/**
 * Pure geometry for snapping a GPS fix to a road segment. No DOM, no MapLibre —
 * the Node eval harness in scripts/eval-snap.ts runs exactly this code.
 *
 * Everything works in a local metre plane centred on the fix. Over the ~500 m of
 * a pilot layout the distortion is far below GPS noise, and it keeps the maths
 * legible.
 */

export type LngLat = [number, number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const METRES_PER_DEG_LAT = 110574;
export const metresPerDegLng = (lat: number) => 111320 * Math.cos(rad(lat));

/** Project to metres east/north of `origin`. */
export function toLocal(origin: LngLat, p: LngLat): [number, number] {
  const mx = metresPerDegLng(origin[1]);
  return [(p[0] - origin[0]) * mx, (p[1] - origin[1]) * METRES_PER_DEG_LAT];
}

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Initial bearing from a to b, degrees clockwise from north, 0..360. */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = rad(a[1]);
  const φ2 = rad(b[1]);
  const Δλ = rad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export interface PointOnLine {
  /** Perpendicular distance from the point to the line, in metres. */
  distance_m: number;
  /** 0..1 along the whole polyline — the ST_LineLocatePoint equivalent. */
  locate: number;
  /** Bearing of the span the point landed on. */
  bearing_deg: number;
  /** The closest point itself. */
  at: LngLat;
}

/**
 * Closest point on a polyline, plus how far along it sits.
 *
 * PostGIS gets this from ST_ClosestPoint + ST_LineLocatePoint. Doing it on the
 * client is not a compromise: it means a report snaps with no network at all,
 * which is the difference between a 4-second capture and a 4-second wait.
 */
export function closestPointOnLine(point: LngLat, line: LngLat[]): PointOnLine {
  const px = 0;
  const py = 0; // the fix is the origin of the local plane
  const local = line.map((c) => toLocal(point, c));

  // Cumulative length so `locate` is a true fraction of the polyline.
  const spans: number[] = [];
  let total = 0;
  for (let i = 1; i < local.length; i++) {
    const d = Math.hypot(local[i][0] - local[i - 1][0], local[i][1] - local[i - 1][1]);
    spans.push(d);
    total += d;
  }

  let best: PointOnLine = {
    distance_m: Infinity,
    locate: 0,
    bearing_deg: 0,
    at: line[0],
  };
  let travelled = 0;

  for (let i = 1; i < local.length; i++) {
    const [ax, ay] = local[i - 1];
    const [bx, by] = local[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);

    if (d < best.distance_m) {
      const along = travelled + t * spans[i - 1];
      const mx = metresPerDegLng(point[1]);
      best = {
        distance_m: d,
        locate: total === 0 ? 0 : along / total,
        bearing_deg: bearing(line[i - 1], line[i]),
        at: [point[0] + cx / mx, point[1] + cy / METRES_PER_DEG_LAT],
      };
    }
    travelled += spans[i - 1];
  }

  return best;
}

/**
 * Smallest angle between a heading and a road's bearing, treating the road as
 * undirected — a rider going south on a north-south street agrees with it just
 * as much as one going north. Returns 0..90.
 */
export function headingOffset(heading_deg: number, segment_bearing_deg: number): number {
  const raw = Math.abs(((heading_deg - segment_bearing_deg + 540) % 360) - 180);
  return Math.min(raw, 180 - raw);
}

/** Cheap rejection before the per-span maths, for larger segment sets. */
export function bboxOf(line: LngLat[]): [number, number, number, number] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const [lng, lat] of line) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

export function withinPadded(
  bbox: [number, number, number, number],
  p: LngLat,
  pad_m: number,
): boolean {
  const padLat = pad_m / METRES_PER_DEG_LAT;
  const padLng = pad_m / metresPerDegLng(p[1]);
  return (
    p[0] >= bbox[0] - padLng &&
    p[0] <= bbox[2] + padLng &&
    p[1] >= bbox[1] - padLat &&
    p[1] <= bbox[3] + padLat
  );
}
