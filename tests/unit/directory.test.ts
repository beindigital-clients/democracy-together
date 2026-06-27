import { describe, it, expect } from 'vitest';
import {
  matchesFilters,
  computeFacets,
  REGIONS,
  THEMES,
} from '../../convex/lib/directory';

const org = (over: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  name: 'X',
  country: 'SN',
  region: 'afrique-ouest',
  languages: ['fr'],
  themes: ['gouvernance'],
  description: '',
  ...over,
});

describe('Annuaire — matchesFilters (F-19)', () => {
  it('combine région, thématique et recherche en ET', () => {
    expect(matchesFilters(org(), {})).toBe(true);
    expect(matchesFilters(org(), { region: 'europe-ouest' })).toBe(false);
    expect(
      matchesFilters(org({ themes: ['gouvernance', 'paix'] }), { theme: 'paix' }),
    ).toBe(true);
    expect(matchesFilters(org(), { theme: 'paix' })).toBe(false);
  });

  it('recherche sur le nom et la description, insensible à la casse', () => {
    expect(matchesFilters(org({ name: 'Institut Sahel' }), { q: 'sahel' })).toBe(
      true,
    );
    expect(
      matchesFilters(org({ description: 'intégrité électorale' }), {
        q: 'Électorale',
      }),
    ).toBe(true);
    expect(matchesFilters(org(), { q: 'introuvable' })).toBe(false);
    expect(matchesFilters(org(), { q: '   ' })).toBe(true); // recherche vide = neutre
  });

  it('respecte tous les filtres simultanément', () => {
    const o = org({ region: 'europe-ouest', themes: ['droits'] });
    expect(matchesFilters(o, { region: 'europe-ouest', theme: 'droits' })).toBe(
      true,
    );
    expect(matchesFilters(o, { region: 'europe-ouest', theme: 'paix' })).toBe(
      false,
    );
  });
});

describe('Annuaire — computeFacets (F-19)', () => {
  it('compte les occurrences et trie par fréquence puis alpha', () => {
    const orgs = [
      org({ region: 'afrique-ouest', themes: ['gouvernance'], languages: ['fr'] }),
      org({
        region: 'afrique-ouest',
        themes: ['gouvernance', 'paix'],
        languages: ['fr', 'en'],
      }),
      org({ region: 'europe-ouest', themes: ['paix'], languages: ['en'] }),
    ];
    const f = computeFacets(orgs);

    expect(f.regions[0]).toEqual({ value: 'afrique-ouest', count: 2 });
    const themes = Object.fromEntries(f.themes.map((t) => [t.value, t.count]));
    expect(themes.gouvernance).toBe(2);
    expect(themes.paix).toBe(2);
    const langs = Object.fromEntries(f.languages.map((l) => [l.value, l.count]));
    expect(langs.fr).toBe(2);
    expect(langs.en).toBe(2);
  });
});

describe('Annuaire — vocabulaire contrôlé', () => {
  it('expose les régions et thématiques', () => {
    expect(REGIONS).toContain('afrique-ouest');
    expect(REGIONS).toContain('europe-ouest');
    expect(THEMES).toContain('gouvernance');
    expect(THEMES).toHaveLength(10);
  });
});
