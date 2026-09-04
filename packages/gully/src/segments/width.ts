/**
 * Width parsing and class defaults — the bottom of the width-precedence chain.
 *
 * Shared between the build script and the test suite so the rules that decide
 * 48 of 61 widths are exercised somewhere other than production.
 *
 * The class defaults carry provenance. Where we could measure the city, we did:
 * the numbers marked `bengaluru-osm` are medians of every `width`-tagged road of
 * that class in greater Bengaluru (bbox 12.85,77.45–13.10,77.78, Overpass,
 * 2026-09-04; 514 tagged ways in total). Where the city sample was missing or
 * visibly contaminated, the global rule of thumb stays and says so.
 */

/** OSM width tags are free text. "4", "4 m", "4m", "13'", "13'6\"", "15 ft". */
export function parseWidth(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*")?$/);
  if (ftIn) return round1((Number(ftIn[1]) + Number(ftIn[2] ?? 0) / 12) * 0.3048);

  const ft = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)$/);
  if (ft) return round1(Number(ft[1]) * 0.3048);

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|metre|meter|metres|meters)?$/);
  if (m) {
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 0 && v < 60 ? round1(v) : null;
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ClassDefault {
  width_m: number;
  /** Where the number comes from — shown to the user, not just recorded. */
  provenance: 'bengaluru-osm' | 'rule-of-thumb';
  /** Sample size behind a measured default. Absent for rules of thumb. */
  n?: number;
}

/**
 * Per-class fallbacks, applied only when nothing better exists.
 *
 * `residential` and `tertiary` are measured: n = 188 and n = 62 respectively,
 * with clean unimodal distributions. `service` and `secondary` were measured
 * too and deliberately NOT adopted — Bengaluru's width-tagged `service` roads
 * (median 7.0, n = 27) are mostly service carriageways alongside highways, not
 * the 4 m layout lanes this product cares about, and `secondary` (median 6.0,
 * p75 12.0, n = 44) is bimodal for the same reason. Taking a contaminated
 * median would make the data worse while looking more rigorous.
 */
export const CLASS_DEFAULTS: Record<string, ClassDefault> = {
  motorway: { width_m: 16, provenance: 'rule-of-thumb' },
  trunk: { width_m: 14, provenance: 'rule-of-thumb' },
  primary: { width_m: 12, provenance: 'rule-of-thumb' },
  secondary: { width_m: 10, provenance: 'rule-of-thumb' },
  tertiary: { width_m: 10, provenance: 'bengaluru-osm', n: 62 },
  motorway_link: { width_m: 8, provenance: 'rule-of-thumb' },
  trunk_link: { width_m: 8, provenance: 'rule-of-thumb' },
  primary_link: { width_m: 8, provenance: 'rule-of-thumb' },
  secondary_link: { width_m: 7, provenance: 'rule-of-thumb' },
  tertiary_link: { width_m: 6, provenance: 'rule-of-thumb' },
  residential: { width_m: 5, provenance: 'bengaluru-osm', n: 188 },
  unclassified: { width_m: 5.5, provenance: 'rule-of-thumb' },
  service: { width_m: 4, provenance: 'rule-of-thumb' },
  living_street: { width_m: 4.5, provenance: 'rule-of-thumb' },
  pedestrian: { width_m: 5, provenance: 'rule-of-thumb' },
  road: { width_m: 5.5, provenance: 'rule-of-thumb' },
  busway: { width_m: 7, provenance: 'rule-of-thumb' },
};

export const FALLBACK_DEFAULT: ClassDefault = { width_m: 5.5, provenance: 'rule-of-thumb' };

export function classDefault(highway: string): ClassDefault {
  return CLASS_DEFAULTS[highway] ?? FALLBACK_DEFAULT;
}

/**
 * The sentence the inspector shows for a class default. A measured city median
 * is still not a measurement of *this* road, and the wording keeps saying so —
 * but "median of 188 tagged residential roads in Bengaluru" is a checkable
 * claim, and "assumed" is not.
 */
export function classDefaultNote(highway: string): string {
  const d = classDefault(highway);
  const cls = highway.replace(/_/g, ' ');
  return d.provenance === 'bengaluru-osm'
    ? `city median of ${d.n} width-tagged ${cls} roads — this road itself is unmeasured`
    : `assumed from road class (${cls}) — unverified`;
}

/**
 * Confidence for a class default. A measured median earns slightly more trust
 * than a rule of thumb, and far less than anything about the road itself —
 * the gap to `survey` (0.95) is the product's reason to exist.
 */
export function classDefaultConfidence(highway: string): number {
  return classDefault(highway).provenance === 'bengaluru-osm' ? 0.3 : 0.2;
}
