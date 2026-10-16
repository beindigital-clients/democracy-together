import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { vocabulary, humanizeTerm } from '@/i18n/vocabulary';

// VOCABULARY is the only family of keys that deserves a fallback (issue #33):
// a theme or region slug coming from the database may fall outside the dictionary —
// `THEMES` lives in four files (issue #30) — and must not take down the
// page. Everything else is a hard-coded label, hence a bug when it's missing.
//
// The translator used here is the REAL one (next-intl's `createTranslator`), not
// a test double: what we check relies entirely on `t.has()`, which answers
// without throwing or logging. A home-made double would only prove that the
// double behaves the way we wrote it.

// Typed like the app's messages, loaded from JSON: from a literal, next-intl
// would accept only that literal's keys, where `vocabulary()` builds its keys
// at runtime.
const messages: AbstractIntlMessages = {
  library: {
    themes: { participation: 'Participation citoyenne' },
    empty: 'Aucune publication',
  },
  admin: { revStage_in_review: 'En revue' },
};

function t(namespace: 'library' | 'admin') {
  return createTranslator({ locale: 'fr', messages, namespace });
}

afterEach(() => vi.restoreAllMocks());

describe('vocabulary — repli explicite pour le vocabulaire dynamique', () => {
  it('rend le libellé traduit quand le terme est au dictionnaire', () => {
    expect(vocabulary(t('library'), 'themes.', 'participation')).toBe(
      'Participation citoyenne',
    );
  });

  it('rend un repli lisible quand le terme en sort', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(vocabulary(t('library'), 'themes.', 'gouvernance-numerique')).toBe(
      'Gouvernance numerique',
    );
  });

  it('accepte un repli explicite', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(vocabulary(t('library'), 'themes.', 'inconnu', 'Autre')).toBe(
      'Autre',
    );
  });

  it('gère un séparateur autre que le point', () => {
    // `revStage_in_review`: the term itself contains an underscore, hence the
    // prefix passed in full rather than splitting after the fact.
    expect(vocabulary(t('admin'), 'revStage_', 'in_review')).toBe('En revue');
  });

  it('n’escalade RIEN : ni erreur levée, ni onError, ni getMessageFallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      vocabulary(t('library'), 'themes.', 'slug-jamais-vu'),
    ).not.toThrow();

    // This is THE property that makes it possible to make `getMessageFallback` strict:
    // a missing vocabulary key never goes down the error path.
    expect(error).not.toHaveBeenCalled();
    // In development it still leaves a trace — vocabulary that
    // has diverged is visible, without being treated as an interface bug.
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ne se déclenche pas sur une clé présente', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vocabulary(t('library'), 'themes.', 'participation');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('humanizeTerm — le repli par défaut', () => {
  it('remplace les séparateurs et capitalise', () => {
    expect(humanizeTerm('gouvernance-numerique')).toBe('Gouvernance numerique');
    expect(humanizeTerm('in_review')).toBe('In review');
    expect(humanizeTerm('europe')).toBe('Europe');
  });

  it('laisse passer un terme vide sans inventer de libellé', () => {
    expect(humanizeTerm('')).toBe('');
  });
});
