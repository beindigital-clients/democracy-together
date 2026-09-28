import { describe, it, expect } from 'vitest';
import {
  matchesFilters,
  computeFacets,
  countryTerms,
  isCountryCode,
  isLanguageCode,
  REGIONS,
  DIRECTORY_THEMES,
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
      matchesFilters(org({ themes: ['gouvernance', 'paix'] }), {
        theme: 'paix',
      }),
    ).toBe(true);
    expect(matchesFilters(org(), { theme: 'paix' })).toBe(false);
  });

  it('recherche sur le nom et la description, insensible à la casse', () => {
    expect(
      matchesFilters(org({ name: 'Institut Sahel' }), { q: 'sahel' }),
    ).toBe(true);
    expect(
      matchesFilters(org({ description: 'intégrité électorale' }), {
        q: 'Électorale',
      }),
    ).toBe(true);
    expect(matchesFilters(org(), { q: 'introuvable' })).toBe(false);
    expect(matchesFilters(org(), { q: '   ' })).toBe(true); // empty search = neutral
  });

  it('filtre par pays et par langue (codes ISO, casse indifférente)', () => {
    // F-19 calls for four filters; country and language were missing (27/09).
    const o = org({ country: 'KE', languages: ['en', 'sw'] });
    expect(matchesFilters(o, { country: 'ke' })).toBe(true);
    expect(matchesFilters(o, { country: 'KE' })).toBe(true);
    expect(matchesFilters(o, { country: 'SN' })).toBe(false);
    expect(matchesFilters(o, { language: 'EN' })).toBe(true);
    expect(matchesFilters(o, { language: 'fr' })).toBe(false);
    expect(matchesFilters(o, { country: 'ke', language: 'sw' })).toBe(true);
    expect(matchesFilters(o, { country: 'ke', language: 'fr' })).toBe(false);
  });

  it('la recherche texte trouve un membre par nom de pays, dans les langues du site', () => {
    // Measured on 27/09: "Kenya" -> 0 (the haystack only carried name +
    // description; the country is only stored as a code).
    const o = org({ name: 'Institute for Policy', country: 'KE' });
    expect(matchesFilters(o, { q: 'Kenya' })).toBe(true);
    expect(matchesFilters(o, { q: 'ke' })).toBe(true);
    const ci = org({ name: 'Centre', country: 'CI' });
    expect(matchesFilters(ci, { q: "cote d'ivoire" })).toBe(true);
    expect(matchesFilters(ci, { q: 'Costa do Marfim' })).toBe(true);
    expect(matchesFilters(ci, { q: 'Kenya' })).toBe(false);
  });

  it('countryTerms : le code ISO est toujours présent, un code inconnu ne jette pas', () => {
    expect(countryTerms('SN').split(' ')).toContain('sn');
    expect(countryTerms('SN')).toContain('senegal');
    // `QM` (range reserved for private use): ICU has no name, the code stays.
    expect(countryTerms('QM')).toBe('qm');
    expect(() => countryTerms('!!')).not.toThrow();
    expect(countryTerms('!!')).toBe('!!');
  });

  it('isCountryCode / isLanguageCode : deux ou trois lettres, rien d’autre', () => {
    expect(isCountryCode('ke')).toBe(true);
    expect(isCountryCode('KEN')).toBe(true);
    expect(isCountryCode('<script>')).toBe(false);
    expect(isCountryCode('')).toBe(false);
    expect(isLanguageCode('fr')).toBe(true);
    expect(isLanguageCode('fr-FR')).toBe(false);
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
      org({
        region: 'afrique-ouest',
        themes: ['gouvernance'],
        languages: ['fr'],
      }),
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
    const langs = Object.fromEntries(
      f.languages.map((l) => [l.value, l.count]),
    );
    expect(langs.fr).toBe(2);
    expect(langs.en).toBe(2);
  });
});

describe('Annuaire — vocabulaire contrôlé', () => {
  it('expose les régions et thématiques', () => {
    expect(REGIONS).toContain('afrique-ouest');
    expect(REGIONS).toContain('europe-ouest');
    expect(DIRECTORY_THEMES).toContain('gouvernance');
    expect(DIRECTORY_THEMES).toHaveLength(10);
  });
});
