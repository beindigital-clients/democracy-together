import { describe, it, expect, vi, afterEach } from 'vitest';
import { IntlError, IntlErrorCode } from 'next-intl';
import { getMessageFallback, onMessageError } from '@/i18n/message-errors';

// Une clé d'interface absente n'émettait AUCUNE erreur et affichait le dernier
// segment de son chemin : `t('library.detail.notFoundTitle')` manquante rendait
// « notFoundTitle » dans la page (issue #33). Ces tests tiennent les deux
// moitiés du correctif — le cri en développement, la trace en production.

const missing = (detail = 'library.detail.notFoundTitle') =>
  new IntlError(IntlErrorCode.MISSING_MESSAGE, detail);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getMessageFallback — développement', () => {
  it('rend un marqueur qu’on ne peut pas confondre avec du contenu', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      getMessageFallback({
        error: missing(),
        key: 'detail.notFoundTitle',
        namespace: 'library',
      }),
    ).toBe('⟦library.detail.notFoundTitle⟧');
  });

  it('journalise le chemin complet de la clé', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getMessageFallback({
      error: missing(),
      key: 'detail.notFoundTitle',
      namespace: 'library',
    });
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0][0])).toContain(
      'library.detail.notFoundTitle',
    );
  });

  it('fonctionne sans espace de noms', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(getMessageFallback({ error: missing(), key: 'orphelin' })).toBe(
      '⟦orphelin⟧',
    );
  });
});

describe('getMessageFallback — production', () => {
  it('garde le repli lisible : une page qui casse serait pire', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      getMessageFallback({
        error: missing(),
        key: 'detail.notFoundTitle',
        namespace: 'library',
      }),
    ).toBe('notFoundTitle');
  });

  it('journalise quand même — sinon personne ne le saura jamais', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getMessageFallback({
      error: missing(),
      key: 'detail.notFoundTitle',
      namespace: 'library',
    });
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0][0])).toContain(
      'library.detail.notFoundTitle',
    );
  });
});

describe('getMessageFallback — les autres erreurs', () => {
  it('rend le chemin complet et laisse onError les signaler', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = getMessageFallback({
      error: new IntlError(IntlErrorCode.INVALID_MESSAGE, 'ICU cassé'),
      key: 'detail.cite',
      namespace: 'library',
    });
    expect(out).toBe('library.detail.cite');
    // Pas de doublon : `onMessageError` a déjà l'erreur complète en main.
    expect(error).not.toHaveBeenCalled();
  });
});

describe('onMessageError', () => {
  it('laisse MISSING_MESSAGE à getMessageFallback, qui connaît la clé', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    onMessageError(missing());
    expect(error).not.toHaveBeenCalled();
  });

  it('signale toutes les autres erreurs, en développement comme en production', () => {
    for (const env of ['development', 'production']) {
      vi.stubEnv('NODE_ENV', env);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const boom = new IntlError(IntlErrorCode.FORMATTING_ERROR, 'boum');
      onMessageError(boom);
      expect(error).toHaveBeenCalledWith(boom);
      vi.restoreAllMocks();
    }
  });
});
