import maplibregl, {
  type ExpressionSpecification,
  type LngLatLike,
  type Map as MlMap,
} from 'maplibre-gl';
import { PALETTE, styleBasemap } from './basemap';
import { junctionDiscs, pilotMask } from './segments/geometry';
import { hatchImage } from './segments/obstructions';
import type { ColourMode, RenderScale, SegmentCollection } from './types';

export const SRC = 'segments';
export const SRC_NODES = 'segment-nodes';
export const SRC_PILOT = 'pilot';
export const SRC_ROUTE = 'route';
export const LAYER_ROUTE = 'route-line';
export const LAYER_CASING = 'segment-casing';
export const LAYER_SURFACE = 'segment-surface';
export const LAYER_SELECTED = 'segment-selected';
export const LAYER_NODE_CASING = 'node-casing';
export const LAYER_NODE_SURFACE = 'node-surface';
export const SRC_OBSTRUCTIONS = 'obstructions';
export const LAYER_OBSTRUCTION_BASE = 'obstruction-base';
export const LAYER_OBSTRUCTION = 'obstruction-fill';
export const LAYER_OBSTRUCTION_EDGE = 'obstruction-edge';
export const LAYER_OBSTRUCTION_EDGE_SOFT = 'obstruction-edge-soft';

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';

export const SOURCE_COLOUR: Record<string, string> = {
  survey: '#3E6E52',
  osm_tag: '#256B8C',
  osm_est: '#B5811C',
  inferred_lanes: '#B5811C',
  class_default: '#A63A26',
};

export const SOURCE_OPACITY: Record<string, number> = {
  survey: 1,
  osm_tag: 1,
  osm_est: 1,
  inferred_lanes: 0.5,
  class_default: 0.35,
};

export const SEVERITY_COLOUR: Record<string, string> = {
  blocked: '#A63A26',
  squeeze: '#B5811C',
  clear: '#3E6E52',
};

/**
 * Width in metres, on screen, at every zoom.
 *
 * Each stop divides the segment's real width by the metres one pixel covers at
 * that zoom, computed at build time for the pilot's centre latitude. Base-2
 * exponential interpolation is exact between stops, because metres-per-pixel
 * halves for every zoom level — so the road is true to scale continuously, not
 * only at the stops.
 */
export function metreWidth(scale: RenderScale, extraMetres = 0, minPx = 0): ExpressionSpecification {
  const widthM: ExpressionSpecification =
    extraMetres === 0 ? ['get', 'width_m'] : ['+', ['get', 'width_m'], extraMetres];

  // The minimum-pixel clamp goes inside each stop, not around the interpolate:
  // MapLibre only accepts ["zoom"] as the direct input of a top-level
  // interpolate/step, and silently drops any layer that nests it deeper.
  const perStop = (mpp: number): ExpressionSpecification => {
    const px = ['/', widthM, mpp] as unknown as ExpressionSpecification;
    return minPx > 0 ? (['max', minPx, px] as unknown as ExpressionSpecification) : px;
  };

  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    ...scale.stops.flatMap(([zoom, mpp]) => [zoom, perStop(mpp)]),
  ] as unknown as ExpressionSpecification;
}

/**
 * Rhythm colours are per-segment and change with the scrubber, so they arrive as
 * a lookup rather than a rule. Segments with too little history are painted the
 * casing grey — "no answer" has to look different from "clear", or the heat map
 * quietly claims coverage it does not have.
 */
export function rhythmColour(colours: Record<string, string>): ExpressionSpecification | string {
  const entries = Object.entries(colours);
  if (!entries.length) return '#8A9691';
  return [
    'match',
    ['get', 'id'],
    ...entries.flatMap(([id, colour]) => [id, colour]),
    '#8A9691',
  ] as unknown as ExpressionSpecification;
}

/**
 * Half a road's width, in screen pixels — the disc that fills a junction.
 *
 * Same metres-per-pixel stops as the line widths, so a disc and the roads it
 * joins are always the same size. `circle-radius` carries the same restriction
 * as `line-width`: ["zoom"] only as the direct input of a top-level interpolate.
 */
