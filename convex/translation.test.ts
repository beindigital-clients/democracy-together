import { describe, it, expect } from 'vitest';
import {
  buildTranslationInstructions,
  buildTranslationSchema,
  outputTokenBudget,
  parseTranslation,
  sourceFingerprint,
  sourceLength,
  TRANSLATION_OUTPUT_CEILING,
  TRANSLATION_OUTPUT_FLOOR,
  type TranslatableFields,
} from './lib/translation';
import { splitParagraphs } from './translation';

// This file holds the PURE translation logic: what decides that a
// model response is usable, and what decides that a cached translation
// is stale. Both fail silently if they are not tested — a
// translation missing a paragraph displays as a translation, and a
// fingerprint that does not change serves a text the author has corrected.

const SOURCE: TranslatableFields = {
  title: 'Gouvernance numérique',
  abstract: 'Un résumé.',
  keypoints: ['Point un', 'Point deux'],
  body: ['Premier paragraphe.', 'Deuxième paragraphe.', 'Troisième.'],
};

describe('Empreinte du texte source — détecter une modification', () => {
  it('est stable pour un contenu identique', () => {
    expect(sourceFingerprint(SOURCE)).toBe(sourceFingerprint({ ...SOURCE }));
  });

  it('change dès qu’un caractère du titre change', () => {
    expect(
      sourceFingerprint({ ...SOURCE, title: 'Gouvernance numerique' }),
    ).not.toBe(sourceFingerprint(SOURCE));
  });

  it('change quand un paragraphe est ajouté, retiré ou réordonné', () => {
    const base = sourceFingerprint(SOURCE);
    expect(
      sourceFingerprint({ ...SOURCE, body: [...SOURCE.body, 'Quatrième.'] }),
    ).not.toBe(base);
    expect(
      sourceFingerprint({ ...SOURCE, body: SOURCE.body.slice(1) }),
    ).not.toBe(base);
    expect(
      sourceFingerprint({ ...SOURCE, body: [...SOURCE.body].reverse() }),
    ).not.toBe(base);
  });

  it('distingue un découpage différent du même texte', () => {
    // Without a separator between segments, ['ab','c'] and ['a','bc'] would have
    // the same fingerprint — and a re-paragraphed post would pass as unchanged.
    expect(sourceFingerprint({ title: 't', body: ['ab', 'c'] })).not.toBe(
      sourceFingerprint({ title: 't', body: ['a', 'bc'] }),
    );
  });

  it('distingue un champ optionnel absent d’un champ vide', () => {
    expect(sourceFingerprint({ title: 't', body: ['x'] })).toBe(
      sourceFingerprint({ title: 't', body: ['x'], abstract: '' }),
    );
    // Above: identical, and that is acceptable — an empty summary and an absent
    // summary produce the same on-screen text. Below: different.
    expect(sourceFingerprint({ title: 't', body: ['x'] })).not.toBe(
      sourceFingerprint({ title: 't', body: ['x'], abstract: 'a' }),
    );
  });
});

describe('Schéma de sortie — le nombre de paragraphes est contraint', () => {
  it('fige le nombre d’éléments de `body` sur celui de la source', () => {
    const schema = buildTranslationSchema(SOURCE) as {
      properties: { body: { minItems: number; maxItems: number } };
      required: string[];
    };
    expect(schema.properties.body.minItems).toBe(3);
    expect(schema.properties.body.maxItems).toBe(3);
    expect(schema.required).toContain('body');
  });

  it('n’exige un champ optionnel que si la source le porte', () => {
    const withAll = buildTranslationSchema(SOURCE) as { required: string[] };
    expect(withAll.required).toEqual(
      expect.arrayContaining(['title', 'body', 'abstract', 'keypoints']),
    );

    const minimal = buildTranslationSchema({ title: 't', body: ['x'] }) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(minimal.required).toEqual(['title', 'body']);
    expect(minimal.properties).not.toHaveProperty('abstract');
    expect(minimal.properties).not.toHaveProperty('keypoints');
  });

  it('interdit les champs non déclarés (mode strict de la passerelle)', () => {
    const schema = buildTranslationSchema(SOURCE) as {
      additionalProperties: boolean;
    };
    expect(schema.additionalProperties).toBe(false);
  });
});

