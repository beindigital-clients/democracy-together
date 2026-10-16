import { describe, expect, it } from 'vitest';
import {
  balancedSelection,
  regionOfCountry,
  scoreCandidate,
  topCandidates,
} from './kohopSuggest';

const target = {
  fields: ['citizen-participation'] as const,
  keywords: ['budget participatif', 'Dakar'],
  lang: 'fr',
};

describe('scoreCandidate', () => {
  it('rewards a matching theme and matching expertise words', () => {
    const r = scoreCandidate(target, {
      themes: ['participation'],
      languages: ['fr'],
      searchText: 'awa politiste budget participatif a dakar',
    });
    expect(r.reasons).toEqual(['field', 'keyword', 'language']);
    expect(r.score).toBe(3 + 2 * 2 + 1);
  });

  it('a shared language alone is not a reason', () => {
    expect(
      scoreCandidate(target, {
        themes: [],
        languages: ['fr'],
        searchText: 'x',
      }),
    ).toEqual({ score: 0, reasons: [] });
  });

  it('folds accents and case in the keywords', () => {
    const r = scoreCandidate(
      { ...target, keywords: ['Éducation'] },
      {
        themes: [],
        languages: [],
        searchText: 'spécialiste en education civique',
      },
    );
    expect(r.reasons).toEqual(['keyword']);
  });

  it('ignores very short keywords', () => {
    const r = scoreCandidate(
      { ...target, keywords: ['ia'] },
      { themes: [], languages: [], searchText: 'ia générative' },
    );
    expect(r.reasons).toEqual([]);
  });
});

describe('topCandidates', () => {
  it('keeps the five best, best first, and drops the zero scores', () => {
    const rows = [
      { name: 'F', score: 1 },
      { name: 'A', score: 9 },
      { name: 'B', score: 9 },
      { name: 'C', score: 5 },
      { name: 'D', score: 4 },
      { name: 'E', score: 2 },
      { name: 'Z', score: 0 },
    ];
    expect(topCandidates(rows).map((r) => r.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });
});

describe('travaux publiés', () => {
  it('une publication de la bibliothèque sur le sujet est une raison de proposer', () => {
    const r = scoreCandidate(target, {
      themes: [],
      languages: [],
      searchText: 'sans rapport',
      works: ['Le budget participatif à Dakar : un bilan'],
    });
    expect(r.reasons).toContain('work');
    expect(r.score).toBeGreaterThan(0);
  });

  it('sans rapport avec le sujet, aucune raison', () => {
    expect(
      scoreCandidate(target, {
        themes: [],
        languages: [],
        searchText: 'x',
        works: ['Hydrologie du bassin du fleuve'],
      }).score,
    ).toBe(0);
  });
});

describe('regionOfCountry', () => {
  it('classe les pays d’Afrique, d’Europe et les autres', () => {
    expect(regionOfCountry('SN')).toBe('africa');
    expect(regionOfCountry('fr')).toBe('europe');
    expect(regionOfCountry('BR')).toBe('other');
    expect(regionOfCountry(undefined)).toBe('other');
  });
});

describe('balancedSelection', () => {
  const c = (
    name: string,
    score: number,
    region: 'africa' | 'europe' | 'other',
    lang = 'fr',
  ) => ({ name, score, region, languages: [lang] });

  it('mélange l’Afrique et l’Europe plutôt que de prendre cinq noms d’une seule région', () => {
    const out = balancedSelection([
      c('A', 10, 'europe'),
      c('B', 9, 'europe'),
      c('C', 8, 'europe'),
      c('D', 7, 'europe'),
      c('E', 6, 'africa'),
      c('F', 6, 'africa'),
    ]);
    const regions = out.map((x) => x.region);
    expect(regions).toContain('africa');
    expect(regions).toContain('europe');
    expect(out).toHaveLength(5);
    expect(out[0].name).toBe('A');
  });

  it('varie aussi les langues, et reste déterministe', () => {
    const rows = [
      c('A', 5, 'africa', 'fr'),
      c('B', 5, 'africa', 'fr'),
      c('C', 5, 'africa', 'en'),
    ];
    const a = balancedSelection(rows, 2).map((x) => x.name);
    expect(a).toEqual(['A', 'C']);
    expect(balancedSelection(rows, 2).map((x) => x.name)).toEqual(a);
  });

  it('ne propose jamais un score nul, ni plus que demandé', () => {
    expect(balancedSelection([c('Z', 0, 'africa')])).toEqual([]);
    expect(
      balancedSelection(
        Array.from({ length: 9 }, (_, i) => c(`N${i}`, 3, 'other')),
        3,
      ),
    ).toHaveLength(3);
  });
});
