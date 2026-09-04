// The pilot area. One layout, densely — see PRD §4 "Non-goals".
//
// Kaggadasapura, CV Raman Nagar: a tanker-dependent residential grid east of
// Bengaluru's Old Madras Road corridor. Chosen for narrow crosses and thin OSM
// width coverage — the second is the point of Phase 1, not a problem with it.
//
// Ring is [lat, lng] pairs, unclosed. Redraw at geojson.io if you move the pilot;
// everything downstream (fetch, clip, render scale) reads from here.

export const LAYOUT_NAME = 'Kaggadasapura, CV Raman Nagar';
export const LAYOUT_SUBTITLE = 'Bengaluru · pilot polygon';

export const PILOT_RING: [number, number][] = [
  [12.9862, 77.667],
  [12.9862, 77.671],
  [12.9885, 77.6714],
  [12.9897, 77.67],
  [12.9895, 77.6672],
];

/** Centre of the ring. All metres-per-pixel constants are computed at this latitude. */
export const CENTRE: { lat: number; lng: number } = {
  lat: PILOT_RING.reduce((s, p) => s + p[0], 0) / PILOT_RING.length,
  lng: PILOT_RING.reduce((s, p) => s + p[1], 0) / PILOT_RING.length,
};

/** Zoom stops for the true-width line expressions. */
export const ZOOM_STOPS = [14, 15, 16, 17, 18, 19, 20] as const;

/** A 12,000 L water tanker is about 2.5 m across the mirrors. PRD §6. */
export const TANKER_WIDTH_M = 2.5;

/** Below this, OSRM's own car profile refuses to route. We borrow the constant. */
export const CAR_REFUSAL_GAP_M = 2.2;

/** Above this, both directions still work. */
export const SQUEEZE_GAP_M = 4.2;
