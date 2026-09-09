/**
 * Obstructions drawn to scale, on the road, at the kerb.
 *
 * PRD §8 names this the signature element and the only place to spend boldness:
 * *"roads drawn at true width with obstructions drawn to scale on top. A 2.5 m
 * tanker on a 4 m road is self-explanatory."*
 *
 * It is the argument made as a picture. Everywhere else the app has to write
 * "1.5 m gap — a car cannot pass"; here you can see that a car cannot pass. The
 * vehicle is drawn against one kerb rather than centred, because that is where
 * a tanker actually stands, and because centring it would split the leftover
 * space in two and hide the fact that neither half is wide enough.
 */
import { METRES_PER_DEG_LAT, bearing, metresPerDegLng, type LngLat } from '../report/geo';
import type { ObstructionType } from '../report/types';
import type { BlockageEvent, SegmentFacts } from '../state/types';
import { VEHICLE_WIDTH_M } from '../state/priors';

/**
 * Lengths are placeholders like the widths they sit beside — a 12,000 L tanker
 * is around 7 m over the body. They affect only how long the glyph looks, never
 * a severity decision, which turns on width alone.
 */
const VEHICLE_LENGTH_M: Record<ObstructionType, number> = {
  tanker: 7,
  mixer: 8.5,
  lorry: 7.5,
  garbage: 7,
  construction: 6,
  event: 8,
  other: 6,
};

interface Placed {
  polygon: LngLat[];
  props: {
    id: string;
    obstruction_type: ObstructionType;
    severity: string;
    state: string;
    gap_m: number;
  };
}

/** Point and local bearing at the middle of a polyline. */
function midpointOf(line: LngLat[]): { at: LngLat; bearing_deg: number } {
  const i = Math.max(1, Math.floor(line.length / 2));
  const a = line[i - 1];
  const b = line[i];
  return {
    at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    bearing_deg: bearing(a, b),
  };
}

/**
 * A rectangle `length_m` long down the road and `width_m` across it, shifted
 * `offset_m` sideways from the centreline.
 */
function footprint(
  at: LngLat,
  bearing_deg: number,
  length_m: number,
  width_m: number,
  offset_m: number,
): LngLat[] {
  const mLng = metresPerDegLng(at[1]);
  const rad = (bearing_deg * Math.PI) / 180;

  // Along the road, and 90 degrees across it.
  const ax = Math.sin(rad);
  const ay = Math.cos(rad);
  const cx = Math.cos(rad);
  const cy = -Math.sin(rad);

  const centre: [number, number] = [
    at[0] + (cx * offset_m) / mLng,
    at[1] + (cy * offset_m) / METRES_PER_DEG_LAT,
  ];

  const corner = (alongSign: number, acrossSign: number): LngLat => {
    const along = (alongSign * length_m) / 2;
    const across = (acrossSign * width_m) / 2;
    return [
      centre[0] + (ax * along + cx * across) / mLng,
      centre[1] + (ay * along + cy * across) / METRES_PER_DEG_LAT,
    ];
  };

  const ring = [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)];
  ring.push(ring[0]);
  return ring;
}

/**
 * Footprints for every live event we can place.
 *
 * Positioned at the segment's midpoint: a report carries a snapped position,
 * but GPS in a layout is 10–20 m off and drawing the vehicle where the phone
 * thought it stood would put tankers in gardens. The midpoint is honest about
 * being schematic — the claim is "a tanker is on this road", not "it is exactly
 * here", and the width is the part that has to be true.
 */
export function obstructionFootprints(
  events: BlockageEvent[],
  segments: Map<string, SegmentFacts>,
  geometry: Map<string, LngLat[]>,
) {
  const placed: Placed[] = [];

  for (const ev of events) {
    const seg = segments.get(ev.segment_id);
    const line = geometry.get(ev.segment_id);
    if (!seg || !line || line.length < 2) continue;

    const { at, bearing_deg } = midpointOf(line);
    const vehicleWidth = VEHICLE_WIDTH_M[ev.obstruction_type] ?? 2.4;
    const length = VEHICLE_LENGTH_M[ev.obstruction_type] ?? 6;

    // Against the kerb: half the road minus half the vehicle. Clamped at zero so
    // a vehicle wider than its road overhangs symmetrically rather than being
    // pushed off the far side.
    const offset = Math.max(0, (seg.width_m - vehicleWidth) / 2);

    placed.push({
      polygon: footprint(at, bearing_deg, length, vehicleWidth, offset),
      props: {
        id: ev.id,
        obstruction_type: ev.obstruction_type,
        severity: ev.severity,
        state: ev.state,
        gap_m: ev.effective_gap_m,
      },
    });
  }

  return {
    type: 'FeatureCollection' as const,
    features: placed.map((p) => ({
      type: 'Feature' as const,
      properties: p.props,
      geometry: { type: 'Polygon' as const, coordinates: [p.polygon] },
    })),
  };
}

/**
 * A hatch swatch, drawn once and registered as a MapLibre image.
 *
 * PRD §8 asks for the blocked state to be a hatched fill rather than a flat
 * one — hatching reads as "this is an annotation on a drawing", which is what
 * it is, and it keeps the road's own colour partly visible underneath so the
 * glyph never looks like a hole in the map.
 */
export function hatchImage(colour: string, size = 8): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = colour;
  // Heavy enough to read as a solid object at a glance and still resolve as
  // hatching up close. Thin lines made the signature element the faintest
  // thing on the map, which is the opposite of what PRD §8 asks for.
  ctx.lineWidth = 3;
  ctx.lineCap = 'square';

  // 45 degrees, drawn three times so the pattern tiles seamlessly across wraps.
  ctx.beginPath();
  ctx.moveTo(-size, size);
  ctx.lineTo(size, -size);
  ctx.moveTo(-size / 2, size * 1.5);
  ctx.lineTo(size * 1.5, -size / 2);
  ctx.moveTo(0, size * 2);
  ctx.lineTo(size * 2, 0);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}
