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

    const res = await t.query(api.search.globalSearch, { q: 'Plateforme' });
    expect(res.publications.map((p) => p.slug)).toEqual(['gp']); // pending exclu
    expect(res.organizations.map((o) => o.slug)).toEqual(['ip']); // suspendu exclu

    // moins de 2 caractères -> rien
    const short = await t.query(api.search.globalSearch, { q: 'p' });
    expect(short.publications).toEqual([]);
    expect(short.organizations).toEqual([]);
  });
});