export function metreRadius(scale: RenderScale, extraMetres = 0, minPx = 0): ExpressionSpecification {
  const widthM: ExpressionSpecification =
    extraMetres === 0 ? ['get', 'width_m'] : ['+', ['get', 'width_m'], extraMetres];

  const perStop = (mpp: number): ExpressionSpecification => {
    const px = ['/', widthM, 2 * mpp] as unknown as ExpressionSpecification;
    return minPx > 0 ? (['max', minPx, px] as unknown as ExpressionSpecification) : px;
  };

  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    ...scale.stops.flatMap(([zoom, mpp]) => [zoom, perStop(mpp)]),
  ] as unknown as ExpressionSpecification;
}

export function surfaceColour(mode: ColourMode): ExpressionSpecification | string {
  if (mode === 'width_source') {
    return [
      'match',
      ['get', 'width_source'],
      ...Object.entries(SOURCE_COLOUR).flatMap(([k, v]) => [k, v]),
      '#EFEDE6',
    ] as unknown as ExpressionSpecification;
  }
  if (mode === 'tanker') {
    return [
      'match',
      ['get', 'severity_if_tanker'],
      ...Object.entries(SEVERITY_COLOUR).flatMap(([k, v]) => [k, v]),
      '#EFEDE6',
    ] as unknown as ExpressionSpecification;
  }
  return '#EFEDE6';
}

export function surfaceOpacity(mode: ColourMode): ExpressionSpecification | number {
  if (mode !== 'width_source') return 1;
  return [
    'match',
    ['get', 'width_source'],
    ...Object.entries(SOURCE_OPACITY).flatMap(([k, v]) => [k, v]),
    1,
  ] as unknown as ExpressionSpecification;
}

/** Our layers go above the basemap and below its labels. */
function firstSymbolLayer(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}

export interface MapHandles {
  map: MlMap;
  setMode(mode: ColourMode): void;
  setRhythmColours(colours: Record<string, string>): void;
  setSelected(id: string | null): void;
  /** To-scale obstruction footprints, as GeoJSON polygons. */
  setObstructions(data: unknown): void;
  setRoute(coordinates: LngLatLike[][]): void;
}

