import { describe, it, expect } from 'vitest';
import { getAboutContent, initials } from '@/lib/about-content';
import { routing } from '@/i18n/routing';

describe('À propos — contenu (F-11 / F-12)', () => {
  it('fournit FR et EN, fondateurs et axes complets', () => {
    const fr = getAboutContent('fr');
    const en = getAboutContent('en');
    expect(fr.hero.eyebrow).toBe('À propos');
    expect(en.hero.eyebrow).toBe('About');
    expect(fr.founders.people).toHaveLength(6);
    expect(fr.founders.people.map((p) => p.name)).toContain(
      'Philippe Kourilsky',
    );
    expect(en.founders.people.map((p) => p.name)).toContain('Pierre Vimont');
    expect(fr.mission.axes).toHaveLength(4);
    expect(fr.governance.hubs.map((h) => h.city)).toEqual([
      'Paris',
      'Dakar',
      'Bruxelles',
    ]);
  });

  it('ne contient jamais le terme banni (FR & EN)', () => {
    for (const loc of ['fr', 'en'] as const) {
      const blob = JSON.stringify(getAboutContent(loc)).toLowerCase();
      expect(blob).not.toContain('démocratie libérale');
      expect(blob).not.toContain('liberal democracy');
      expect(blob).not.toContain('rmdl');
    }
  });

  it('présente chaque fondateur, dans chaque langue', () => {
    const attendu = getAboutContent('fr').founders.people.length;
    for (const loc of routing.locales) {
      const people = getAboutContent(loc).founders.people;
      expect(people, loc).toHaveLength(attendu);
      for (const p of people) {
        expect(p.bio, `${loc} · ${p.name}`).not.toMatch(
          /compléter|completed|completar|استكمال/i,
        );
      }
    }
  });

  it('calcule des initiales à deux lettres', () => {
    expect(initials('Philippe Kourilsky')).toBe('PK');
    expect(initials('Abdou Samb')).toBe('AS');
  });
});
