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
      // Publications : 2 publiées + 1 en attente -> compte 2.
      await ctx.db.insert('publications', makePublication({ status: 'published' }));
      await ctx.db.insert('publications', makePublication({ status: 'published' }));
      await ctx.db.insert('publications', makePublication({ status: 'pending' }));

      // Organisations : 2 actives + 1 en attente -> compte 2.
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

      // Inscriptions événements : 3.
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert('eventRegistrations', {
          eventSlug: 'conf',
          name: `N${i}`,
          email: `e${i}@x.org`,
          createdAt: Date.now(),
        });
      }

      // Abonnés newsletter : 4.
      for (let i = 0; i < 4; i++) {
        await ctx.db.insert('newsletterSubscriptions', {
          email: `sub${i}@x.org`,
          createdAt: Date.now(),
        });
      }

      // Tribune : 2 posts publiés + 1 retiré -> compte 2 ; 3 commentaires
      // publiés + 1 retiré -> compte 3. (authorUserId doit être un vrai id.)
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

      // Candidatures jeunes : 2 pending + 1 approved -> total 3, pending 2.
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

      // Candidatures adhésion : 1 pending + 1 approved -> total 2, pending 1.
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

    // anonyme refusé
    await expect(t.query(api.impact.impactStats, {})).rejects.toThrow();

    // visiteur refusé
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .query(api.impact.impactStats, {}),
    ).rejects.toThrow();

    // membre refusé
    const membreId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${membreId}|s` })
        .query(api.impact.impactStats, {}),
    ).rejects.toThrow();

    // modérateur autorisé
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const stats = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.impact.impactStats, {});
    expect(stats).toBeTruthy();
  });
});