export function createMap(
  container: string,
  segments: SegmentCollection,
  scale: RenderScale,
  bounds: maplibregl.LngLatBoundsLike,
  pilotRing: [number, number][],
  onPick: (id: string | null) => void,
): Promise<MapHandles> {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP,
    bounds,
    fitBoundsOptions: { padding: 48 },
    minZoom: 13,
    maxZoom: 20,
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  // The scale bar is the acceptance test: at zoom 18 a 4 m road must measure 4 m.
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

  map.on('error', (e) => console.error('[maplibre]', e.error ?? e));

  return new Promise((resolve) => {
    // 'style.load' rather than 'load': the style JSON is all we need to mute the
    // basemap and insert our layers, and waiting on first-tile render leaves the
    // map blank whenever a glyph or sprite request stalls.
    map.once('style.load', () => {
      try {
      styleBasemap(map);
      const before = firstSymbolLayer(map);

      map.addSource(SRC, { type: 'geojson', data: segments as never });
      map.addSource(SRC_NODES, { type: 'geojson', data: junctionDiscs(segments) as never });
      map.addSource(SRC_PILOT, { type: 'geojson', data: pilotMask(pilotRing) as never });

      // Everything outside the survey dims. Without this the reader cannot tell
      // which roads we measured from Positron's own network, and the roads
      // appear to stop for no reason.
      map.addLayer(
        {
          id: 'pilot-mask',
          type: 'fill',
          source: SRC_PILOT,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': PALETTE.outside, 'fill-opacity': 0.22 },
        },
        before,
      );

      map.addLayer(
        {
          id: 'pilot-edge',
          type: 'line',
          source: SRC_PILOT,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': PALETTE.ink2,
            'line-width': 1.2,
            'line-opacity': 0.45,
            'line-dasharray': [5, 4],
          },
        },
        before,
      );

      map.addLayer(
        {
          id: LAYER_CASING,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': PALETTE.casing,
            'line-width': metreWidth(scale, 0.9, 2.6),
          },
        },
        before,
      );

      map.addLayer(
        {
          id: LAYER_SURFACE,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': surfaceColour('plain'),
            'line-opacity': surfaceOpacity('plain'),
            // Clamped a little under the casing so a hairline of edge always
            // survives: zoomed out, a road should still read as a road rather
            // than dissolve into the ground.
            'line-width': metreWidth(scale, 0, 1.4),
          },
        },
        before,
      );

      // Discs fill the squared-off joins the butt caps leave behind: casing
      // under the surface line, surface over it, both in metres.
      map.addLayer(
        {
          id: LAYER_NODE_CASING,
          type: 'circle',
          source: SRC_NODES,
          paint: {
            'circle-color': PALETTE.casing,
            'circle-radius': metreRadius(scale, 0.9, 1.3),
            'circle-pitch-alignment': 'map',
          },
        },
        LAYER_SURFACE,
      );

      map.addLayer(
        {
          id: LAYER_NODE_SURFACE,
          type: 'circle',
          source: SRC_NODES,
          paint: {
            'circle-color': surfaceColour('plain'),
            'circle-opacity': surfaceOpacity('plain'),
            'circle-radius': metreRadius(scale, 0, 0.7),
            'circle-pitch-alignment': 'map',
          },
        },
        before,
      );

      // The signature element: the obstruction, to scale, at the kerb, hatched
      // like an annotation on a survey drawing (PRD §8).
      for (const [name, colour] of [
        ['hatch-blocked', '#A63A26'],
        ['hatch-squeeze', '#B5811C'],
      ] as const) {
        if (!map.hasImage(name)) map.addImage(name, hatchImage(colour), { pixelRatio: 2 });
      }

      map.addSource(SRC_OBSTRUCTIONS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as never,
      });

      const bySeverity = (blocked: string, squeeze: string) =>
        ['match', ['get', 'severity'], 'blocked', blocked, squeeze] as unknown as ExpressionSpecification;

      // A flat base under the hatch, so the glyph reads as a solid object from
      // across the room and still resolves into drawn hatching up close.
      map.addLayer(
        {
          id: LAYER_OBSTRUCTION_BASE,
          type: 'fill',
          source: SRC_OBSTRUCTIONS,
          paint: {
            'fill-color': bySeverity('#A63A26', '#B5811C'),
            'fill-opacity': [
              'case',
              ['==', ['get', 'state'], 'confirmed'],
              0.42,
              0.24,
            ] as unknown as ExpressionSpecification,
          },
        },
        before,
      );

      map.addLayer(
        {
          id: LAYER_OBSTRUCTION,
          type: 'fill',
          source: SRC_OBSTRUCTIONS,
          paint: {
            'fill-pattern': bySeverity('hatch-blocked', 'hatch-squeeze'),
            // A merely *possible* obstruction is drawn more faintly than a
            // corroborated one: the picture carries the same uncertainty the
            // words do.
            'fill-opacity': [
              'case',
              ['==', ['get', 'state'], 'confirmed'],
              0.95,
              0.6,
            ] as unknown as ExpressionSpecification,
          },
        },
        before,
      );

      // Two edge layers rather than one, because `line-dasharray` is not a
      // data-driven property in MapLibre — a `case` there is accepted and then
      // quietly ignored, so both states drew the same outline.
      map.addLayer(
        {
          id: LAYER_OBSTRUCTION_EDGE,
          type: 'line',
          source: SRC_OBSTRUCTIONS,
          filter: ['==', ['get', 'state'], 'confirmed'],
          paint: { 'line-color': bySeverity('#8C2E1E', '#8F6415'), 'line-width': 1.8 },
        },
        before,
      );

      // Dashed while only one person has said so. The picture hedges exactly
      // where the words do.
      map.addLayer(
        {
          id: LAYER_OBSTRUCTION_EDGE_SOFT,
          type: 'line',
          source: SRC_OBSTRUCTIONS,
          filter: ['!=', ['get', 'state'], 'confirmed'],
          paint: {
            'line-color': bySeverity('#8C2E1E', '#8F6415'),
            'line-width': 1.4,
            'line-dasharray': [2.5, 2],
          },
        },
        before,
      );

      // Selection: a hollow outline hugging the casing, not a fat line beneath
      // it. `line-gap-width` punches the middle out, so the ring can sit on top
      // of everything — discs, hatching, all of it — and still never cover the
      // width it is pointing at. Drawn under the old scheme it was a one-pixel
      // sliver at the bottom of the stack, which is to say invisible.
      map.addLayer(
        {
          id: LAYER_SELECTED,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'id'], ''],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': PALETTE.ink,
            'line-gap-width': metreWidth(scale, 0.9, 2.6),
            'line-width': 2,
            'line-opacity': 0.9,
          },
        },
        before,
      );

      // The chosen route, drawn over everything: it is an answer, not terrain.
      map.addSource(SRC_ROUTE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as never,
      });
      map.addLayer({
        id: LAYER_ROUTE,
        type: 'line',
        source: SRC_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#256B8C', 'line-width': 5, 'line-opacity': 0.85 },
      });

      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: [LAYER_CASING] });
        onPick(hit.length ? (hit[0].properties as { id: string }).id : null);
      });

      // The map sits in a grid cell that settles after the webfont lands; MapLibre
      // only watches the window, so the canvas can end up smaller than its box.
      // The map sits in a grid cell that keeps settling while the webfont and the
      // panel resolve, and MapLibre only watches the window. Worse, fitting to a
      // container that has not reached its final size leaves the layout as a
      // speck — so re-fit on every resize until the user takes the camera over.
      let userDrove = false;
      map.on('movestart', (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) userDrove = true;
      });

      const frame = () => {
        map.resize();
        if (!userDrove) map.fitBounds(bounds, { padding: 56, maxZoom: 18, duration: 0 });
      };
      new ResizeObserver(frame).observe(map.getContainer());
      frame();

      map.on('mouseenter', LAYER_CASING, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', LAYER_CASING, () => (map.getCanvas().style.cursor = ''));


      resolve({
        map,
        setMode(mode) {
          if (mode === 'rhythm') return; // colours arrive via setRhythmColours
          map.setPaintProperty(LAYER_SURFACE, 'line-color', surfaceColour(mode));
          map.setPaintProperty(LAYER_SURFACE, 'line-opacity', surfaceOpacity(mode));
          // The junction disc carries the widest adjoining segment's properties,
          // so the same expression colours it with no special casing.
          map.setPaintProperty(LAYER_NODE_SURFACE, 'circle-color', surfaceColour(mode));
          map.setPaintProperty(LAYER_NODE_SURFACE, 'circle-opacity', surfaceOpacity(mode));
        },
        setRhythmColours(colours) {
          map.setPaintProperty(LAYER_SURFACE, 'line-color', rhythmColour(colours));
          map.setPaintProperty(LAYER_SURFACE, 'line-opacity', 1);
          map.setPaintProperty(LAYER_NODE_SURFACE, 'circle-color', rhythmColour(colours));
          map.setPaintProperty(LAYER_NODE_SURFACE, 'circle-opacity', 1);
        },
        setRoute(lines) {
          const src = map.getSource(SRC_ROUTE) as maplibregl.GeoJSONSource | undefined;
          src?.setData({
            type: 'FeatureCollection',
            features: lines.map((coordinates) => ({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coordinates as [number, number][] },
            })),
          } as never);
        },
        setSelected(id) {
          map.setFilter(LAYER_SELECTED, ['==', ['get', 'id'], id ?? '']);
        },
        setObstructions(data) {
          (map.getSource(SRC_OBSTRUCTIONS) as maplibregl.GeoJSONSource | undefined)?.setData(
            data as never,
          );
        },
      });
      } catch (err) {
        console.error('[gully] map setup failed', err);
        throw err;
      }
    });
  });
}
