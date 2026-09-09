/**
 * Derived geometry for rendering: the pilot mask, and junction discs.
 *
 * Both exist to answer questions the segment lines alone leave open — where the
 * measured area ends, and whether two roads actually meet.
 */
import type { SegmentCollection, SegmentProps } from '../types';

type Ring = [number, number][];

/**
 * A polygon covering the world with the pilot cut out of it.
 *
 * Filled with a translucent wash, this dims everything beyond the survey. It
 * answers the question the map otherwise begs — *why do the roads stop?* —
 * without a legend: inside is measured, outside is borrowed context. It also
 * stops a reader mistaking Positron's pale network for our data.
 */
export function pilotMask(ring: [number, number][]) {
  const outer: Ring = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  // Ring is [lat, lng] in pilot.config; GeoJSON wants [lng, lat], and the hole
  // must wind opposite to the shell.
  const hole: Ring = ring.map(([lat, lng]) => [lng, lat] as [number, number]);
  hole.push(hole[0]);

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [outer, hole.slice().reverse()] },
      },
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: hole },
      },
    ],
  };
}

/**
 * One point per graph node, carrying the properties of the widest segment that
 * meets there.
 *
 * Segment lines are drawn with butt caps, because anything else would make
 * neighbouring segments overlap and double-darken at every join. The cost is
 * that a junction is a set of squared-off line ends meeting at a point, and a
 * cul-de-sac terminates in a flat chop. A disc at each node — casing under,
 * surface over, both sized in metres like everything else — fills the join and
 * rounds the dead end, so the network reads as continuous asphalt.
 *
 * Carrying the widest segment's properties rather than inventing new ones means
 * the disc inherits whatever the colour mode is doing, with no special casing.
 */
export function junctionDiscs(segments: SegmentCollection) {
  const widest = new Map<number, SegmentProps>();
  const point = new Map<number, [number, number]>();

  for (const f of segments.features) {
    const line = f.geometry.coordinates;
    const ends: [number, [number, number]][] = [
      [f.properties.from_node, line[0]],
      [f.properties.to_node, line[line.length - 1]],
    ];
    for (const [node, at] of ends) {
      point.set(node, at);
      const held = widest.get(node);
      if (!held || f.properties.width_m > held.width_m) widest.set(node, f.properties);
    }
  }

  return {
    type: 'FeatureCollection' as const,
    features: [...widest].map(([node, props]) => ({
      type: 'Feature' as const,
      properties: { ...props, node },
      geometry: { type: 'Point' as const, coordinates: point.get(node)! },
    })),
  };
}
