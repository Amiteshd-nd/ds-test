/**
 * The live spine — PRD §7 Phase 5.
 *
 * BWSSB's Sanchari Cauvery scheme runs roughly 200 GPS-tracked government
 * tankers with citizen-facing live tracking. The private fleet — reportedly
 * around 3,000 borewell operators — is entirely untracked. That asymmetry is
 * the product's shape: a thin live spine plus a thick learned forecast.
 *
 * What the spine buys is the cold start. On day one of a pilot the map is
 * empty, and an empty map teaches forty seeded users that the app does not
 * work. Two hundred tankers reporting themselves means the map is never empty,
 * for free, on the first morning.
 *
 * **There is no public, documented Sanchari Cauvery API.** This adapter is
 * written against the shape such a feed takes and is inert until
 * VITE_BWSSB_URL points at something. See MANUAL.md §13 — obtaining access is
 * a conversation with BWSSB, not a fetch call.
 */
import { closestPointOnLine, type LngLat } from '../report/geo';
import type { LocalReport } from '../report/types';
import type { SegmentFacts } from '../state/types';

const FEED_URL = import.meta.env.VITE_BWSSB_URL as string | undefined;

export const spineConfigured = Boolean(FEED_URL);

/** PRD §7: a tracked tanker stopped this long on a pilot segment is an event. */
export const STOP_MINUTES = 4;

/** How far off a centreline a vehicle can sit and still be on that road. */
const ON_ROAD_M = 25;

/** Movement below this between polls is standing still, not creeping. */
const MOVED_M = 12;

/**
 * The shape this adapter expects. Any real feed will need a translation
 * function here rather than changes downstream.
 */
export interface TankerPing {
  vehicle_id: string;
  lat: number;
  lng: number;
  at: number;
}

interface Standing {
  since: number;
  lat: number;
  lng: number;
  segment_id: string | null;
  raised: boolean;
}

/**
 * Watches the feed and turns sustained stops into official reports.
 *
 * Official reports skip corroboration entirely (PRD §7): the vehicle is
 * reporting its own position, so there is nobody to corroborate with and
 * nothing to corroborate against.
 */
export class LiveSpine {
  private standing = new Map<string, Standing>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private segments: SegmentFacts[],
    private geometry: Map<string, LngLat[]>,
    private onOfficialReport: (report: LocalReport) => void,
  ) {}

  start(pollSeconds = 60) {
    if (!FEED_URL || this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), pollSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.standing.clear();
  }

  private async poll() {
    const pings = await fetchFeed();
    if (pings) this.ingest(pings);
  }

  /** Separated from the fetch so it can be driven from a fixture or a test. */
  ingest(pings: TankerPing[]) {
    for (const ping of pings) {
      const previous = this.standing.get(ping.vehicle_id);
      const moved =
        previous &&
        haversineish(previous.lat, previous.lng, ping.lat, ping.lng) > MOVED_M;

      if (!previous || moved) {
        this.standing.set(ping.vehicle_id, {
          since: ping.at,
          lat: ping.lat,
          lng: ping.lng,
          segment_id: this.segmentAt(ping),
          raised: false,
        });
        continue;
      }

      const stoppedFor = (ping.at - previous.since) / 60_000;
      if (previous.raised || stoppedFor < STOP_MINUTES || !previous.segment_id) continue;

      previous.raised = true;
      this.onOfficialReport(this.report(ping, previous.segment_id));
    }
  }

  private segmentAt(ping: TankerPing): string | null {
    let best: { id: string; d: number } | null = null;
    for (const s of this.segments) {
      const line = this.geometry.get(s.id);
      if (!line) continue;
      const d = closestPointOnLine([ping.lng, ping.lat], line).distance_m;
      if (d <= ON_ROAD_M && (!best || d < best.d)) best = { id: s.id, d };
    }
    return best?.id ?? null;
  }

  private report(ping: TankerPing, segment_id: string): LocalReport {
    return {
      // Stable per vehicle-stop, so a re-poll cannot raise the same stop twice.
      id: `bwssb-${ping.vehicle_id}-${Math.floor(ping.at / 60_000)}`,
      kind: 'obstruction',
      created_at: ping.at,
      segment_id,
      obstruction_type: 'tanker',
      source: 'official',
      classifier_conf: null,
      // Namespaced, never a person: this is a vehicle reporting itself.
      reporter_id: `bwssb:${ping.vehicle_id}`,
      lat: ping.lat,
      lng: ping.lng,
      accuracy_m: 10,
      snap_distance_m: 0,
      heading_deg: null,
      photo_key: null,
      redaction: null,
      capture_ms: 0,
      corrected: false,
      synced: true,
    };
  }
}

async function fetchFeed(): Promise<TankerPing[] | null> {
  if (!FEED_URL) return null;
  try {
    const res = await fetch(FEED_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { vehicles?: TankerPing[] } | TankerPing[];
    return Array.isArray(json) ? json : (json.vehicles ?? null);
  } catch {
    return null;
  }
}

/** Metres, near enough at these distances and far cheaper than haversine. */
function haversineish(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dx = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  const dy = (lat2 - lat1) * 110574;
  return Math.hypot(dx, dy);
}