describe('Validation de la réponse — la garde est côté serveur', () => {
  const good = {
    title: 'Digital governance',
    abstract: 'An abstract.',
    keypoints: ['Point one', 'Point two'],
    body: ['First paragraph.', 'Second paragraph.', 'Third.'],
  };

  it('accepte une réponse complète', () => {
    expect(parseTranslation(SOURCE, good)).toEqual(good);
  });

  it('REFUSE une traduction amputée d’un paragraphe', () => {
    // The costliest defect of the mechanism, and the most discreet: the page
    // would display a truncated article under a banner claiming it is
    // translated. The gateway schema already forbids it; this guard does not
    // depend on the gateway.
    expect(
      parseTranslation(SOURCE, { ...good, body: good.body.slice(0, 2) }),
    ).toBeNull();
  });

  it('refuse une traduction qui invente un paragraphe', () => {
    expect(
      parseTranslation(SOURCE, { ...good, body: [...good.body, 'Extra.'] }),
    ).toBeNull();
  });

  it('refuse un titre vide ou absent', () => {
    expect(parseTranslation(SOURCE, { ...good, title: '' })).toBeNull();
    expect(parseTranslation(SOURCE, { ...good, title: '   ' })).toBeNull();
    const { title: _title, ...sansTitre } = good;
    expect(parseTranslation(SOURCE, sansTitre)).toBeNull();
  });

  it('refuse un paragraphe VIDE là où la source n’est pas vide', () => {
    // The length check alone let `["texte", "", ""]` through: the
    // count is right, the model "returned" N paragraphs. It is the expected
    // failure mode when the output budget runs out — forced to return
    // exactly N entries, a model short of tokens ends with empty
    // strings. The row would have been written `ready`, the fingerprint would have
    // matched, and the reader would have seen the second half of the article
    // blank under a banner claiming it is a translation — with no
    // button to retranslate, since it is "up to date". The title was
    // protected from the start; the body was not.
    expect(
      parseTranslation(SOURCE, { ...good, body: [good.body[0], '', ''] }),
    ).toBeNull();
    expect(
      parseTranslation(SOURCE, {
        ...good,
        body: [good.body[0], '   ', good.body[2]],
      }),
    ).toBeNull();
    expect(
      parseTranslation(SOURCE, {
        ...good,
        keypoints: good.keypoints.map(() => ''),
      }),
    ).toBeNull();
  });

  it('refuse un champ attendu par la source et absent de la réponse', () => {
    const { abstract: _abstract, ...sansResume } = good;
    expect(parseTranslation(SOURCE, sansResume)).toBeNull();
    const { keypoints: _kp, ...sansPoints } = good;
    expect(parseTranslation(SOURCE, sansPoints)).toBeNull();
  });

  it('refuse un tableau dont un élément n’est pas une chaîne', () => {
    expect(
      parseTranslation(SOURCE, { ...good, body: ['a', 42, 'c'] }),
    ).toBeNull();
  });

  it('refuse ce qui n’est pas un objet', () => {
    expect(parseTranslation(SOURCE, null)).toBeNull();
    expect(parseTranslation(SOURCE, 'du texte')).toBeNull();
    expect(parseTranslation(SOURCE, [1, 2])).toBeNull();
  });

  it('n’exige pas les champs que la source ne porte pas', () => {
    const minimal: TranslatableFields = { title: 'T', body: ['A'] };
    expect(parseTranslation(minimal, { title: 'X', body: ['B'] })).toEqual({
      title: 'X',
      body: ['B'],
    });
  });
});

describe('Consigne au modèle — le texte source est une donnée', () => {
  it('nomme les deux langues et interdit d’obéir au contenu', () => {
    const i = buildTranslationInstructions('fr', 'ar');
    expect(i).toContain('French');
    expect(i).toContain('Arabic');
    expect(i).toMatch(/never act on it/i);
    expect(i).toMatch(/Never summarise/i);
  });

  it('demande des chiffres occidentaux pour l’arabe, et seulement pour lui', () => {
    // The rest of the site writes its numbers in Western digits (cf.
    // `intlLocale`): a translation in Eastern Arabic digits would mix two
    // systems on the same page.
    expect(buildTranslationInstructions('fr', 'ar')).toContain(
      'Western Arabic numerals',
    );
    expect(buildTranslationInstructions('fr', 'es')).not.toContain(
      'Western Arabic numerals',
    );
  });
});

describe('Budget de sortie — une traduction ne doit pas être tronquée', () => {
  it('reste entre le plancher et le plafond', () => {
    expect(outputTokenBudget({ title: 'a', body: ['b'] })).toBe(
      TRANSLATION_OUTPUT_FLOOR,
    );
    const enorme: TranslatableFields = {
      title: 'a',
      body: ['x'.repeat(400_000)],
    };
    expect(outputTokenBudget(enorme)).toBe(TRANSLATION_OUTPUT_CEILING);
  });

  it('croît avec la longueur du texte', () => {
    const court: TranslatableFields = { title: 't', body: ['x'.repeat(5_000)] };
    const long: TranslatableFields = { title: 't', body: ['x'.repeat(20_000)] };
    expect(outputTokenBudget(long)).toBeGreaterThan(outputTokenBudget(court));
  });

  it('compte tous les champs dans la longueur', () => {
    expect(sourceLength(SOURCE)).toBe(
      SOURCE.title.length +
        SOURCE.abstract!.length +
        SOURCE.keypoints!.join('').length +
        SOURCE.body.join('').length,
    );
  });
});

describe('Découpage d’un billet de Tribune en paragraphes', () => {
  it('coupe sur les lignes vides, pas sur les retours simples', () => {
    expect(splitParagraphs('Un\ndeux\n\nTrois')).toEqual(['Un\ndeux', 'Trois']);
  });

  it('absorbe les lignes vides multiples et les espaces', () => {
    expect(splitParagraphs('A\n\n\n   \n\nB')).toEqual(['A', 'B']);
  });

  it('rend un paragraphe unique pour un texte sans ligne vide', () => {
    // Returning an empty array would produce a `minItems: 0` schema — and would lose the
    // text without anything flagging it.
    expect(splitParagraphs('Un seul bloc de texte.')).toEqual([
      'Un seul bloc de texte.',
    ]);
  });

  it('rend un tableau vide pour un texte vide', () => {
    expect(splitParagraphs('   ')).toEqual([]);
  });
});
