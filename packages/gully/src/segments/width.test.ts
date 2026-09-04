/**
 * Width parsing and class defaults — the rules behind 48 of the pilot's 61
 * widths. parseWidth failing quietly would poison the dataset upstream of
 * everything else, which is why it gets this much attention.
 */
import { describe, expect, it } from 'vitest';
import { classDefault, classDefaultConfidence, classDefaultNote, parseWidth } from './width';

describe('parseWidth', () => {
  it('parses bare metres and unit variants', () => {
    expect(parseWidth('4')).toBe(4);
    expect(parseWidth('4 m')).toBe(4);
    expect(parseWidth('4m')).toBe(4);
    expect(parseWidth('4.5 metres')).toBe(4.5);
  });

  it('parses feet, with and without inches', () => {
    expect(parseWidth("13'")).toBeCloseTo(4.0, 1);
    expect(parseWidth('15 ft')).toBeCloseTo(4.6, 1);
    expect(parseWidth(`13'6"`)).toBeCloseTo(4.1, 1);
  });

  it('rejects garbage instead of coercing it', () => {
    expect(parseWidth('wide')).toBeNull();
    expect(parseWidth('')).toBeNull();
    expect(parseWidth(undefined)).toBeNull();
    expect(parseWidth('4;6')).toBeNull(); // OSM multi-values are ambiguous — refuse
  });

  it('rejects implausible magnitudes — a 300 m wide road is a typo, not a road', () => {
    expect(parseWidth('300')).toBeNull();
    expect(parseWidth('0')).toBeNull();
  });
});

describe('class defaults', () => {
  it('measured classes carry their sample size and cite the city', () => {
    const d = classDefault('residential');
    expect(d.provenance).toBe('bengaluru-osm');
    expect(d.n).toBeGreaterThan(100);
    expect(classDefaultNote('residential')).toMatch(/median of \d+/);
    expect(classDefaultNote('residential')).toMatch(/unmeasured/);
  });

  it('rules of thumb say so plainly', () => {
    expect(classDefault('service').provenance).toBe('rule-of-thumb');
    expect(classDefaultNote('service')).toMatch(/unverified/);
  });

  it('a measured median earns more confidence than a guess, and far less than a survey', () => {
    expect(classDefaultConfidence('residential')).toBeGreaterThan(classDefaultConfidence('service'));
    expect(classDefaultConfidence('residential')).toBeLessThan(0.5);
  });

  it('an unknown highway class falls back rather than crashing the build', () => {
    expect(classDefault('bridleway').width_m).toBeGreaterThan(0);
  });

  it('service keeps the layout-lane guess, not the contaminated city median', () => {
    // Bengaluru's width-tagged service roads are mostly highway service
    // carriageways (median 7.0). Adopting that here would misdescribe every
    // 4 m layout lane. This test pins the decision.
    expect(classDefault('service').width_m).toBe(4);
  });
});
