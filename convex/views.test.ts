// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { VIEW_LIMITS } from './lib/rateLimit';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Complete publication, modeled on pubDoc() from search.test.ts / notifications.test.ts.
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
    // No `views` field (seed / legacy data): optional in the schema.
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-seed' })),
    );

    // getBySlug normalizes views -> 0 even without a record.
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

    // Public mutation = silent no-op (no auth, no error).
    const res = await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-pending',
    });
    expect(res).toBeNull();

    // The public query never exposes an unpublished publication.
    const fetched = await t.query(api.publications.getBySlug, {
      slug: 'pub-pending',
    });
    expect(fetched).toBeNull();

    // And views stays at 0 in the database (direct inspection).
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

// --- Counter isolation (issue #8) ---------------------------------------
//
// The count no longer patches the publication document — the one read by
// the library, the detail page and the "même thématique" block. It lives in a
// dedicated `publicationViews` row, which these tests check directly: the
// fix is precisely about WHAT is written, not about the displayed number.
describe('Compteur de consultations — écriture isolée (issue #8)', () => {
  it('écrit dans publicationViews et ne touche pas le document', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-iso' })),
    );

    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-iso',
    });

    const { doc, rows } = await t.run(async (ctx) => ({
      doc: await ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', 'pub-iso'))
        .unique(),
      rows: await ctx.db.query('publicationViews').collect(),
    }));

    // The document is UNCHANGED: `views` was not set on it.
    expect(doc?.views).toBeUndefined();
    // …and the dedicated row holds the count.
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
    expect(rows[0].publicationId).toBe(doc?._id);
  });

  it('additionne l’héritage du document et la ligne agrégée', async () => {
    const t = convexTest(schema, modules);
    // 40 views counted BEFORE the split (or set for demo purposes).
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-mix', views: 40 })),
    );

    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-mix',
    });
    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-mix',
    });

    const pub = await t.query(api.publications.getBySlug, { slug: 'pub-mix' });
    expect(pub?.views).toBe(42);
  });
});

// --- Rate cap (issue #8, acceptance criterion) ----------------------
describe('Compteur de consultations — plafond de débit (issue #8)', () => {
  it('consomme un quota, dans un espace de noms par publication', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-quota' })),
    );

    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-quota',
    });
    await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-quota',
    });

    // convex-test does not simulate `ctx.meta`: no IP, hence the per-publication
    // fallback (cf. lib/rateLimit.ts). The key remains specific to the publication.
    const limits = await t.run((ctx) => ctx.db.query('rateLimits').collect());
    expect(limits).toHaveLength(1);
    expect(limits[0].key).toBe('view:noip:pub-quota');
    expect(limits[0].count).toBe(2);
  });

  it('quota épuisé : la vue n’est pas comptée, et la page n’échoue pas', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'pub-full' })),
    );
    // Current window, already at the cap — reaching the cap through 1,000 calls
    // would test nothing more than the test runner's patience.
    await t.run((ctx) =>
      ctx.db.insert('rateLimits', {
        key: 'view:noip:pub-full',
        count: VIEW_LIMITS.perPublicationWithoutIp.max,
        windowStart: Date.now(),
      }),
    );

    // Silent: recording a view must NEVER break the page (the client
    // island already swallows rejections, but one view too many is not an error).
    const res = await t.mutation(api.publications.recordPublicationView, {
      slug: 'pub-full',
    });
    expect(res).toBeNull();

    const pub = await t.query(api.publications.getBySlug, { slug: 'pub-full' });
    expect(pub?.views).toBe(0);
    const rows = await t.run((ctx) =>
      ctx.db.query('publicationViews').collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it('une publication gonflée n’épuise pas le quota des autres', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('publications', pubDoc({ slug: 'pub-x' }));
      await ctx.db.insert('publications', pubDoc({ slug: 'pub-y' }));
      await ctx.db.insert('rateLimits', {
        key: 'view:noip:pub-x',
        count: VIEW_LIMITS.perPublicationWithoutIp.max,
        windowStart: Date.now(),
      });
    });

    await t.mutation(api.publications.recordPublicationView, { slug: 'pub-x' });
    await t.mutation(api.publications.recordPublicationView, { slug: 'pub-y' });

    expect(
      (await t.query(api.publications.getBySlug, { slug: 'pub-x' }))?.views,
    ).toBe(0);
    expect(
      (await t.query(api.publications.getBySlug, { slug: 'pub-y' }))?.views,
    ).toBe(1);
  });
});
