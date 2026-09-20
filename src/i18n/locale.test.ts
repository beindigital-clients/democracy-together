import { describe, it, expect } from 'vitest';
import { isSupportedLocale, resolveLocale } from '@/i18n/locale';
import { routing } from '@/i18n/routing';

// La normalisation d'une locale était réécrite dans vingt fichiers (issue #41).
// Elle n'existe plus qu'ici : ces tests sont donc le seul filet de tout le site
// sur ce comportement — segment d'URL inconnu, absent, ou casse inattendue.

describe('resolveLocale — segment d’URL vers locale du site', () => {
  it('laisse passer les langues servies', () => {
    for (const locale of routing.locales) {
      expect(resolveLocale(locale)).toBe(locale);
    }
  });

  it('ramène une langue inconnue à la langue par défaut', () => {
    expect(resolveLocale('de')).toBe(routing.defaultLocale);
    expect(resolveLocale('')).toBe(routing.defaultLocale);
    expect(resolveLocale('fr-CA')).toBe(routing.defaultLocale);
  });

  it('ramène une locale absente à la langue par défaut', () => {
    expect(resolveLocale(undefined)).toBe(routing.defaultLocale);
    expect(resolveLocale(null)).toBe(routing.defaultLocale);
  });

  it('le vocabulaire est fermé : la casse n’est pas une langue servie', () => {
    expect(resolveLocale('EN')).toBe(routing.defaultLocale);
  });
});

describe('isSupportedLocale — refuser plutôt que replier', () => {
  it('distingue les langues servies des autres', () => {
    expect(isSupportedLocale('fr')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('de')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});
