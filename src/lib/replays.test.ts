import { describe, it, expect } from 'vitest';
import { getReplays } from './replays';
import { EVENTS, whenOf } from './events-content';

describe('Replays de webinaires (F-54)', () => {
  it('ne renvoie QUE les événements passés (upcoming === false)', () => {
    const pastSlugs = new Set(
      EVENTS.filter((e) => e.upcoming === false).map((e) => e.slug),
    );
    for (const loc of ['fr', 'en'] as const) {
      const replays = getReplays(loc);
      expect(replays.length).toBe(pastSlugs.size);
      expect(replays.length).toBeGreaterThan(0);
      // Aucun événement à venir ne doit fuiter dans la liste.
      const upcomingSlugs = new Set(
        EVENTS.filter((e) => e.upcoming === true).map((e) => e.slug),
      );
      for (const r of replays) {
        expect(pastSlugs.has(r.slug)).toBe(true);
        expect(upcomingSlugs.has(r.slug)).toBe(false);
      }
    }
  });

  it('trie par date DÉCROISSANTE (le plus récent en premier)', () => {
    for (const loc of ['fr', 'en'] as const) {
      const replays = getReplays(loc);
      const whens = replays.map((r) => r.y * 10000 + r.mo * 100 + r.d);
      // Strictement décroissant (dates distinctes dans le jeu de données).
      expect(whens).toEqual([...whens].sort((a, b) => b - a));
      // Cohérent avec whenOf de la source.
      const byWhen = EVENTS.filter((e) => e.upcoming === false)
        .slice()
        .sort((a, b) => whenOf(b) - whenOf(a))
        .map((e) => e.slug);
      expect(replays.map((r) => r.slug)).toEqual(byWhen);
    }
  });

  it('expose une durée pour chaque replay', () => {
    for (const loc of ['fr', 'en'] as const) {
      for (const r of getReplays(loc)) {
        expect(typeof r.durationMin).toBe('number');
        expect(r.durationMin).toBeGreaterThan(0);
      }
    }
  });

  it('libellés localisés présents (titre + type)', () => {
    for (const loc of ['fr', 'en'] as const) {
      for (const r of getReplays(loc)) {
        expect(r.title.length).toBeGreaterThan(5);
        expect(r.type.length).toBeGreaterThan(0);
        expect(r.slug.length).toBeGreaterThan(0);
      }
    }
  });

  it('aucun terme banni dans le contenu (FR + EN)', () => {
    const all = (['fr', 'en'] as const)
      .flatMap((loc) => getReplays(loc))
      .flatMap((r) => [r.title, r.type])
      .join('\n')
      .toLowerCase();
    expect(all).not.toContain('démocratie libérale');
    expect(all).not.toContain('liberal democracy');
  });
});
