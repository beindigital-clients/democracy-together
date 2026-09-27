import { describe, it, expect } from 'vitest';
import {
  canTransition,
  MANUSCRIPT_EVENTS,
  MANUSCRIPT_MACHINE,
  MANUSCRIPT_STAGES,
  metadataDiff,
  nextStage,
  normalizeKeywords,
  resolveDueAt,
  stageAfterAssignment,
  type StageOrNone,
} from './manuscripts';

// Machine à états du manuscrit (F-43) : la table de transitions est la SEULE
// source de vérité. Ce fichier parcourt toutes les paires (étape, événement)
// — une transition absente de la table doit être refusée, avec la bonne
// erreur, et une transition présente doit mener à l'étape annoncée.

const ALL: StageOrNone[] = ['none', ...MANUSCRIPT_STAGES];

// Les transitions ATTENDUES, écrites ici à la main à partir du cahier des
// charges (soumis → en évaluation → révision demandée → re-soumis → accepté /
// rejeté) : si la table du module dérive, ce test le dit.
const EXPECTED: Record<string, string> = {
  'none/submit': 'submitted',
  'submitted/startReview': 'in_review',
  'submitted/reject': 'rejected',
  'in_review/requestRevision': 'revision',
  'in_review/accept': 'accepted',
  'in_review/reject': 'rejected',
  'revision/resubmit': 'resubmitted',
  'resubmitted/startReview': 'in_review',
  'resubmitted/accept': 'accepted',
  'resubmitted/reject': 'rejected',
  'reviewed/startReview': 'in_review',
  'reviewed/accept': 'accepted',
  'reviewed/reject': 'rejected',
};

describe('Machine à états du manuscrit (F-43)', () => {
  it('la table du module est exactement celle du cahier des charges', () => {
    const actual: Record<string, string> = {};
    for (const from of ALL) {
      for (const [event, to] of Object.entries(MANUSCRIPT_MACHINE[from])) {
        actual[`${from}/${event}`] = to;
      }
    }
    expect(actual).toEqual(EXPECTED);
  });

  it.each(
    ALL.flatMap((from) =>
      MANUSCRIPT_EVENTS.map((event) => [from, event] as const),
    ),
  )('%s --%s-->', (from, event) => {
    const key = `${from}/${event}`;
    if (key in EXPECTED) {
      expect(nextStage(from, event)).toBe(EXPECTED[key]);
      expect(canTransition(from, event)).toBe(true);
    } else {
      // Une décision rendue ne se rejoue ni ne s'inverse : erreur propre.
      const code =
        from === 'accepted' || from === 'rejected'
          ? 'ALREADY_REVIEWED'
          : 'INVALID_TRANSITION';
      expect(() => nextStage(from, event)).toThrow(code);
      expect(canTransition(from, event)).toBe(false);
    }
  });

  it('accepté et rejeté sont des culs-de-sac', () => {
    for (const event of MANUSCRIPT_EVENTS) {
      expect(canTransition('accepted', event)).toBe(false);
      expect(canTransition('rejected', event)).toBe(false);
    }
  });

  it('désigner un relecteur : ouverture, nouveau tour ou ajout — refus ailleurs', () => {
    expect(stageAfterAssignment('none')).toBe('in_review');
    expect(stageAfterAssignment('submitted')).toBe('in_review');
    expect(stageAfterAssignment('resubmitted')).toBe('in_review');
    expect(stageAfterAssignment('in_review')).toBe('in_review');
    expect(stageAfterAssignment('reviewed')).toBe('in_review');
    expect(() => stageAfterAssignment('revision')).toThrow(
      'INVALID_TRANSITION',
    );
    expect(() => stageAfterAssignment('accepted')).toThrow('ALREADY_REVIEWED');
    expect(() => stageAfterAssignment('rejected')).toThrow('ALREADY_REVIEWED');
  });
});

describe('Versions : différentiel de métadonnées', () => {
  it('rend ce qui change, et rien d’autre', () => {
    const diff = metadataDiff(
      {
        title: 'Titre v1',
        abstract: 'Résumé',
        keywords: ['Gouvernance', 'Afrique'],
        hasFile: true,
      },
      {
        title: 'Titre v2',
        abstract: 'Résumé',
        keywords: ['gouvernance', 'Europe'],
        hasFile: true,
      },
    );
    expect(diff.title).toEqual({ from: 'Titre v1', to: 'Titre v2' });
    expect(diff.abstract).toBeNull();
    // La casse ne fait pas un nouveau mot-clé.
    expect(diff.keywordsAdded).toEqual(['Europe']);
    expect(diff.keywordsRemoved).toEqual(['Afrique']);
    expect(diff.fileReplaced).toBe(true);
  });

  it('mots-clés : sans doublon, huit au plus, soixante caractères', () => {
    const kw = normalizeKeywords([
      ' a ',
      'A',
      '',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'x'.repeat(80),
    ]);
    expect(kw).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(normalizeKeywords(['x'.repeat(80)])[0]).toHaveLength(60);
  });
});

describe('Échéance de relecture', () => {
  const now = Date.UTC(2026, 8, 27);
  const DAY = 86_400_000;
  it('trois semaines par défaut ; bornée entre un jour et quatre mois', () => {
    expect(resolveDueAt(now, undefined)).toBe(now + 21 * DAY);
    expect(resolveDueAt(now, now + 7 * DAY)).toBe(now + 7 * DAY);
    expect(() => resolveDueAt(now, now - DAY)).toThrow('INVALID_DUE_DATE');
    expect(() => resolveDueAt(now, now + 200 * DAY)).toThrow(
      'INVALID_DUE_DATE',
    );
  });
});
