import { describe, it, expect } from 'vitest';
import { getPartners, getPartner, PARTNER_SLUGS } from './partners-content';
import frMessages from '../messages/fr.json';
import enMessages from '../messages/en.json';

describe('Partenaires & soutiens (F-14)', () => {
  it('expose au moins 4 catégories, mêmes slugs dans le même ordre (FR + EN)', () => {
    expect(PARTNER_SLUGS.length).toBeGreaterThanOrEqual(4);
    for (const loc of ['fr', 'en'] as const) {
      const all = getPartners(loc);
      expect(all).toHaveLength(PARTNER_SLUGS.length);
      expect(all.map((c) => c.slug)).toEqual([...PARTNER_SLUGS]);
    }
  });

  it('chaque catégorie est complète (intitulé, résumé, apport et contrepartie)', () => {
    for (const loc of ['fr', 'en'] as const) {
      for (const c of getPartners(loc)) {
        expect(c.kicker.length).toBeGreaterThan(2);
        expect(c.title.length).toBeGreaterThan(5);
        expect(c.summary.length).toBeGreaterThan(30);
        expect(c.gives.length).toBeGreaterThan(40);
        expect(c.gets.length).toBeGreaterThan(40);
      }
    }
  });

  it('résout un slug valide, renvoie null sinon', () => {
    expect(getPartner('fr', 'institutions')?.slug).toBe('institutions');
    expect(getPartner('en', 'medias')?.kicker).toBeTruthy();
    expect(getPartner('fr', 'inexistant')).toBeNull();
    expect(getPartner('fr', '')).toBeNull();
  });

  it('parité des clés i18n partners FR/EN', () => {
    const fr = Object.keys(frMessages.partners).sort();
    const en = Object.keys(enMessages.partners).sort();
    expect(fr).toEqual(en);
    // clés chrome attendues présentes
    for (const k of [
      'metaTitle',
      'metaDescription',
      'eyebrow',
      'title',
      'lead',
      'ctaTitle',
      'ctaBody',
      'ctaPrimary',
    ]) {
      expect(fr).toContain(k);
    }
  });

  it('lien pied de page partenaires présent et traduit (FR + EN)', () => {
    expect(frMessages.footer.col3d).toBeTruthy();
    expect(enMessages.footer.col3d).toBeTruthy();
    expect(Object.keys(frMessages.footer).sort()).toEqual(
      Object.keys(enMessages.footer).sort(),
    );
  });

  it('aucun terme banni dans le contenu (FR + EN), texte ET i18n', () => {
    const content = (['fr', 'en'] as const)
      .flatMap((loc) => getPartners(loc))
      .flatMap((c) => [c.kicker, c.title, c.summary, c.gives, c.gets])
      .join('\n');
    const i18n = [
      JSON.stringify(frMessages.partners),
      JSON.stringify(enMessages.partners),
    ].join('\n');
    const haystack = `${content}\n${i18n}`.toLowerCase();
    expect(haystack).not.toContain('démocratie libérale');
    expect(haystack).not.toContain('liberal democracy');
  });
});
