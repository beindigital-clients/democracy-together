import { describe, it, expect } from 'vitest';
import {
  resolveArticleDisplay,
  translationErrorSuffix,
  type CachedTranslation,
} from '@/lib/article-translation';

// The decision "what do we show the reader?" has five outcomes and one rule
// governing them: the original never disappears. This file holds that rule
// on each of the five, including the two that do not show up while browsing
// (stale translation, failed translation) — precisely the ones a
// manual test does not produce.

const FIELDS = {
  title: 'Título traducido',
  body: ['Primer párrafo.', 'Segundo párrafo.'],
};

function cached(over: Partial<NonNullable<CachedTranslation>> = {}) {
  return {
    status: 'ready' as const,
    sourceLocale: 'fr' as const,
    targetLocale: 'es' as const,
    fields: FIELDS,
    fresh: true,
    ...over,
  };
}

describe('Affichage d’un article — la langue du lecteur est celle du texte', () => {
  it('ne signale rien, même si une traduction traîne en cache', () => {
    // The banner only makes sense to tell readers they are reading something other than
    // the original. On a French article read in French, it is noise.
    expect(resolveArticleDisplay('fr', 'fr', null, false)).toEqual({
      kind: 'native',
    });
    expect(resolveArticleDisplay('fr', 'fr', cached(), false)).toEqual({
      kind: 'native',
    });
  });
});

describe('Affichage d’un article — aucune traduction en cache', () => {
  it('sert l’original et n’en propose pas une qui n’existe pas', () => {
    const d = resolveArticleDisplay('fr', 'es', null, false);
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: false,
      errorCode: undefined,
    });
  });
});

describe('Affichage d’un article — traduction disponible', () => {
  it('sert la traduction, et porte la langue source pour le bandeau', () => {
    const d = resolveArticleDisplay('fr', 'es', cached(), false);
    expect(d).toEqual({
      kind: 'translated',
      sourceLocale: 'fr',
      fields: FIELDS,
    });
  });

  it('le lecteur qui demande l’original l’obtient, traduction ou pas', () => {
    // That is the whole point of the "lire l'original" link: it must win over the
    // availability of a translation, otherwise it leads nowhere.
    const d = resolveArticleDisplay('fr', 'es', cached(), true);
    expect(d).toMatchObject({ kind: 'original', translationAvailable: true });
  });

  it('depuis l’original, le retour vers la traduction reste proposé', () => {
    const d = resolveArticleDisplay('fr', 'es', cached(), true);
    expect(d).toMatchObject({ translationAvailable: true, stale: false });
  });
});

describe('Affichage d’un article — traduction inutilisable', () => {
  it('périmée : l’original prime et la mise à jour est proposée', () => {
    // `fresh: false` means the author has edited their text since. Serving
    // the translation would mean displaying a version that no longer exists, without
    // anything saying so.
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ fresh: false }),
      false,
    );
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: true,
      errorCode: undefined,
    });
  });

  it('en échec : l’original, et la raison', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'failed', fields: undefined, error: 'RATE_LIMITED' }),
      false,
    );
    expect(d).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      translationAvailable: false,
      stale: false,
      errorCode: 'RATE_LIMITED',
    });
  });

  it('en attente : traitée comme absente, jamais comme prête', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'pending', fields: undefined }),
      false,
    );
    expect(d).toMatchObject({ kind: 'original', translationAvailable: false });
  });

  it('« prête » sans contenu ne s’affiche pas comme traduite', () => {
    // Degenerate case that no write produces today, but that the type
    // allows: `fields` is optional. Serving `kind: 'translated'` here
    // would render an empty article under a banner claiming it is translated.
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ fields: undefined }),
      false,
    );
    expect(d).toMatchObject({ kind: 'original' });
  });

  it('un échec n’est pas rappelé à qui a demandé l’original', () => {
    const d = resolveArticleDisplay(
      'fr',
      'es',
      cached({ status: 'failed', fields: undefined, error: 'RATE_LIMITED' }),
      true,
    );
    expect(d).toMatchObject({ kind: 'original', errorCode: undefined });
  });
});

describe('Codes d’échec — un libellé pour chacun, un repli pour le reste', () => {
  it('traduit les codes connus', () => {
    expect(translationErrorSuffix('RATE_LIMITED')).toBe('RateLimited');
    expect(translationErrorSuffix('AI_GATEWAY_NOT_CONFIGURED')).toBe(
      'NotConfigured',
    );
    expect(translationErrorSuffix('TOO_LONG')).toBe('TooLong');
    expect(translationErrorSuffix('FORBIDDEN')).toBe('Forbidden');
  });

  it('retombe sur le message générique pour un code inattendu', () => {
    // The gateway may invent a new code tomorrow: the page must say "service
    // indisponible", not display a technical identifier or throw.
    expect(translationErrorSuffix('QUELQUE_CHOSE_DE_NOUVEAU')).toBe('Generic');
    expect(translationErrorSuffix(undefined)).toBe('Generic');
    expect(translationErrorSuffix('')).toBe('Generic');
  });
});
