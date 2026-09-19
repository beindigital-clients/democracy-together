import { describe, it, expect } from 'vitest';
import { getProjectsIntro } from './projects-content';

// F-60 — Présentation honnête du dispositif d'appels à projets collaboratifs.
function flatten(intro: ReturnType<typeof getProjectsIntro>): string[] {
  return [
    ...intro.principle,
    intro.scopeLead,
    ...intro.criteria.flatMap((c) => [c.title, c.body]),
    ...intro.support.flatMap((s) => [s.title, s.body]),
    intro.disclaimer,
  ];
}

describe('Appels à projets — contenu (F-60)', () => {
  it('a la même structure en FR et EN (parité)', () => {
    const fr = getProjectsIntro('fr');
    const en = getProjectsIntro('en');
    expect(fr.principle.length).toBe(en.principle.length);
    expect(fr.criteria.length).toBe(en.criteria.length);
    expect(fr.support.length).toBe(en.support.length);
    // contenu substantiel des deux côtés
    for (const intro of [fr, en]) {
      expect(intro.principle.length).toBeGreaterThanOrEqual(2);
      expect(intro.criteria.length).toBeGreaterThanOrEqual(3);
      expect(intro.support.length).toBeGreaterThanOrEqual(3);
      expect(intro.scopeLead.length).toBeGreaterThan(40);
      expect(intro.disclaimer.length).toBeGreaterThan(40);
      expect(intro.criteria.every((c) => c.body.length > 40)).toBe(true);
      expect(intro.support.every((s) => s.body.length > 40)).toBe(true);
    }
  });

  it("ne présente ni appel daté ni montant chiffré (dispositif honnête)", () => {
    // Aucun chiffre de financement (€, $, "euros") dans le contenu : on décrit le
    // cadre, on n'invente pas de bourse chiffrée.
    const text = (['fr', 'en'] as const)
      .flatMap((loc) => flatten(getProjectsIntro(loc)))
      .join('\n');
    expect(text).not.toMatch(/[€$]\s?\d/);
    expect(text.toLowerCase()).not.toMatch(/\d[\s\u202f]*(?:€|euros?|dollars?)/);
  });

  it('aucun terme banni dans le contenu (FR + EN)', () => {
    const text = (['fr', 'en'] as const)
      .flatMap((loc) => flatten(getProjectsIntro(loc)))
      .join('\n')
      .toLowerCase();
    expect(text).not.toContain('démocratie libérale');
    expect(text).not.toContain('liberal democracy');
  });
});
