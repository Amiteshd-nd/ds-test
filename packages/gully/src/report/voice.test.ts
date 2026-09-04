/**
 * The voice parser: keyword matching across scripts, street references, and
 * clear phrases. Pure functions — the Web Speech plumbing is not under test.
 */
import { describe, expect, it } from 'vitest';
import { parseStreet, parseUtterance, streetScore } from './voice';

describe('parseUtterance', () => {
  it('finds the obstruction in plain English', () => {
    expect(parseUtterance('there is a tanker on 3rd cross').type).toBe('tanker');
  });

  it('prefers the longest match — "water tanker" beats "tanker" fragments', () => {
    const u = parseUtterance('water tanker blocking the road');
    expect(u.type).toBe('tanker');
  });

  it('matches Kannada script', () => {
    expect(parseUtterance('ಟ್ಯಾಂಕರ್ ನಿಂತಿದೆ').type).toBe('tanker');
  });

  it('matches Hindi script', () => {
    expect(parseUtterance('सड़क पर मिक्सर खड़ा है').type).toBe('mixer');
  });

  it('matches transliterated Kannada', () => {
    expect(parseUtterance('neeru gaadi on second main').type).toBe('tanker');
  });

  it('hears a clear report', () => {
    const u = parseUtterance('just drove through, road is clear');
    expect(u.clear).toBe(true);
  });

  it('an unintelligible utterance names nothing rather than guessing', () => {
    const u = parseUtterance('um hello testing');
    expect(u.type).toBeNull();
    expect(u.clear).toBe(false);
  });
});

describe('parseStreet', () => {
  it('reads digit ordinals', () => {
    expect(parseStreet('tanker on 3rd cross')).toBe('3 cross');
    expect(parseStreet('mixer at 12th main')).toBe('12 main');
  });

  it('reads word ordinals', () => {
    expect(parseStreet('tanker on third cross')).toBe('3 cross');
    expect(parseStreet('on second main')).toBe('2 main');
  });

  it('returns null when no street was named', () => {
    expect(parseStreet('tanker outside the gate')).toBeNull();
  });
});

describe('streetScore', () => {
  it('an exact number-and-kind match scores 1', () => {
    expect(streetScore('3rd Cross Road', '3 cross')).toBe(1);
  });

  it('the wrong number on the right kind scores 0', () => {
    expect(streetScore('2nd Cross Road', '3 cross')).toBe(0);
  });

  it('the wrong kind of street scores 0 — a main is not a cross', () => {
    expect(streetScore('3rd Main Road', '3 cross')).toBe(0);
  });

  it('right kind, unnumbered name, scores a weak positive', () => {
    expect(streetScore('unnamed cross off Main Road', '3 cross')).toBeCloseTo(0.4);
  });

  it('no street heard scores 0 so distance snapping stays in charge', () => {
    expect(streetScore('3rd Cross Road', null)).toBe(0);
  });
});
