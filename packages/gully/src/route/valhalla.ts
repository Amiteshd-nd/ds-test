/**
 * Valhalla adapter — the PRD's chosen router, optional here.
 *
 * PRD §5 picks Valhalla because `exclude_polygons` lets a transient closure be
 * expressed per request, which is exactly the shape of a tanker. That is right
 * for the product. It is heavy for a 61-segment demo, so this only engages when
 * VITE_VALHALLA_URL is set; otherwise the built-in graph router runs and says so.
 *
 * Set up: see MANUAL.md → "Run Valhalla".
 */
import type { LngLat } from '../report/geo';

const VALHALLA_URL = import.meta.env.VITE_VALHALLA_URL as string | undefined;

export const valhallaConfigured = Boolean(VALHALLA_URL);

export interface ValhallaRoute {
  distance_m: number;
  duration_s: number;
  shape: LngLat[];
}

/**
 * A blocked segment becomes a thin polygon around its centreline.
 *
 * The buffer has to be wider than the road, or Valhalla snaps through the gap
 * between the polygon and the way it is meant to cut. Half the road width plus
 * a metre is enough on a layout and small enough not to swallow the parallel
 * cross four metres away — which is a real risk here, and the reason this is a
 * per-segment buffer rather than one polygon around the whole blocked set.
 */
export function excludePolygon(line: LngLat[], width_m: number): LngLat[] {
  const halfWidth = width_m / 2 + 1;
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos((line[0][1] * Math.PI) / 180);

  const left: LngLat[] = [];
  const right: LngLat[] = [];

  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = (b[0] - a[0]) * mPerDegLng;
    const dy = (b[1] - a[1]) * mPerDegLat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidth;
    const ny = (dx / len) * halfWidth;
    left.push([line[i][0] + nx / mPerDegLng, line[i][1] + ny / mPerDegLat]);
    right.push([line[i][0] - nx / mPerDegLng, line[i][1] - ny / mPerDegLat]);
  }

  return [...left, ...right.reverse(), left[0]];
}

export async function routeViaValhalla(
  from: LngLat,
  to: LngLat,
  excludes: LngLat[][],
): Promise<ValhallaRoute | null> {
  if (!VALHALLA_URL) return null;

  const body = {
    locations: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
    costing: 'auto',
    exclude_polygons: excludes,
    directions_options: { units: 'kilometers' },
  };

  try {
    const res = await fetch(`${VALHALLA_URL.replace(/\/$/, '')}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      trip?: { legs?: { shape?: string }[]; summary?: { length?: number; time?: number } };
    };
    const leg = json.trip?.legs?.[0];
    if (!leg?.shape) return null;

    return {
      distance_m: Math.round((json.trip?.summary?.length ?? 0) * 1000),
      duration_s: Math.round(json.trip?.summary?.time ?? 0),
      shape: decodePolyline6(leg.shape),
    };
  } catch {
    return null;
  }
}

/** Valhalla encodes shapes at 1e-6 precision, not Google's 1e-5. */
function decodePolyline6(encoded: string): LngLat[] {
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}
