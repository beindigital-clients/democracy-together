import { describe, expect, it } from 'vitest';
import {
  classifyPassage,
  coverage,
  findSharedPassages,
  foldWord,
  MIN_RUN_WORDS,
} from './kohopOriginality';

const SOURCE =
  'La participation citoyenne ne se décrète pas : elle se construit dans la durée, avec des institutions qui écoutent, des moyens qui suivent et une évaluation honnête des résultats obtenus sur le terrain.';

describe('findSharedPassages', () => {
  it('finds a copied run, whatever the case, accents and punctuation', () => {
    const copied =
      'Introduction personnelle. LA PARTICIPATION CITOYENNE ne se decrete pas, elle se construit dans la durée avec des institutions qui écoutent. Conclusion propre.';
    const found = findSharedPassages(copied, SOURCE);
    expect(found).toHaveLength(1);
    expect(found[0].words).toBeGreaterThanOrEqual(MIN_RUN_WORDS);
    expect(found[0].passage).toContain('PARTICIPATION');
    expect(found[0].sourcePassage).toContain('participation');
  });

  it('reports nothing for two unrelated texts or a run that is too short', () => {
    expect(
      findSharedPassages(
        'Le budget participatif de Dakar a changé la donne.',
        SOURCE,
      ),
    ).toEqual([]);
    const short =
      'ne se décrète pas : elle se construit ici et ailleurs, autrement.';
    expect(findSharedPassages(short, SOURCE)).toEqual([]);
  });

  it('flags a quotation, inline or as a block', () => {
    const inline = `Comme on l'écrit, « la participation citoyenne ne se décrète pas : elle se construit dans la durée, avec des institutions qui écoutent » selon la source.`;
    expect(findSharedPassages(inline, SOURCE)[0]?.quoted).toBe(true);
    const block = `> La participation citoyenne ne se décrète pas : elle se construit dans la durée, avec des institutions qui écoutent.\n\nSuite.`;
    expect(findSharedPassages(block, SOURCE)[0]?.quoted).toBe(true);
    const plain = `La participation citoyenne ne se décrète pas : elle se construit dans la durée, avec des institutions qui écoutent.`;
    expect(findSharedPassages(plain, SOURCE)[0]?.quoted).toBe(false);
  });

  it('ignores the markup: links and emphasis do not break a run', () => {
    const marked =
      'La **participation citoyenne** ne se décrète pas : elle se [construit](https://exemple.org) dans la durée, avec des institutions qui écoutent.';
    expect(findSharedPassages(marked, SOURCE)).toHaveLength(1);
  });
});

describe('classifyPassage', () => {
  const passage = {
    words: 20,
    quoted: false,
    passage: 'x',
    sourcePassage: 'x',
  };
  const none = {
    sourceCited: false,
    sameAuthor: false,
    selfReuseDeclared: false,
  };
  it('sorts by what a human would conclude', () => {
    expect(
      classifyPassage({
        passage: { ...passage, quoted: true },
        ...none,
        sourceCited: true,
      }),
    ).toBe('referenced_quote');
    expect(
      classifyPassage({ passage: { ...passage, quoted: true }, ...none }),
    ).toBe('borrowing');
    expect(
      classifyPassage({
        passage,
        ...none,
        sameAuthor: true,
        selfReuseDeclared: true,
      }),
    ).toBe('declared_self_reuse');
    expect(classifyPassage({ passage, ...none, sameAuthor: true })).toBe(
      'borrowing',
    );
    expect(
      classifyPassage({ passage: { ...passage, words: 10 }, ...none }),
    ).toBe('common_phrase');
  });
});

describe('coverage and foldWord', () => {
  it('measures the covered share, capped at 1', () => {
    expect(coverage(100, [{ words: 20 }, { words: 5 }])).toBe(0.25);
    expect(coverage(10, [{ words: 50 }])).toBe(1);
    expect(coverage(0, [])).toBe(0);
  });
  it('folds a word', () => {
    expect(foldWord('« Écoutent, »')).toBe('ecoutent');
  });
});
