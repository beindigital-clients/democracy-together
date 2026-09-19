import { describe, it, expect } from 'vitest';
import {
  getPressKit,
  PRESS_FACT_SLUGS,
  PRESS_RESOURCE_SLUGS,
} from './press-content';
import frMessages from '../messages/fr.json';
import enMessages from '../messages/en.json';

describe('Espace presse / kit média (F-16)', () => {
  it('expose un boilerplate, des faits clés et des ressources (FR + EN)', () => {
    for (const loc of ['fr', 'en'] as const) {
      const kit = getPressKit(loc);
      // Boilerplate : un paragraphe substantiel, présentant le réseau.
      expect(kit.boilerplate.length).toBeGreaterThan(120);
      expect(kit.boilerplate).toContain('Democracy Together');
      // Faits clés : mêmes slugs, même ordre que la constante.
      expect(kit.facts.map((f) => f.slug)).toEqual([...PRESS_FACT_SLUGS]);
      // Ressources : mêmes slugs, même ordre.
      expect(kit.resources.map((r) => r.slug)).toEqual([
        ...PRESS_RESOURCE_SLUGS,
      ]);
    }
  });

  it('chaque fait clé est complet (intitulé + valeur)', () => {
    for (const loc of ['fr', 'en'] as const) {
      for (const f of getPressKit(loc).facts) {
        expect(f.label.length).toBeGreaterThan(2);
        expect(f.value.length).toBeGreaterThan(30);
      }
    }
  });

  it('contient les faits établis attendus (statut loi 1901, 5 axes, Baromètre CC-BY)', () => {
    const fr = getPressKit('fr');
    const factsFr = new Map(fr.facts.map((f) => [f.slug, f.value]));
    expect(factsFr.get('statut')?.toLowerCase()).toContain('loi 1901');
    expect(factsFr.get('barometre')).toContain('CC-BY');
    // Les cinq axes établis sont nommés dans le fait « axes ».
    const axesFr = factsFr.get('axes') ?? '';
    for (const axe of [
      'numérique',
      'participation',
      'corruption',
      'transitions',
      'crises',
    ]) {
      expect(axesFr.toLowerCase()).toContain(axe);
    }

    const en = getPressKit('en');
    const factsEn = new Map(en.facts.map((f) => [f.slug, f.value]));
    expect(factsEn.get('barometre')).toContain('CC-BY');
    expect(factsEn.get('statut')?.toLowerCase()).toContain('loi 1901');
  });

  it('AUCUN chiffre de communication inventé dans les faits (pas de « X membres »)', () => {
    for (const loc of ['fr', 'en'] as const) {
      const text = getPressKit(loc)
        .facts.map((f) => f.value)
        .join('\n')
        .toLowerCase();
      // Pas de motif « <nombre> membres / members / pays / countries / partenaires ».
      expect(text).not.toMatch(
        /\d+\s*(membres?|members?|pays|countries|partenaires?|partners?|organisations?|organizations?)/,
      );
    }
  });

  it('les ressources pointent vers /a-propos et les données ouvertes du Baromètre', () => {
    for (const loc of ['fr', 'en'] as const) {
      const bySlug = new Map(
        getPressKit(loc).resources.map((r) => [r.slug, r]),
      );
      expect(bySlug.get('a-propos')?.href).toBe('/a-propos');
      expect(bySlug.get('a-propos')?.external).toBe(false);
      expect(bySlug.get('donnees')?.href).toBe(
        '/fr/barometre/data/composite.csv',
      );
      expect(bySlug.get('donnees')?.external).toBe(true);
      expect(bySlug.get('codebook')?.href).toBe(
        '/fr/barometre/data/codebook.txt',
      );
      expect(bySlug.get('codebook')?.external).toBe(true);
      for (const r of getPressKit(loc).resources) {
        expect(r.label.length).toBeGreaterThan(3);
        expect(r.description.length).toBeGreaterThan(20);
      }
    }
  });

  it('parité des clés i18n press FR/EN', () => {
    const fr = Object.keys(frMessages.press).sort();
    const en = Object.keys(enMessages.press).sort();
    expect(fr).toEqual(en);
    for (const k of [
      'metaTitle',
      'metaDescription',
      'eyebrow',
      'title',
      'lead',
      'boilerplateTitle',
      'factsTitle',
      'contactTitle',
      'contactBody',
      'contactPrimary',
      'resourcesTitle',
    ]) {
      expect(fr).toContain(k);
    }
  });

  it('lien pied de page presse présent et traduit (FR + EN)', () => {
    expect(frMessages.footer.col1e).toBeTruthy();
    expect(enMessages.footer.col1e).toBeTruthy();
    expect(Object.keys(frMessages.footer).sort()).toEqual(
      Object.keys(enMessages.footer).sort(),
    );
  });

  it('aucun terme banni dans le contenu (FR + EN), texte ET i18n', () => {
    const content = (['fr', 'en'] as const)
      .map((loc) => getPressKit(loc))
      .flatMap((kit) => [
        kit.boilerplate,
        ...kit.facts.flatMap((f) => [f.label, f.value]),
        ...kit.resources.flatMap((r) => [r.label, r.description]),
      ])
      .join('\n');
    const i18n = [
      JSON.stringify(frMessages.press),
      JSON.stringify(enMessages.press),
    ].join('\n');
    const haystack = `${content}\n${i18n}`.toLowerCase();
    expect(haystack).not.toContain('démocratie libérale');
    expect(haystack).not.toContain('democratie liberale');
    expect(haystack).not.toContain('liberal democracy');
  });
});
