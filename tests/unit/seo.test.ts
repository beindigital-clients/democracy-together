import { describe, it, expect } from 'vitest';
import {
  SITE_NAME,
  SITE_URL,
  openGraphLocale,
  alternateOpenGraphLocales,
  organizationJsonLd,
} from '@/lib/seo';
import { routing } from '@/i18n/routing';

// F-03 — métadonnées de partage et données structurées.
//
// Mesuré avant correctif : zéro balise Open Graph, zéro Twitter Card, zéro
// JSON-LD sur les 48 pages publiques. Ce module porte ce que les pages n'ont
// pas à réécrire ; ce fichier tient ce qu'il promet.

describe('Étiquettes de langue Open Graph', () => {
  it('rend une étiquette TERRITORIALISÉE, pas un code court', () => {
    // `fr` n'est pas une valeur Open Graph valide : la spécification attend
    // langue_TERRITOIRE. Servir `fr` revient à ne rien servir.
    expect(openGraphLocale('fr')).toBe('fr_FR');
    expect(openGraphLocale('en')).toBe('en_US');
  });

  it('rend `undefined` pour une locale inconnue plutôt qu’une valeur inventée', () => {
    // On ne devine pas le territoire : `pt` pourrait être pt_PT ou pt_BR.
    expect(openGraphLocale('pt')).toBeUndefined();
    expect(openGraphLocale('')).toBeUndefined();
  });

  it('couvre TOUTES les locales servies par le site', () => {
    // Garde d'évolution : ajouter une locale à `routing` sans l'ajouter ici
    // la priverait silencieusement d'og:locale. Le test le dit.
    for (const l of routing.locales) {
      expect(
        openGraphLocale(l),
        `og:locale manquant pour « ${l} »`,
      ).toBeTruthy();
    }
  });
});

describe('Locales alternées', () => {
  it('annonce les AUTRES langues, jamais la sienne', () => {
    expect(alternateOpenGraphLocales('fr')).toEqual(['en_US']);
    expect(alternateOpenGraphLocales('en')).toEqual(['fr_FR']);
  });

  it('n’en compte jamais plus que le site n’a de langues', () => {
    expect(alternateOpenGraphLocales('fr')).toHaveLength(
      routing.locales.length - 1,
    );
  });

  it('écarte silencieusement une locale sans étiquette connue', () => {
    // Une locale inconnue ne doit pas produire un `undefined` dans le tableau,
    // ce qui donnerait `<meta property="og:locale:alternate" content="">`.
    for (const v of alternateOpenGraphLocales('fr')) {
      expect(typeof v).toBe('string');
      expect(v).not.toBe('');
    }
  });
});

describe('Données structurées — fiche Organization', () => {
  const fiche = organizationJsonLd('Une description du réseau.');

  it('porte le contexte et le type attendus par schema.org', () => {
    expect(fiche['@context']).toBe('https://schema.org');
    expect(fiche['@type']).toBe('Organization');
  });

  it('reprend le nom propre et l’URL du site', () => {
    expect(fiche.name).toBe(SITE_NAME);
    expect(fiche.url).toBe(SITE_URL);
  });

  it('reprend la description qu’on lui passe — donc traduite par l’appelant', () => {
    expect(fiche.description).toBe('Une description du réseau.');
    expect(organizationJsonLd('Another one.').description).toBe('Another one.');
  });

  it('pointe un logo en URL ABSOLUE', () => {
    // Un chemin relatif dans du JSON-LD n'est résolu par aucun moteur.
    expect(fiche.logo.startsWith('http')).toBe(true);
    expect(fiche.logo).toContain('/brand/');
  });

  it('ne déclare RIEN de plus que ce que le dépôt possède', () => {
    // Une adresse postale ou un profil social inventés seraient une donnée
    // fausse servie aux moteurs — pire que leur absence. La liste des clés
    // est donc close, et ce test est ce qui la tient fermée.
    expect(Object.keys(fiche).sort()).toEqual([
      '@context',
      '@type',
      'description',
      'logo',
      'name',
      'url',
    ]);
  });

  it('est sérialisable tel quel — c’est ainsi qu’il est posé dans le HTML', () => {
    expect(() => JSON.stringify(fiche)).not.toThrow();
    expect(JSON.parse(JSON.stringify(fiche))).toEqual(fiche);
  });
});
