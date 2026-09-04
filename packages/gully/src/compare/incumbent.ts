/**
 * The incumbent: Google Routes API, display only.
 *
 * PRD §5 and §9 are strict about this and so is Google's licence. The response
 * is rendered once and thrown away — **nothing from it is stored, and nothing
 * derived from it ever reaches the segments table.** That is not caution for its
 * own sake: the whole road graph is OSM precisely so the dataset stays ours to
 * publish, and one cached ETA would compromise that.
 *
 * Without a key the comparison still renders, with the incumbent side saying
 * exactly what it would have shown. That is deliberate — the argument of the
 * comparison screen is about the *shape* of the two answers, and it survives the
 * absence of a live one.
 */
import type { LngLat } from '../report/geo';

const KEY = import.meta.env.VITE_GOOGLE_ROUTES_KEY as string | undefined;

export const incumbentConfigured = Boolean(KEY);

export interface IncumbentAnswer {
  /** Seconds including live traffic, as Google reports it. */
  duration_s: number;
  /** Seconds without traffic, so the delay is visible. */
  static_duration_s: number;
  distance_m: number;
  /** The colour a navigation app would paint this: how it speaks. */
  band: 'green' | 'amber' | 'red';
  live: true;
}

/** What the incumbent panel shows when there is no key. Never fabricated numbers. */
export interface IncumbentUnavailable {
  live: false;
  reason: string;
}

export type Incumbent = IncumbentAnswer | IncumbentUnavailable;

function band(duration_s: number, static_s: number): IncumbentAnswer['band'] {
  const ratio = static_s > 0 ? duration_s / static_s : 1;
  if (ratio > 1.5) return 'red';
  if (ratio > 1.15) return 'amber';
  return 'green';
}

export async function askIncumbent(from: LngLat, to: LngLat): Promise<Incumbent> {
  if (!KEY) {
    return {
      live: false,
      reason: 'No Google Routes key configured — see MANUAL.md §11.',
    };
  }

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from[1], longitude: from[0] } } },
        destination: { location: { latLng: { latitude: to[1], longitude: to[0] } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    if (!res.ok) {
      return { live: false, reason: `Google Routes returned ${res.status}.` };
    }

    const json = (await res.json()) as {
      routes?: { duration?: string; staticDuration?: string; distanceMeters?: number }[];
    };
    const r = json.routes?.[0];
    if (!r) return { live: false, reason: 'Google Routes returned no route.' };

    const secs = (v: string | undefined) => Number((v ?? '0s').replace('s', '')) || 0;
    const duration_s = secs(r.duration);
    const static_duration_s = secs(r.staticDuration);

    // Read, rendered, and dropped. Nothing below this line persists.
    return {
      live: true,
      duration_s,
      static_duration_s,
      distance_m: r.distanceMeters ?? 0,
      band: band(duration_s, static_duration_s),
    };
  } catch {
    return { live: false, reason: 'Could not reach Google Routes.' };
  }
}

/**
 * The incumbent's answer, in the incumbent's own voice: a time and a colour,
 * with no cause and no duration for the cause. Written out plainly because the
 * comparison is the argument, and paraphrasing it unfairly would win nothing.
 */
export function incumbentSentence(x: Incumbent): string {
  if (!x.live) return x.reason;
  const mins = Math.max(1, Math.round(x.duration_s / 60));
  const delay = Math.round((x.duration_s - x.static_duration_s) / 60);
  const colour = { green: 'light traffic', amber: 'slow', red: 'heavy traffic' }[x.band];
  return delay > 0
    ? `${mins} min · ${colour} · ${delay} min slower than usual`
    : `${mins} min · ${colour}`;
}
