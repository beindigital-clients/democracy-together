import { describe, it, expect } from 'vitest';
import { aboutFallback, initials } from '@/lib/about-content';

describe('À propos — contenu (F-11 / F-12)', () => {
  it('fournit FR et EN, fondateurs et axes complets', () => {
    const fr = aboutFallback('fr');
    const en = aboutFallback('en');
    expect(fr.hero.eyebrow).toBe('À propos');
    expect(en.hero.eyebrow).toBe('About');
    expect(fr.founders.people).toHaveLength(6);
    expect(fr.founders.people.map((p) => p.name)).toContain('Philippe Kourilsky');
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
      const blob = JSON.stringify(aboutFallback(loc)).toLowerCase();
      expect(blob).not.toContain('démocratie libérale');
      expect(blob).not.toContain('liberal democracy');
      expect(blob).not.toContain('rmdl');
    }
  });

  it('calcule des initiales à deux lettres', () => {
    expect(initials('Philippe Kourilsky')).toBe('PK');
    expect(initials('Abdou Samb')).toBe('AS');
  });
});
