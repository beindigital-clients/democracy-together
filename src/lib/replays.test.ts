import { describe, it, expect } from 'vitest';
import {
  getReplays,
  parseReplayFilters,
  filterReplays,
  replayFacets,
  replaysHref,
  hasReplayFilters,
} from './replays';
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

describe('Replays — filtres type / thématique / langue (communauté A-12)', () => {
  const replays = getReplays('fr');

  it('parseReplayFilters ne garde que des valeurs portées par les replays', () => {
    const f = parseReplayFilters(
      { type: 'webinaire', theme: 'zzz', lang: ['FR'] },
      replays,
    );
    expect(f).toEqual({ type: 'webinaire', theme: undefined, lang: 'fr' });
    expect(parseReplayFilters({}, replays)).toEqual({
      type: undefined,
      theme: undefined,
      lang: undefined,
    });
    expect(hasReplayFilters(f)).toBe(true);
    expect(hasReplayFilters({})).toBe(false);
  });

  it('filterReplays combine les filtres en ET, sans jamais inventer de résultat', () => {
    const webinaires = filterReplays(replays, { type: 'webinaire' });
    expect(webinaires.length).toBeGreaterThan(0);
    expect(webinaires.every((r) => r.typeKey === 'webinaire')).toBe(true);
    const en = filterReplays(replays, { type: 'webinaire', lang: 'en' });
    expect(
      en.every((r) => r.typeKey === 'webinaire' && r.langs.includes('en')),
    ).toBe(true);
    expect(en.length).toBeLessThanOrEqual(webinaires.length);
    expect(filterReplays(replays, {})).toEqual(replays);
  });

  it('replayFacets compte chaque valeur présente, avec un libellé localisé', () => {
    for (const loc of ['fr', 'en'] as const) {
      const facets = replayFacets(getReplays(loc), loc);
      const total = facets.types.reduce((n, f) => n + f.count, 0);
      expect(total).toBe(replays.length);
      for (const group of [facets.types, facets.themes, facets.langs]) {
        for (const f of group) {
          expect(f.count).toBeGreaterThan(0);
          expect(f.label.length).toBeGreaterThan(0);
          // Chaque facette proposée donne au moins un résultat.
        }
      }
      for (const f of facets.themes) {
        expect(filterReplays(replays, { theme: f.value }).length).toBe(f.count);
      }
    }
  });

  it('replaysHref conserve les autres filtres et retire ceux mis à undefined', () => {
    const f = { type: 'webinaire', lang: 'fr' };
    expect(replaysHref(f, { theme: 'participation' })).toBe(
      '/replays?type=webinaire&theme=participation&lang=fr',
    );
    expect(replaysHref(f, { type: undefined })).toBe('/replays?lang=fr');
    expect(replaysHref({}, {})).toBe('/replays');
  });
});
