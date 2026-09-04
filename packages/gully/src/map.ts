import maplibregl, {
  type ExpressionSpecification,
  type LngLatLike,
  type Map as MlMap,
} from 'maplibre-gl';
import type { ColourMode, RenderScale, SegmentCollection } from './types';

export const SRC = 'segments';
export const SRC_ROUTE = 'route';
export const LAYER_ROUTE = 'route-line';
export const LAYER_CASING = 'segment-casing';
export const LAYER_SURFACE = 'segment-surface';
export const LAYER_SELECTED = 'segment-selected';

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

/**
 * Positron is context, not content. Drop it back so our casings read as the
 * figure: mute the label and POI layers, thin the basemap's own roads, and
 * repaint the ground plane in the survey-sheet sage.
 */
function muteBasemap(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (id === 'background') {
      map.setPaintProperty(id, 'background-color', '#CBD3CC');
      continue;
    }
    if (layer.type === 'symbol') {
      map.setPaintProperty(id, 'text-opacity', 0.25);
      map.setPaintProperty(id, 'icon-opacity', 0.2);
      continue;
    }
    if (layer.type === 'line') {
      map.setPaintProperty(id, 'line-opacity', 0.25);
      continue;
    }
    if (layer.type === 'fill') {
      if (/water/.test(id)) map.setPaintProperty(id, 'fill-color', '#B6C4C6');
      else map.setPaintProperty(id, 'fill-opacity', 0.2);
    }
  }
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
  setRoute(coordinates: LngLatLike[][]): void;
}

export function createMap(
  container: string,
  segments: SegmentCollection,
  scale: RenderScale,
  bounds: maplibregl.LngLatBoundsLike,
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
      muteBasemap(map);
      const before = firstSymbolLayer(map);

      map.addSource(SRC, { type: 'geojson', data: segments as never });

      map.addLayer(
        {
          id: LAYER_CASING,
          type: 'line',
          source: SRC,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': '#8A9691',
            'line-width': metreWidth(scale, 0.9, 1.5),
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
            'line-width': metreWidth(scale),
          },
        },
        before,
      );

      // Selection ring — sits just outside the casing so it never hides width.
      map.addLayer(
        {
          id: LAYER_SELECTED,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'id'], ''],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': '#1B2724',
            'line-width': metreWidth(scale, 2.4, 4),
            'line-opacity': 0.85,
          },
        },
        LAYER_CASING,
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
        },
        setRhythmColours(colours) {
          map.setPaintProperty(LAYER_SURFACE, 'line-color', rhythmColour(colours));
          map.setPaintProperty(LAYER_SURFACE, 'line-opacity', 1);
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
      });
      } catch (err) {
        console.error('[gully] map setup failed', err);
        throw err;
      }
    });
  });
}
