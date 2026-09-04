/**
 * Position, heading and the safety gate.
 *
 * The gate is the important part. PRD §9 commits to stopped-only capture, so
 * the camera path is closed above walking-to-slow-riding pace and the voice
 * path is offered instead. A rider should never be choosing between a report
 * and the road.
 */
import type { Fix } from './types';

/** ~8 km/h. Above this you are riding, not standing beside a tanker. */
export const MOVING_MPS = 2.2;

export interface SensorState {
  fix: Fix | null;
  /** Why there is no fix, in words a reporter can act on. */
  error: string | null;
  moving: boolean;
}

type Listener = (s: SensorState) => void;

export class Sensors {
  private state: SensorState = { fix: null, error: null, moving: false };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;
  private compass: number | null = null;
  private onOrientation = (e: DeviceOrientationEvent) => {
    const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading;
    if (typeof webkit === 'number' && !Number.isNaN(webkit)) this.compass = webkit;
    else if (e.absolute && typeof e.alpha === 'number') this.compass = (360 - e.alpha) % 360;
  };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  get current(): SensorState {
    return this.state;
  }

  private emit(patch: Partial<SensorState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  async start(): Promise<void> {
    await this.startCompass();

    if (!('geolocation' in navigator)) {
      this.emit({ error: 'This device has no location service.' });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        // Course from GPS is only meaningful while moving; the compass is the
        // one that works standing still, which is the case that matters here.
        const heading =
          this.compass ??
          (typeof c.heading === 'number' && !Number.isNaN(c.heading) && (c.speed ?? 0) > 0.5
            ? c.heading
            : null);

        const speed = typeof c.speed === 'number' && !Number.isNaN(c.speed) ? c.speed : null;

        this.emit({
          error: null,
          moving: speed !== null && speed > MOVING_MPS,
          fix: {
            lat: c.latitude,
            lng: c.longitude,
            accuracy_m: Math.round(c.accuracy),
            heading_deg: heading === null ? null : Math.round(heading),
            speed_mps: speed,
            at: pos.timestamp,
          },
        });
      },
      (err) => {
        this.emit({
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location is blocked. A report without a position cannot be placed on a road.'
              : 'Waiting for a location fix.',
        });
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  /** iOS gates the compass behind an explicit gesture-bound permission call. */
  private async startCompass(): Promise<void> {
    const DOE = window.DeviceOrientationEvent as unknown as
      | { requestPermission?: () => Promise<'granted' | 'denied'> }
      | undefined;
    try {
      if (DOE?.requestPermission) {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return;
      }
      window.addEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
      window.addEventListener('deviceorientation', this.onOrientation);
    } catch {
      /* no compass; snapping falls back to distance alone */
    }
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    window.removeEventListener('deviceorientationabsolute', this.onOrientation as EventListener);
    window.removeEventListener('deviceorientation', this.onOrientation);
  }
}

/** A stand-in fix for desk testing, where there is no GPS inside the pilot. */
export function simulatedFix(lat: number, lng: number, heading_deg: number | null): Fix {
  return { lat, lng, accuracy_m: 12, heading_deg, speed_mps: 0, at: Date.now() };
}
