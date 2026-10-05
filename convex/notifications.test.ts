// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
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

// The mutations under test schedule e-mails with `runAfter(0)` — receipt,
// staff alert, decline, sign-in invitation — which run once the test lets go
// of the event loop. Left alone, a send logs after its test has ended, and a
// log landing during the file's teardown fails the whole Vitest run (see
// convex/newsletter.test.ts). Each instance is drained before its test ends.
const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
afterEach(async () => {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
});

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
    status: 'pending' as const,
    createdAt: 0,
    ...over,
  };
}

describe('Notifications — déclencheurs (F-25/F-51)', () => {
  it('valider une publication notifie son auteur (lien + titre)', async () => {
    const t = newConvexTest();
    const authorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'author@test.org' }),
    );
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({
          title: 'Mon analyse',
          slug: 'mon-analyse',
          authorUserId: authorId,
        }),
      ),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'mod@test.org',
      }),
    );

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: pubId,
        decision: 'approved',
      });

    const asAuthor = t.withIdentity({ subject: `${authorId}|s` });
    const notifs = await asAuthor.query(api.notifications.myNotifications, {});
    expect(notifs).toHaveLength(1);
    expect(notifs[0].titleKey).toBe('pubPublished');
    expect(notifs[0].params.title).toBe('Mon analyse');
    expect(notifs[0].link).toBe('/bibliotheque/mon-analyse');
    expect(notifs[0].read).toBe(false);
    expect(await asAuthor.query(api.notifications.unreadCount, {})).toEqual({
      count: 1,
      capped: false,
    });
  });

  it('rejeter une publication notifie (pubRejected -> espace membre)', async () => {
    const t = newConvexTest();
    const authorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'a@test.org' }),
    );
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'p2', authorUserId: authorId }),
      ),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'm@test.org',
      }),
    );
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: pubId,
        decision: 'rejected',
      });
    const notifs = await t
      .withIdentity({ subject: `${authorId}|s` })
      .query(api.notifications.myNotifications, {});
    expect(notifs[0].titleKey).toBe('pubRejected');
    expect(notifs[0].link).toBe('/espace-membre');
  });

  it('approuver une candidature notifie le candidat', async () => {
    const t = newConvexTest();
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'cand@test.org' }),
    );
    const appId = await t.run((ctx) =>
      ctx.db.insert('membershipApplications', {
        type: 'organisation',
        applicantUserId: userId,
        organizationName: 'Org X',
        contactEmail: 'cand@test.org',
        country: 'SN',
        status: 'pending',
        submittedAt: 0,
      }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'm@test.org',
      }),
    );
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: appId,
        decision: 'approved',
      });
    const notifs = await t
      .withIdentity({ subject: `${userId}|s` })
      .query(api.notifications.myNotifications, {});
    expect(notifs).toHaveLength(1);
    expect(notifs[0].titleKey).toBe('membershipApproved');
    expect(notifs[0].link).toBe('/espace-membre');
  });
});

describe('Notifications — lecture & portée (F-25/F-51)', () => {
  it('chacun ne voit que les siennes ; markRead/markAllRead', async () => {
    const t = newConvexTest();
    const aId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'a@test.org' }),
    );
    const bId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'b@test.org' }),
    );
    const n1 = await t.run((ctx) =>
      ctx.db.insert('notifications', {
        userId: aId,
        type: 'x',
        titleKey: 'pubPublished',
        params: { title: 'T1' },
        read: false,
        createdAt: 1,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert('notifications', {
        userId: aId,
        type: 'x',
        titleKey: 'pubRejected',
        params: { title: 'T2' },
        read: false,
        createdAt: 2,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert('notifications', {
        userId: bId,
        type: 'x',
        titleKey: 'membershipApproved',
        read: false,
        createdAt: 3,
      }),
    );

    const asA = t.withIdentity({ subject: `${aId}|s` });
    const asB = t.withIdentity({ subject: `${bId}|s` });

    // strict scope
    expect(
      (await asA.query(api.notifications.myNotifications, {})).length,
    ).toBe(2);
    expect((await asA.query(api.notifications.unreadCount, {})).count).toBe(2);
    expect((await asB.query(api.notifications.unreadCount, {})).count).toBe(1);

    // descending sort (T2 before T1)
    const list = await asA.query(api.notifications.myNotifications, {});
    expect(list[0].titleKey).toBe('pubRejected');

    // B can NOT mark a notification of A
    await expect(
      asB.mutation(api.notifications.markRead, { notificationId: n1 }),
    ).rejects.toThrow();

    // A marks n1 read -> 1 unread remaining
    await asA.mutation(api.notifications.markRead, { notificationId: n1 });
    expect((await asA.query(api.notifications.unreadCount, {})).count).toBe(1);

    // markAllRead -> 0
    const res = await asA.mutation(api.notifications.markAllRead, {});
    expect(res.count).toBe(1);
    expect((await asA.query(api.notifications.unreadCount, {})).count).toBe(0);
  });

  it('anonyme : liste vide, compteur 0', async () => {
    const t = newConvexTest();
    expect(await t.query(api.notifications.myNotifications, {})).toEqual([]);
    expect(await t.query(api.notifications.unreadCount, {})).toEqual({
      count: 0,
      capped: false,
    });
  });
});
