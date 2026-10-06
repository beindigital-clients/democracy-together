import { describe, it, expect } from 'vitest';
import {
  KOHOP_SEMANTIC_MAX,
  KOHOP_SEMANTIC_THRESHOLD,
  semanticCandidates,
  type SemanticHit,
} from './kohopSemantic';
import {
  CONFIRMATION_SCHEMA,
  confirmationInput,
  readConfirmation,
} from './kohopOriginalityAi';
import { KOHOP_AI_VERDICTS, KOHOP_MATCH_CLASSES } from './kohop';

const hit = (over: Partial<SemanticHit> = {}): SemanticHit => ({
  chunk: 'un paragraphe sur la participation citoyenne et les budgets',
  sourceKey: 'kohop:a',
  groupId: 'g1',
  sourcePassage: 'a paragraph about citizen participation and budgets',
  similarity: 0.9,
  ...over,
});

describe('Candidats sémantiques', () => {
  const opts = { ownGroupId: 'own', wordPassages: [] as string[] };

  it('écarte ce qui est sous le seuil', () => {
    expect(
      semanticCandidates(
        [hit({ similarity: KOHOP_SEMANTIC_THRESHOLD - 0.01 })],
        opts,
      ),
    ).toEqual([]);
    expect(
      semanticCandidates([hit({ similarity: KOHOP_SEMANTIC_THRESHOLD })], opts),
    ).toHaveLength(1);
  });

  it('exclut les versions de la même contribution', () => {
    expect(semanticCandidates([hit({ groupId: 'own' })], opts)).toEqual([]);
  });

  it('un paragraphe garde son meilleur voisin par source', () => {
    const out = semanticCandidates(
      [hit({ similarity: 0.82 }), hit({ similarity: 0.95 })],
      opts,
    );
    expect(out).toHaveLength(1);
    expect(out[0].similarity).toBe(0.95);
  });

  it('ne rapporte pas deux fois un paragraphe déjà couvert par une suite de mots', () => {
    const out = semanticCandidates([hit()], {
      ownGroupId: 'own',
      wordPassages: ['participation citoyenne et les budgets'],
    });
    expect(out).toEqual([]);
  });

  it('trie du plus proche au moins proche et plafonne', () => {
    const many = Array.from({ length: KOHOP_SEMANTIC_MAX + 10 }, (_, i) =>
      hit({
        chunk: `paragraphe numéro ${i}`,
        sourceKey: `kohop:${i}`,
        similarity: 0.81 + i * 0.001,
      }),
    );
    const out = semanticCandidates(many, opts);
    expect(out).toHaveLength(KOHOP_SEMANTIC_MAX);
    expect(out[0].similarity).toBeGreaterThan(out[1].similarity);
  });
});

describe('Confirmation par l’IA', () => {
  const item = {
    id: 1,
    passage: 'texte soumis',
    sourcePassage: 'existing text',
    quoted: false,
    sourceCited: false,
    sameAuthor: false,
    selfReuseDeclared: false,
  };

  it('le schéma énumère exactement les verdicts et les classes', () => {
    const p = CONFIRMATION_SCHEMA.properties.assessments.items.properties;
    expect(p.verdict.enum).toEqual([...KOHOP_AI_VERDICTS]);
    expect(p.classification.enum).toEqual([...KOHOP_MATCH_CLASSES]);
  });

  it('présente chaque paire comme une donnée délimitée', () => {
    const text = confirmationInput([item]);
    expect(text).toContain('### PAIR 1');
    expect(text).toContain('<submitted>texte soumis</submitted>');
    expect(text).toContain('<existing>existing text</existing>');
  });

  it('lit une réponse valide', () => {
    const out = readConfirmation(
      {
        assessments: [
          {
            id: 1,
            verdict: 'translation',
            classification: 'borrowing',
            rationale: '  Même texte traduit.  ',
          },
        ],
      },
      [1],
    );
    expect(out?.get(1)).toEqual({
      verdict: 'translation',
      classification: 'borrowing',
      rationale: 'Même texte traduit.',
    });
  });

  it('ignore ce qui n’a pas été demandé, les doublons et les entrées mal formées', () => {
    const out = readConfirmation(
      {
        assessments: [
          {
            id: 9,
            verdict: 'same_text',
            classification: 'borrowing',
            rationale: '',
          },
          {
            id: 1,
            verdict: 'nonsense',
            classification: 'borrowing',
            rationale: '',
          },
          {
            id: 1,
            verdict: 'topic_only',
            classification: 'common_phrase',
            rationale: 'ok',
          },
          {
            id: 1,
            verdict: 'same_text',
            classification: 'borrowing',
            rationale: 'dup',
          },
          'x',
        ],
      },
      [1],
    );
    expect([...(out?.keys() ?? [])]).toEqual([1]);
    expect(out?.get(1)?.verdict).toBe('topic_only');
  });

  it('refuse une réponse qui n’est pas l’objet attendu', () => {
    expect(readConfirmation(null, [1])).toBeNull();
    expect(readConfirmation({ assessments: 'x' }, [1])).toBeNull();
    expect(readConfirmation('x', [1])).toBeNull();
  });
});
