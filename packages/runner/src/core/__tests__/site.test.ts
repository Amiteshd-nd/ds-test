import { describe, expect, it } from 'vitest';

import { profileBrief, brandFacts, contactLinks, isUsable, INTERVIEW, FIELD_LOCATION, INTERVIEW_FIELDS } from '../business/profile.ts';
import type { BusinessProfile } from '../types.ts';

const profile = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  project_id: 'p',
  name: 'Kestrel Hedgelaying',
  offer: 'Hedgelaying by hand.',
  audience: 'Farm managers.',
  tone: 'Plain.',
  brand_json: JSON.stringify({ area: 'Herefordshire', since: '2016' }),
  links_json: JSON.stringify({ email: 'hello@example.test' }),
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('the business profile', () => {
  it('reads the two JSON columns', () => {
    expect(brandFacts(profile()).area).toBe('Herefordshire');
    expect(contactLinks(profile()).email).toBe('hello@example.test');
  });

  it('survives a malformed blob rather than losing the whole profile', () => {
    expect(brandFacts(profile({ brand_json: 'not json' }))).toEqual({});
  });

  it('needs a name, an offer and an audience before a page is worth attempting', () => {
    expect(isUsable(profile())).toBe(true);
    expect(isUsable(profile({ audience: null }))).toBe(false);
    expect(isUsable(null)).toBe(false);
  });

  it('every interview field has somewhere to be stored', () => {
    // A field the interview asks for but the API cannot place is silently
    // discarded, which looks exactly like the owner never answering.
    for (const field of INTERVIEW_FIELDS) {
      expect(FIELD_LOCATION[field]).toBeDefined();
    }
  });

  it('asks between five and seven questions', () => {
    // PRD section 9. Longer and people abandon it; shorter and the builder has
    // to guess at things only the owner knows.
    expect(INTERVIEW.length).toBeGreaterThanOrEqual(5);
    expect(INTERVIEW.length).toBeLessThanOrEqual(7);
  });
});

describe('the brief handed to the builder', () => {
  it('omits blanks rather than filling them', () => {
    // A placeholder in the brief is a fact the builder will print on the page.
    const brief = profileBrief(profile({ tone: null, links_json: '{}' }));
    expect(brief).toContain('Kestrel Hedgelaying');
    expect(brief).not.toMatch(/sound|Email/);
    expect(brief).not.toContain('undefined');
    expect(brief).not.toContain('null');
  });

  it('tells the builder not to invent the rest', () => {
    expect(profileBrief(profile())).toMatch(/Do not add review counts/);
  });

  it('is empty when there is nothing to say', () => {
    expect(profileBrief(null)).toBe('');
    expect(
      profileBrief(profile({ name: null, offer: null, audience: null, tone: null, brand_json: null, links_json: null })),
    ).toBe('');
  });
});
