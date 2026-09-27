// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

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

describe('Recherche globale (F-06)', () => {
  it('trouve publications + membres, exclut non-publié/suspendu, ignore < 2 car', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'publications',
        pubDoc({ title: 'Gouvernance des plateformes', slug: 'gp' }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc({ title: 'Plateforme cachée', slug: 'pc', status: 'pending' }),
      );
      await ctx.db.insert('organizations', {
        name: 'Institut Plateforme',
        slug: 'ip',
        country: 'SN',
        region: 'afrique',
        languages: ['fr'],
        themes: [],
        status: 'active',
        createdAt: 0,
      });
      await ctx.db.insert('organizations', {
        name: 'Institut Plateforme Suspendu',
        slug: 'is',
        country: 'FR',
        region: 'europe',
        languages: ['fr'],
        themes: [],
        status: 'suspended',
        createdAt: 0,
      });
    });

    // Documents posés EN DIRECT (`t.run`) : aucune mutation n'a calculé leur
    // meule de recherche. La migration la remplit — exactement ce qu'elle
    // fait pour un déploiement antérieur aux index `search_text`.
    for (const table of ['publications', 'organizations'] as const) {
      await t.mutation(internal.searchIndexing.backfill, { table });
    }

    const res = await t.query(api.search.globalSearch, { q: 'Plateforme' });
    expect(res.publications.map((p) => p.slug)).toEqual(['gp']); // pending exclu
    expect(res.organizations.map((o) => o.slug)).toEqual(['ip']); // suspendu exclu

    // moins de 2 caractères -> rien
    const short = await t.query(api.search.globalSearch, { q: 'p' });
    expect(short.publications).toEqual([]);
    expect(short.organizations).toEqual([]);
  });
});

describe('Recherche globale — langue des résultats (audit RGAA, 8.7)', () => {
  it('chaque publication sort avec sa langue de rédaction (`languages[0]`)', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'publications',
        pubDoc({
          title: 'Plateformes et démocratie',
          slug: 'pd',
          languages: ['en', 'fr'],
        }),
      );
    });
    // Document posé en direct : la migration calcule sa meule (voir plus haut).
    await t.mutation(internal.searchIndexing.backfill, {
      table: 'publications',
    });
    const res = await t.query(api.search.globalSearch, { q: 'Plateformes' });
    // Le résultat GÉNÉRIQUE du registre, que rendent la palette et la page
    // /recherche : c'est lui qui porte la langue du titre.
    const hits = res.sections.flatMap((s) => s.hits);
    expect(hits.map((h) => [h.source, h.title, h.lang])).toEqual([
      ['publications', 'Plateformes et démocratie', 'en'],
    ]);
    // Et la forme historique, pour les appelants qui la lisent encore.
    expect(res.publications).toEqual([
      {
        slug: 'pd',
        title: 'Plateformes et démocratie',
        type: 'rapport',
        lang: 'en',
      },
    ]);
  });
});
