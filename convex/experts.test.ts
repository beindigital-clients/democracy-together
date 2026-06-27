// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Publication minimale valable (cf. convex/notifications.test.ts) — surchargée
// par test. Par défaut « published » : F-23 ne dérive l'annuaire QUE des
// publications publiées.
function pubDoc(over: Record<string, unknown> = {}) {
  return {
    title: 'Titre',
    slug: 's',
    type: 'rapport' as const,
    theme: 'transitions',
    region: 'mondial' as const,
    languages: ['fr' as const],
    access: 'open' as const,
    authors: [{ name: 'A. Auteur' }],
    year: 2025,
    publishedAt: 0,
    abstract: 'Résumé.',
    keypoints: [] as string[],
    body: [] as string[],
    doi: '10.59000/dt.x',
    downloads: 0,
    citations: 0,
    status: 'published' as const,
    createdAt: 0,
    ...over,
  };
}

describe('Annuaire d\'experts (F-23)', () => {
  it('agrège les auteurs des publications publiées (count, thèmes distincts, exclusion du non-publié)', async () => {
    const t = convexTest(schema, modules);

    // 3 publications PUBLIÉES, dont 2 partageant un auteur (« A. Auteur »).
    await t.run(async (ctx) => {
      // Pub1 : 2 auteurs, axe « transitions », 2024.
      await ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'p1',
          theme: 'transitions',
          year: 2024,
          authors: [{ name: 'A. Auteur' }, { name: 'B. Coauteur' }],
        }),
      );
      // Pub2 : « A. Auteur » à nouveau, autre axe « crises », 2025.
      await ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'p2',
          theme: 'crises',
          year: 2025,
          authors: [{ name: 'A. Auteur' }],
        }),
      );
      // Pub3 : auteur distinct « C. Solo », axe « participation », 2023.
      await ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'p3',
          theme: 'participation',
          year: 2023,
          authors: [{ name: 'C. Solo' }],
        }),
      );
      // Pub4 : NON publiée (pending) — doit être EXCLUE de l'agrégation, et
      // ne doit PAS gonfler le compte ni les axes de « A. Auteur ».
      await ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'p4',
          status: 'pending',
          theme: 'anti-corruption',
          year: 2026,
          authors: [{ name: 'A. Auteur' }],
        }),
      );
    });

    const experts = await t.query(api.experts.listExperts, {});

    // 3 experts distincts (le pending n'ajoute aucun expert).
    expect(experts).toHaveLength(3);
    expect(experts.map((e) => e.name)).toEqual([
      'A. Auteur',
      'B. Coauteur',
      'C. Solo',
    ]);

    // « A. Auteur » : 2 publications publiées (p1 + p2, PAS p4), 2 axes
    // distincts, année la plus récente 2025.
    const a = experts[0];
    expect(a.name).toBe('A. Auteur');
    expect(a.count).toBe(2);
    expect(a.themes).toEqual(['crises', 'transitions']); // distinct + trié
    expect(a.latestYear).toBe(2025);

    // L'axe du pending (« anti-corruption ») n'apparaît nulle part.
    expect(a.themes).not.toContain('anti-corruption');
    expect(experts.some((e) => e.themes.includes('anti-corruption'))).toBe(false);

    // Coauteur : 1 publication, axe « transitions », 2024.
    const b = experts[1];
    expect(b.name).toBe('B. Coauteur');
    expect(b.count).toBe(1);
    expect(b.themes).toEqual(['transitions']);
    expect(b.latestYear).toBe(2024);

    // C. Solo : 1 publication, axe « participation », 2023.
    expect(experts[2]).toMatchObject({
      name: 'C. Solo',
      count: 1,
      themes: ['participation'],
      latestYear: 2023,
    });
  });

  it('tri par nombre de publications décroissant puis nom croissant', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // « Zoe » signe 2 publications -> doit passer DEVANT « Alice » (1 pub),
      // malgré l'ordre alphabétique inverse.
      await ctx.db.insert(
        'publications',
        pubDoc({ slug: 'z1', authors: [{ name: 'Zoe' }] }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc({ slug: 'z2', authors: [{ name: 'Zoe' }] }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc({ slug: 'a1', authors: [{ name: 'Alice' }] }),
      );
      // « Bob » : 1 pub aussi -> à count égal, tri alpha (Alice avant Bob).
      await ctx.db.insert(
        'publications',
        pubDoc({ slug: 'b1', authors: [{ name: 'Bob' }] }),
      );
    });

    const experts = await t.query(api.experts.listExperts, {});
    expect(experts.map((e) => e.name)).toEqual(['Zoe', 'Alice', 'Bob']);
    expect(experts[0].count).toBe(2);
  });

  it('aucune publication publiée -> annuaire vide', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'only-pending', status: 'pending' })),
    );
    expect(await t.query(api.experts.listExperts, {})).toEqual([]);
  });
});
