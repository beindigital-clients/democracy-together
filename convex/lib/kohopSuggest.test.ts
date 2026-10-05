import { describe, expect, it } from 'vitest';
import { scoreCandidate, topCandidates } from './kohopSuggest';

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
