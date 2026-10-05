import { describe, it, expect } from 'vitest';
import {
  requestedLanguage,
  resolveArticleDisplay,
  translationErrorSuffix,
  type Reading,
  type ReadingVersionStatus,
} from '@/lib/article-translation';

// The decision "what do we show the reader?" since translations are made
// when content goes live: the reader picks a language, and the rule that
// governs every outcome is that the original never disappears. This file
// holds that rule on each outcome, including the ones that do not show up
// while browsing (translation still being prepared, translation failed) —
// precisely the ones a manual test does not produce.

const FIELDS = {
  title: 'Título traducido',
  body: ['Primer párrafo.', 'Segundo párrafo.'],
};

function reading(
  statuses: Partial<
    Record<'fr' | 'en' | 'es' | 'pt' | 'ar', ReadingVersionStatus>
  >,
  translated = false,
): Reading {
  return {
    sourceLocale: 'fr',
    versions: (['fr', 'en', 'es', 'pt', 'ar'] as const).map((locale) => ({
      locale,
      status: statuses[locale] ?? (locale === 'fr' ? 'original' : 'missing'),
    })),
    translation: translated ? { fields: FIELDS } : null,
  };
}

describe('Langue demandée', () => {
  it('suit `?lang=` quand il désigne une langue du site', () => {
    expect(requestedLanguage({ lang: 'pt' }, 'fr', 'fr')).toBe('pt');
    expect(requestedLanguage({ lang: ['ar', 'en'] }, 'fr', 'fr')).toBe('ar');
  });

  it('ignore une langue inconnue et retombe sur celle de la page', () => {
    expect(requestedLanguage({ lang: 'de' }, 'es', 'fr')).toBe('es');
  });

  it('honore les liens `?original=1` de la version précédente de la page', () => {
    expect(requestedLanguage({ original: '1' }, 'es', 'fr')).toBe('fr');
  });

  it('par défaut, lit dans la langue de la page', () => {
    expect(requestedLanguage({}, 'en', 'fr')).toBe('en');
  });
});

describe('Affichage — l’original sur les pages de sa propre langue', () => {
  it('ne signale rien, même si des traductions existent', () => {
    expect(
      resolveArticleDisplay('fr', 'fr', 'fr', reading({ es: 'ready' })),
    ).toEqual({ kind: 'native' });
  });
});

describe('Affichage — traduction prête', () => {
  it('sert la traduction, avec sa langue et la langue source', () => {
    expect(
      resolveArticleDisplay('fr', 'es', 'es', reading({ es: 'ready' }, true)),
    ).toEqual({
      kind: 'translated',
      sourceLocale: 'fr',
      locale: 'es',
      fields: FIELDS,
    });
  });

  it('sert la langue CHOISIE, pas celle de la page', () => {
    const d = resolveArticleDisplay(
      'fr',
      'en',
      'pt',
      reading({ pt: 'ready' }, true),
    );
    expect(d).toMatchObject({ kind: 'translated', locale: 'pt' });
  });
});

describe('Affichage — l’original, et pourquoi', () => {
  it('le lecteur a choisi l’original depuis une autre langue', () => {
    expect(
      resolveArticleDisplay('fr', 'es', 'fr', reading({ es: 'ready' })),
    ).toEqual({
      kind: 'original',
      sourceLocale: 'fr',
      requested: 'fr',
      reason: 'chosen',
    });
  });

  it('la traduction est en préparation', () => {
    expect(
      resolveArticleDisplay('fr', 'es', 'es', reading({ es: 'pending' })),
    ).toMatchObject({ kind: 'original', requested: 'es', reason: 'pending' });
  });

  it('la traduction n’a pas pu être produite', () => {
    expect(
      resolveArticleDisplay('fr', 'es', 'es', reading({ es: 'failed' })),
    ).toMatchObject({ kind: 'original', reason: 'failed' });
  });

  it('il n’y a pas de traduction (contenu antérieur, ou modifié depuis)', () => {
    expect(resolveArticleDisplay('fr', 'es', 'es', reading({}))).toMatchObject({
      kind: 'original',
      reason: 'missing',
    });
  });

  it('Convex injoignable : l’original, sans rien promettre', () => {
    // `fetchOrFallback` returns null: the original stays readable, and the
    // page claims nothing about a translation it could not check.
    expect(resolveArticleDisplay('fr', 'es', 'es', null)).toMatchObject({
      kind: 'original',
      reason: 'missing',
    });
  });

  it('un statut « prêt » sans texte ne vaut pas traduction', () => {
    // `getReading` only fills `translation` for an up-to-date text: a
    // version listed `ready` without it must not be served as translated.
    expect(
      resolveArticleDisplay('fr', 'es', 'es', reading({ es: 'ready' }, false)),
    ).toMatchObject({ kind: 'original' });
  });
});

describe('Libellé d’erreur de traduction', () => {
  it('associe les codes connus à leur suffixe de message', () => {
    expect(translationErrorSuffix('RATE_LIMITED')).toBe('RateLimited');
    expect(translationErrorSuffix('AI_GATEWAY_NOT_CONFIGURED')).toBe(
      'NotConfigured',
    );
    expect(translationErrorSuffix('TOO_LONG')).toBe('TooLong');
    expect(translationErrorSuffix('FORBIDDEN')).toBe('Forbidden');
  });

  it('retombe sur le message générique pour tout le reste', () => {
    // The gateway may return a new code tomorrow: the page must not depend on it.
    expect(translationErrorSuffix('QUELQUE_CHOSE_DE_NOUVEAU')).toBe('Generic');
    expect(translationErrorSuffix(undefined)).toBe('Generic');
    expect(translationErrorSuffix('')).toBe('Generic');
  });
});
