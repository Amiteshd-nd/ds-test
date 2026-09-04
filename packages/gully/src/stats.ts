import type { ColourMode, SegmentFeature } from './types';
import { SEVERITY_COLOUR, SOURCE_COLOUR, SOURCE_OPACITY } from './map';

export function countBy<K extends string>(features: SegmentFeature[], pick: (f: SegmentFeature) => K) {
  return features.reduce<Record<string, number>>((acc, f) => {
    const k = pick(f);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * The Phase 1 headline. Not a footnote: this sentence is the measurement of the
 * data gap the whole product exists to close.
 */
export function statLine(features: SegmentFeature[]): string {
  const c = countBy(features, (f) => f.properties.width_source);
  const parts = [
    [c.survey ?? 0, 'surveyed'],
    [c.osm_tag ?? 0, 'tagged in OSM'],
    [c.osm_est ?? 0, 'estimated in OSM'],
    [c.inferred_lanes ?? 0, 'inferred from lanes'],
    [c.class_default ?? 0, 'assumed from road class'],
  ] as [number, string][];

  const said = parts
    .map(([n, label]) =>
      n === 0 ? `<span class="stat--weak">${n} ${label}</span>` : `<b>${n}</b> ${label}`,
    )
    .join(', ');

  return `Of ${features.length} segments: ${said}.`;
}

const SOURCE_LABEL: Record<string, string> = {
  survey: 'Measured on site',
  osm_tag: 'Tagged in OSM',
  osm_est: 'Estimated in OSM',
  inferred_lanes: 'Inferred from lanes',
  class_default: 'Assumed from road class',
};

const SEVERITY_LABEL: Record<string, string> = {
  blocked: 'Blocked — a car cannot pass',
  squeeze: 'Squeeze — bikes pass, cars queue',
  clear: 'Clear — traffic flows',
};

export function legendHtml(mode: ColourMode, features: SegmentFeature[]): string | null {
  if (mode === 'plain') return null;

  if (mode === 'rhythm') {
    const rows = [
      ['#3E6E52', 'Rarely blocked', 'under 20%'],
      ['#B5811C', 'Sometimes', '20–50%'],
      ['#A63A26', 'Usually blocked', 'over 50%'],
      ['#8A9691', 'Not enough history', 'under 5 days'],
    ]
      .map(
        ([c, label, note]) => `<div class="legend__row">
          <span class="legend__swatch" style="background:${c}"></span>
          ${label}<span class="legend__count">${note}</span>
        </div>`,
      )
      .join('');
    return `${rows}<p class="legend__rule">How often this road was blocked in this 15-minute slot, on this weekday.</p>`;
  }

  if (mode === 'width_source') {
    const c = countBy(features, (f) => f.properties.width_source);
    const rows = Object.keys(SOURCE_LABEL)
      .map(
        (k) => `<div class="legend__row">
          <span class="legend__swatch" style="background:${SOURCE_COLOUR[k]};opacity:${SOURCE_OPACITY[k]}"></span>
          ${SOURCE_LABEL[k]}<span class="legend__count">${c[k] ?? 0}</span>
        </div>`,
      )
      .join('');
    return `${rows}<p class="legend__rule">Fainter is less certain. Red is a number nobody has checked.</p>`;
  }

  const c = countBy(features, (f) => f.properties.severity_if_tanker);
  const rows = (['blocked', 'squeeze', 'clear'] as const)
    .map(
      (k) => `<div class="legend__row">
        <span class="legend__swatch" style="background:${SEVERITY_COLOUR[k]}"></span>
        ${SEVERITY_LABEL[k]}<span class="legend__count">${c[k] ?? 0}</span>
      </div>`,
    )
    .join('');
  return `${rows}<p class="legend__rule">A 2.5 m tanker needs 2.2 m left over for a car to pass.</p>`;
}
