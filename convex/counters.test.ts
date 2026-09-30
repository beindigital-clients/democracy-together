// @vitest-environment edge-runtime
import { describe, it, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { hashToken } from './lib/newsletterOptIn';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// These tests cover the PUBLISHED feed and its effects (comments, counters,
// notifications, reports): POST-MODERATION mode is set there
// explicitly, as the administrator would. Pre-moderation —
// the default since the community workstream (F-45) — has its own tests
// (convex/communaute-moderation.test.ts).
async function aPosteriori<T extends ReturnType<typeof convexTest>>(t: T) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert('users', {
      role: 'admin',
      email: 'reglages@test.org',
    });
    await ctx.db.insert('communityModerationConfig', {
      key: 'default',
      postMode: 'a_posteriori',
      commentMode: 'a_posteriori',
      updatedBy: admin,
      updatedAt: 0,
    });
  });
  return t;
}

// Denormalized back-office counters (issue #8).
//
// What is checked here is not "the dashboard displays the right
// number" — impact.test.ts and admin.test.ts already take care of that — but the
// MECHANISM: the counter moves in the transaction that writes the counted
// data, it follows status changes in both directions, and
// reconciliation catches up on what was written outside a mutation.

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

    // The publication changed queues: the movement is described in one
    // piece (from -> to), not as two independent increments.
    const after = await counters(t);
    expect(after['publications.pending']).toBe(0);
    expect(after['publications.published']).toBe(1);
  });

  it('retirer un billet de la Tribune décrémente le compteur des publiés', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
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
    // The subscription scheduled the confirmation e-mail (`runAfter(0)`). It
    // runs NOW, before the known hash is armed below: left to run later, it
    // would overwrite that hash with its own, and log after the test has
    // ended (see newsletter.test.ts). Fake timers for this call only.
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    // Double opt-in (distribution workstream): a PENDING one does not count — the
    // counter is that of the subscribers a campaign reaches.
    expect((await counters(t))['newsletterSubscriptions'] ?? 0).toBe(0);
    // The email link carries a token of which only the hash is in the database:
    // we arm a known hash, then confirmation goes through the real
    // public path — it is what increments.
    const jeton = 'c'.repeat(64);
    const empreinte = await hashToken(jeton);
    await t.run(async (ctx) => {
      const [sub] = await ctx.db.query('newsletterSubscriptions').collect();
      await ctx.db.patch(sub._id, { confirmTokenHash: empreinte });
    });
    await t.mutation(api.newsletter.confirm, { token: jeton });
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
    // Publication inserted DIRECTLY, so never counted — exactly the state
    // of a database that existed before the counters.
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
    // Decrementing an absent counter displays 0, not -1: a wrong number can be
    // corrected (recompute), an absurd number discredits the whole screen.
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

    // Nothing was counted: no mutation went through.
    expect(await counters(t)).toEqual({});

    const { counters: recomputed } = await t.mutation(
      internal.counters.recompute,
      {},
    );
    const byKey = Object.fromEntries(recomputed.map((c) => [c.key, c.value]));
    expect(byKey['users']).toBe(2);
    expect(byKey['publications.published']).toBe(1);
    expect(byKey['publications.pending']).toBe(1);
    // All registry keys are set, even at zero: an absent key
    // and a zero key must read the same on the dashboard side.
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
    // A key not requested is not recomputed.
    expect(after['eventRegistrations']).toBe(7);
  });
});
