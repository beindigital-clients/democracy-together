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

function makePublication(over: Record<string, unknown>) {
  return {
    title: 'T',
    slug: `pub-${Math.random().toString(36).slice(2)}`,
    type: 'rapport' as const,
    theme: 'participation',
    region: 'mondial' as const,
    languages: ['fr' as const],
    access: 'open' as const,
    authors: [{ name: 'A' }],
    year: 2025,
    publishedAt: Date.now(),
    abstract: 'x',
    keypoints: [],
    body: [],
    doi: '10.0/x',
    downloads: 0,
    citations: 0,
    status: 'published' as const,
    createdAt: Date.now(),
    ...over,
  };
}

describe('Impact — impactStats (F-66)', () => {
  it('agrège des compteurs réels sur les tables du réseau', async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      // Publications: 2 published + 1 pending -> count 2.
      await ctx.db.insert(
        'publications',
        makePublication({ status: 'published' }),
      );
      await ctx.db.insert(
        'publications',
        makePublication({ status: 'published' }),
      );
      await ctx.db.insert(
        'publications',
        makePublication({ status: 'pending' }),
      );

      // Organizations: 2 active + 1 pending -> count 2.
      const baseOrg = {
        country: 'SN',
        region: 'afrique',
        languages: ['fr'],
        themes: ['participation'],
        createdAt: Date.now(),
      };
      await ctx.db.insert('organizations', {
        ...baseOrg,
        name: 'Org A',
        slug: 'org-a',
        status: 'active',
      });
      await ctx.db.insert('organizations', {
        ...baseOrg,
        name: 'Org B',
        slug: 'org-b',
        status: 'active',
      });
      await ctx.db.insert('organizations', {
        ...baseOrg,
        name: 'Org C',
        slug: 'org-c',
        status: 'pending',
      });

      // Event registrations: 3.
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('eventRegistrations', {
          eventSlug: 'conf',
          name: `N${i}`,
          email: `e${i}@x.org`,
          createdAt: Date.now(),
        });
      }

      // Newsletter subscribers: 4 CONFIRMED (double opt-in, diffusion
      // workstream) — plus one pending and one unmigrated legacy entry, which
      // receive nothing and therefore do not count.
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert('newsletterSubscriptions', {
          email: `sub${i}@x.org`,
          createdAt: Date.now(),
          status: 'confirmed',
        });
      }
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'attente@x.org',
        createdAt: Date.now(),
        status: 'pending',
      });
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'herite@x.org',
        createdAt: Date.now(),
      });

      // Tribune: 2 published posts + 1 removed -> count 2; 3 published
      // comments + 1 removed -> count 3. (authorUserId must be a real id.)
      const authorId = await ctx.db.insert('users', {
        role: 'membre',
        email: 'author@x.org',
      });
      const postId = await ctx.db.insert('tribunePosts', {
        authorUserId: authorId,
        authorName: 'M',
        theme: 'participation',
        format: 'court',
        title: 'P1',
        body: 'body',
        status: 'published',
        commentCount: 0,
        createdAt: Date.now(),
      });
      await ctx.db.insert('tribunePosts', {
        authorUserId: authorId,
        authorName: 'M',
        theme: 'participation',
        format: 'court',
        title: 'P2',
        body: 'body',
        status: 'published',
        commentCount: 0,
        createdAt: Date.now(),
      });
      await ctx.db.insert('tribunePosts', {
        authorUserId: authorId,
        authorName: 'M',
        theme: 'participation',
        format: 'court',
        title: 'P3',
        body: 'body',
        status: 'removed',
        commentCount: 0,
        createdAt: Date.now(),
      });
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('tribuneComments', {
          postId,
          authorUserId: authorId,
          authorName: 'M',
          body: 'c',
          status: 'published',
          createdAt: Date.now(),
        });
      }
      await ctx.db.insert('tribuneComments', {
        postId,
        authorUserId: authorId,
        authorName: 'M',
        body: 'c',
        status: 'removed',
        createdAt: Date.now(),
      });

      // Youth applications: 2 pending + 1 approved -> total 3, pending 2.
      const baseYouth = {
        country: 'SN',
        motivation: 'x',
        createdAt: Date.now(),
      };
      await ctx.db.insert('youthApplications', {
        ...baseYouth,
        name: 'Y1',
        email: 'y1@x.org',
        status: 'pending',
      });
      await ctx.db.insert('youthApplications', {
        ...baseYouth,
        name: 'Y2',
        email: 'y2@x.org',
        status: 'pending',
      });
      await ctx.db.insert('youthApplications', {
        ...baseYouth,
        name: 'Y3',
        email: 'y3@x.org',
        status: 'approved',
      });

      // Membership applications: 1 pending + 1 approved -> total 2, pending 1.
      const baseApp = {
        type: 'organisation' as const,
        country: 'SN',
        submittedAt: Date.now(),
      };
      await ctx.db.insert('membershipApplications', {
        ...baseApp,
        organizationName: 'M1',
        contactEmail: 'm1@x.org',
        status: 'pending',
      });
      await ctx.db.insert('membershipApplications', {
        ...baseApp,
        organizationName: 'M2',
        contactEmail: 'm2@x.org',
        status: 'approved',
      });
    });

    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );

    // The impact screen reads denormalized counters, maintained on write
    // (issue #8). This test sets its data DIRECTLY (`t.run`), hence without
    // going through a single mutation: it first runs the reconciliation —
    // the very one that bootstraps an existing deployment.
    await t.mutation(internal.counters.recompute, {});

    const stats = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.impact.impactStats, {});

    expect(stats.publishedPublications).toBe(2);
    expect(stats.activeOrganizations).toBe(2);
    expect(stats.eventRegistrations).toBe(3);
    expect(stats.newsletterSubscribers).toBe(4);
    expect(stats.tribunePosts).toBe(2);
    expect(stats.tribuneComments).toBe(3);
    expect(stats.youthApplications).toBe(3);
    expect(stats.youthApplicationsPending).toBe(2);
    expect(stats.membershipApplications).toBe(2);
    expect(stats.membershipApplicationsPending).toBe(1);
  });

  it('renvoie des zéros sur une base vide (pour un modérateur)', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const stats = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.impact.impactStats, {});
    expect(stats.publishedPublications).toBe(0);
    expect(stats.activeOrganizations).toBe(0);
    expect(stats.eventRegistrations).toBe(0);
    expect(stats.newsletterSubscribers).toBe(0);
    expect(stats.tribunePosts).toBe(0);
    expect(stats.tribuneComments).toBe(0);
    expect(stats.youthApplications).toBe(0);
    expect(stats.membershipApplications).toBe(0);
  });

  it('réserve la lecture aux modérateurs et au-dessus', async () => {
    const t = convexTest(schema, modules);

    // anonymous refused
    await expect(t.query(api.impact.impactStats, {})).rejects.toThrow();

    // visitor refused
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .query(api.impact.impactStats, {}),
    ).rejects.toThrow();

    // member refused
    const membreId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${membreId}|s` })
        .query(api.impact.impactStats, {}),
    ).rejects.toThrow();

    // moderator allowed
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const stats = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.impact.impactStats, {});
    expect(stats).toBeTruthy();
  });
});
