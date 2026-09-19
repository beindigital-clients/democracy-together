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

// Publication complète, inspirée de pubDoc() de search.test.ts / notifications.test.ts.
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

describe('Compteur de consultations (F-37)', () => {
  it('incrémente views d’une publication publiée ; deux appels -> 2', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-a' })),
    );

    await t.mutation(api.publications.recordPublicationView, { slug: 'pub-a' });
    const afterOne = await t.query(api.publications.getBySlug, {
      slug: 'pub-a',
    });
    expect(afterOne?.views).toBe(1);

    await t.mutation(api.publications.recordPublicationView, { slug: 'pub-a' });
    const afterTwo = await t.query(api.publications.getBySlug, {
      slug: 'pub-a',
    });
    expect(afterTwo?.views).toBe(2);
  });

  it('démarre depuis 0 quand views est absent en base', async () => {
    const t = convexTest(schema, modules);
    // Pas de champ `views` (données seed / anciennes) : optionnel au schéma.
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-seed' })),
    );

    // getBySlug normalise views -> 0 même sans enregistrement.
    const before = await t.query(api.publications.getBySlug, {
      slug: 'pub-seed',
    });
    expect(before?.views).toBe(0);

    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-seed',
    });
    const after = await t.query(api.publications.getBySlug, {
      slug: 'pub-seed',
    });
    expect(after?.views).toBe(1);
  });

  it("n'incrémente pas une publication non publiée (pending) et la garde introuvable", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'pub-pending', status: 'pending', views: 0 }),
      ),
    );

    // Mutation publique = no-op silencieux (pas d'auth, pas d'erreur).
    const res = await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-pending',
    });
    expect(res).toBeNull();

    // La query publique n'expose jamais une publication non publiée.
    const fetched = await t.query(api.publications.getBySlug, {
      slug: 'pub-pending',
    });
    expect(fetched).toBeNull();

    // Et views reste à 0 en base (inspection directe).
    const raw = await t.run(async (ctx) => {
      const all = await ctx.db.query('publications').collect();
      return all.find((p) => p.slug === 'pub-pending');
    });
    expect(raw?.views).toBe(0);
  });

  it('slug inconnu : no-op, ne crée rien', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(api.publications.recordPublicationView, {
      slug: 'inexistant',
    });
    expect(res).toBeNull();
    const count = await t.run(
      async (ctx) => (await ctx.db.query('publications').collect()).length,
    );
    expect(count).toBe(0);
  });
});
