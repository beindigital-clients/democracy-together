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

// --- Isolement du compteur (issue #8) ---------------------------------------
//
// Le décompte ne patche plus le document de la publication — celui que lisent
// la bibliothèque, le détail et le bloc « même thématique ». Il vit dans une
// ligne dédiée `publicationViews`, ce que ces tests vérifient directement : le
// correctif porte précisément sur QUI est écrit, pas sur le nombre affiché.
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

    // Le document est INCHANGÉ : `views` n'y a pas été posé.
    expect(doc?.views).toBeUndefined();
    // …et la ligne dédiée porte le décompte.
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
    expect(rows[0].publicationId).toBe(doc?._id);
  });

  it('additionne l’héritage du document et la ligne agrégée', async () => {
    const t = convexTest(schema, modules);
    // 40 vues comptées AVANT le découpage (ou posées en démonstration).
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

// --- Plafond de débit (issue #8, critère d’acceptation) ----------------------
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

    // convex-test ne simule pas `ctx.meta` : pas d'IP, donc le repli par
    // publication (cf. lib/rateLimit.ts). La clé reste propre à la publication.
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
    // Fenêtre en cours, déjà au plafond — atteindre le plafond par 1 000 appels
    // ne testerait rien de plus que la patience du lanceur de tests.
    await t.run((ctx) =>
      ctx.db.insert('rateLimits', {
        key: 'view:noip:pub-full',
        count: VIEW_LIMITS.perPublicationWithoutIp.max,
        windowStart: Date.now(),
      }),
    );

    // Silencieux : enregistrer une vue ne doit JAMAIS casser la page (l'îlot
    // client avale déjà les rejets, mais une vue de trop n'est pas une erreur).
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
