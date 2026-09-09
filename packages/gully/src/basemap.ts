/**
 * Basemap treatment.
 *
 * Positron is context, not content — but "turn everything down to 25%" is a
 * blunt instrument that made things worse. Its landuse and building fills are
 * near-white, and at low opacity over the sage ground they *lift* the ground
 * toward the road colour. The survey-sheet idea is a light figure on a darker
 * ground; washing the ground out collapses the figure with it, and the roads
 * stop reading as surfaces and start reading as outlines.
 *
 * So this is surgical rather than uniform. Each rule states what it is for.
 */
import type { Map as MlMap } from 'maplibre-gl';

export const PALETTE = {
  /** The ground plane. Deeper than the PRD swatch so the road can sit on it. */
  ground: '#C3CDC5',
  /** Building footprints — darker than the ground, never lighter. */
  building: '#B8C3BA',
  /** Parks and vegetation: a hint of green, still recessive. */
  green: '#BAC8B9',
  water: '#A9BCC0',
  /** The basemap's own roads, beyond the pilot. Present, never competing. */
  contextRoad: '#D6DDD7',
  road: '#EFEDE6',
  casing: '#7C8A85',
  ink: '#1B2724',
  ink2: '#4C5B56',
  /** The wash over everything beyond the survey. Darker than the ground, or it
      dims nothing — which is what filling the mask with the ground colour did. */
  outside: '#6E7C77',
} as const;

/** Layer-id patterns, matched against the Positron style. */
const IS = {
  water: /water|waterway|ocean|sea/i,
  green: /park|wood|grass|forest|scrub|garden|cemetery|pitch|golf/i,
  building: /building/i,
  landuse: /landuse|landcover|residential|industrial|commercial|aeroway|pier/i,
  road: /road|highway|street|bridge|tunnel|transit|rail|path|track/i,
  boundary: /boundary|admin/i,
  poi: /poi|place_|housenum/i,
  roadLabel: /highway-name|road_label|street/i,
};

export function styleBasemap(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;

    if (layer.type === 'background') {
      map.setPaintProperty(id, 'background-color', PALETTE.ground);
      continue;
    }

    if (layer.type === 'fill') {
      // Water and greenery are real landmarks in a layout — you navigate by the
      // lake and the park. They stay, darker than the ground rather than lighter.
      if (IS.water.test(id)) {
        map.setPaintProperty(id, 'fill-color', PALETTE.water);
        map.setPaintProperty(id, 'fill-opacity', 0.85);
      } else if (IS.green.test(id)) {
        map.setPaintProperty(id, 'fill-color', PALETTE.green);
        map.setPaintProperty(id, 'fill-opacity', 0.7);
      } else if (IS.building.test(id)) {
        // Building grain is what makes a layout legible as a layout. Kept as
        // texture: darker than the ground, and only once you are close enough
        // for individual plots to mean something.
        map.setPaintProperty(id, 'fill-color', PALETTE.building);
        map.setPaintProperty(id, 'fill-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          16.5,
          0.55,
        ]);
      } else if (IS.landuse.test(id)) {
        // The offenders: near-white blocks that lift the ground. Gone.
        map.setPaintProperty(id, 'fill-opacity', 0);
      } else {
        map.setPaintProperty(id, 'fill-opacity', 0.15);
      }
      continue;
    }

    if (layer.type === 'line') {
      if (IS.road.test(id)) {
        // Context roads beyond the pilot: a pale trace of the wider network, in
        // a tint of the ground rather than white, so they never read as brighter
        // than the roads we actually measured.
        map.setPaintProperty(id, 'line-color', PALETTE.contextRoad);
        map.setPaintProperty(id, 'line-opacity', 0.9);
      } else if (IS.boundary.test(id)) {
        map.setPaintProperty(id, 'line-opacity', 0.15);
      } else {
        map.setPaintProperty(id, 'line-opacity', 0.3);
      }
      continue;
    }

    if (layer.type === 'symbol') {
      // Icons carry nothing at this scale and cost attention, so they go
      // entirely. Road names stay — they are how somebody checks the map is
      // showing the street they meant.
      map.setLayoutProperty(id, 'icon-image', undefined as never);

      if (IS.poi.test(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
        continue;
      }

      map.setPaintProperty(id, 'text-color', PALETTE.ink2);
      map.setPaintProperty(id, 'text-halo-color', PALETTE.ground);
      map.setPaintProperty(id, 'text-halo-width', 1.4);
      map.setPaintProperty(id, 'text-opacity', IS.roadLabel.test(id) ? 0.75 : 0.4);
    }
  }
}
