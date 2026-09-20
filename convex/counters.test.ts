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

// Compteurs dénormalisés du back-office (issue #8).
//
// Ce qui est vérifié ici n'est pas « le tableau de bord affiche le bon
// nombre » — impact.test.ts et admin.test.ts s'en chargent déjà — mais le
// MÉCANISME : le compteur bouge dans la transaction qui écrit la donnée
// comptée, il suit les changements de statut dans les deux sens, et la
// réconciliation rattrape ce qui a été écrit hors mutation.

async function counters(
  t: ReturnType<typeof convexTest>,
): Promise<Record<string, number>> {
  const rows = await t.run((ctx) => ctx.db.query('counters').collect());
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function pubDoc(over: Record<string, unknown> = {}) {
  return {
    title: 'Titre',
    slug: `s-${Math.random().toString(36).slice(2)}`,
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

describe('Compteurs — tenue à l’écriture (issue #8)', () => {
  it('une soumission de publication incrémente « en attente », la validation la déplace', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );

    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, {
        title: 'Une soumission de test',
        type: 'rapport',
        theme: 'transitions',
        region: 'mondial',
        languages: ['fr'],
        access: 'open',
        year: 2025,
        authors: [{ name: 'A. Auteur' }],
        abstract: 'Un résumé suffisamment long pour passer la validation.',
      });

    expect((await counters(t))['publications.pending']).toBe(1);
    expect((await counters(t))['publications.published']).toBeUndefined();

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      });

    // La publication a changé de file : le mouvement est décrit d'un seul
    // tenant (from -> to), pas en deux incréments indépendants.
    const after = await counters(t);
    expect(after['publications.pending']).toBe(0);
    expect(after['publications.published']).toBe(1);
  });

  it('retirer un billet de la Tribune décrémente le compteur des publiés', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );

    const postId = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.tribune.createPost, {
        theme: 'transitions',
        format: 'court',
        lang: 'fr',
        title: 'Sur les transitions',
        body: 'Une contribution courte mais valable.',
      });
    expect((await counters(t))['tribunePosts.published']).toBe(1);

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.tribune.reportContent, {
        targetType: 'post',
        targetId: postId,
      });
    const reportId = await t.run(async (ctx) => {
      const [r] = await ctx.db.query('tribuneReports').collect();
      return r._id;
    });
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.tribune.resolveReport, { reportId, action: 'remove' });

    expect((await counters(t))['tribunePosts.published']).toBe(0);
  });

  it('un désabonnement newsletter décrémente le compteur d’abonnés', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.newsletter.recordSubscription, {
      email: 'abonne@test.org',
    });
    expect((await counters(t))['newsletterSubscriptions']).toBe(1);

    const token = await t.run(async (ctx) => {
      const [sub] = await ctx.db.query('newsletterSubscriptions').collect();
      return sub.unsubToken!;
    });
    await t.mutation(api.newsletter.unsubscribe, { token });

    expect((await counters(t))['newsletterSubscriptions']).toBe(0);
  });

  it('ne descend jamais sous zéro sur un déploiement non amorcé', async () => {
    const t = convexTest(schema, modules);
    // Publication posée EN DIRECT, donc jamais comptée — exactement l'état
    // d'une base qui existait avant les compteurs.
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ status: 'pending' })),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: pubId,
        decision: 'approved',
      });

    const after = await counters(t);
    // Le décrément d'un compteur absent affiche 0, pas -1 : un chiffre faux se
    // corrige (recompute), un chiffre absurde discrédite l'écran entier.
    expect(after['publications.pending']).toBe(0);
    expect(after['publications.published']).toBe(1);
  });
});

describe('Compteurs — réconciliation (counters.recompute)', () => {
  it('recalcule depuis les tables ce qui a été écrit hors mutation', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { role: 'admin', email: 'a@test.org' });
      await ctx.db.insert('users', { role: 'membre', email: 'b@test.org' });
      await ctx.db.insert('publications', pubDoc({ status: 'published' }));
      await ctx.db.insert('publications', pubDoc({ status: 'pending' }));
    });

    // Rien n'a été compté : aucune mutation n'est passée.
    expect(await counters(t)).toEqual({});

    const { counters: recomputed } = await t.mutation(
      internal.counters.recompute,
      {},
    );
    const byKey = Object.fromEntries(recomputed.map((c) => [c.key, c.value]));
    expect(byKey['users']).toBe(2);
    expect(byKey['publications.published']).toBe(1);
    expect(byKey['publications.pending']).toBe(1);
    // Toutes les clés du registre sont posées, même à zéro : une clé absente
    // et une clé à zéro doivent se lire pareil côté tableau de bord.
    expect(byKey['eventRegistrations']).toBe(0);
  });

  it('corrige un compteur qui a dérivé, sans toucher aux autres', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { role: 'admin', email: 'a@test.org' });
      await ctx.db.insert('counters', { key: 'users', value: 99 });
      await ctx.db.insert('counters', { key: 'eventRegistrations', value: 7 });
    });

    await t.mutation(internal.counters.recompute, { key: 'users' });

    const after = await counters(t);
    expect(after['users']).toBe(1);
    // Une clé non demandée n'est pas recalculée.
    expect(after['eventRegistrations']).toBe(7);
  });
});
