// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { PAGE_SIZE_MAX } from './lib/pagination';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Pagination of back-office lists (issue #8).
//
// Two properties, and nothing else: a page holds the requested size and the
// cursor brings back the rest WITHOUT gaps or duplicates; and the requested size is
// RE-CAPPED server-side — otherwise `numItems: 1e6`, which the client chooses,
// revives exactly the table scan that pagination replaces.

function pubDoc(i: number, over: Record<string, unknown> = {}) {
  return {
    title: `Publication ${i}`,
    slug: `pub-${i}`,
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
    createdAt: i,
    submittedAt: i,
    ...over,
  };
}

// Walks through all pages of a list and returns the rows end to end.
async function drain<T>(
  next: (cursor: string | null) => Promise<{
    page: T[];
    isDone: boolean;
    continueCursor: string;
  }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const res = await next(cursor);
    all.push(...res.page);
    if (res.isDone) return all;
    cursor = res.continueCursor;
  }
  throw new Error('pagination : trop de pages, curseur qui n’avance pas ?');
}

describe('Back-office — pagination des listes (issue #8)', () => {
  it('listUsers : pages successives, sans trou ni doublon, triées par e-mail', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', {
        role: 'admin',
        email: 'admin@test.org',
      });
      for (let i = 0; i < 7; i++) {
        await ctx.db.insert('users', {
          role: 'membre',
          email: `membre-${i}@test.org`,
        });
      }
      return id;
    });
    const as = t.withIdentity({ subject: `${adminId}|s` });

    const first = await as.query(api.admin.listUsers, {
      paginationOpts: { numItems: 3, cursor: null },
    });
    expect(first.page).toHaveLength(3);
    expect(first.isDone).toBe(false);

    const all = await drain((cursor) =>
      as.query(api.admin.listUsers, {
        paginationOpts: { numItems: 3, cursor },
      }),
    );
    const emails = all.map((u) => u.email);
    expect(emails).toHaveLength(8);
    expect(new Set(emails).size).toBe(8);
    // The order comes from the `email` index, no longer from an in-memory sort.
    expect(emails).toEqual([...emails].sort());
  });

  it('listForReview : la file « en attente » se parcourt entièrement', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert('publications', pubDoc(i));
      }
      // A published one: it must NOT appear in the "pending" queue.
      await ctx.db.insert(
        'publications',
        pubDoc(99, { status: 'published', slug: 'pub-99' }),
      );
      return await ctx.db.insert('users', {
        role: 'moderateur',
        email: 'mod@test.org',
      });
    });
    const as = t.withIdentity({ subject: `${modId}|s` });

    const pending = await drain((cursor) =>
      as.query(api.publications.listForReview, {
        status: 'pending',
        paginationOpts: { numItems: 2, cursor },
      }),
    );
    expect(pending.map((p) => p.slug).sort()).toEqual([
      'pub-0',
      'pub-1',
      'pub-2',
      'pub-3',
      'pub-4',
    ]);

    const all = await drain((cursor) =>
      as.query(api.publications.listForReview, {
        status: 'all',
        paginationOpts: { numItems: 2, cursor },
      }),
    );
    expect(all).toHaveLength(6);
  });

  it('listAuditLog : la taille de page demandée est REPLAFONNÉE côté serveur', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run(async (ctx) => {
      for (let i = 0; i < PAGE_SIZE_MAX + 20; i++) {
        await ctx.db.insert('auditLog', {
          action: 'test.action',
          targetId: `t-${i}`,
          createdAt: i,
        });
      }
      return await ctx.db.insert('users', {
        role: 'admin',
        email: 'admin@test.org',
      });
    });

    // What `limit` without a cap did: re-read everything at once.
    const res = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.journal.listAuditLog, {
        paginationOpts: { numItems: 100_000, cursor: null },
      });

    expect(res.page.length).toBeLessThanOrEqual(PAGE_SIZE_MAX);
    expect(res.isDone).toBe(false);
  });

  it('getReviewQueue : ne remonte que les publications engagées dans une revue', async () => {
    const t = convexTest(schema, modules);
    const editorId = await t.run(async (ctx) => {
      // Three under review, one at each stage…
      await ctx.db.insert(
        'publications',
        pubDoc(1, { slug: 'r-in', reviewStage: 'in_review' }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc(2, { slug: 'r-rev', reviewStage: 'revision' }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc(3, { slug: 'r-done', reviewStage: 'reviewed' }),
      );
      // … and two out of review, which must never be read.
      await ctx.db.insert('publications', pubDoc(4, { slug: 'hors-1' }));
      await ctx.db.insert('publications', pubDoc(5, { slug: 'hors-2' }));
      return await ctx.db.insert('users', {
        role: 'editeur',
        email: 'editeur@test.org',
      });
    });
    const as = t.withIdentity({ subject: `${editorId}|s` });

    const queue = await drain((cursor) =>
      as.query(api.peerReview.getReviewQueue, {
        paginationOpts: { numItems: 2, cursor },
      }),
    );
    expect(queue.map((p) => p.slug).sort()).toEqual([
      'r-done',
      'r-in',
      'r-rev',
    ]);

    // Filter by stage: a single stage, via the same index range.
    const revision = await as.query(api.peerReview.getReviewQueue, {
      stage: 'revision',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(revision.page.map((p) => p.slug)).toEqual(['r-rev']);
    expect(revision.isDone).toBe(true);
  });
});

describe('Back-office — sélecteur de relecteurs (issue #8)', () => {
  it('listStaffUsers ne remonte que le staff, sans lire les autres comptes', async () => {
    const t = convexTest(schema, modules);
    const editorId = await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        role: 'moderateur',
        email: 'mod@test.org',
      });
      await ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' });
      await ctx.db.insert('users', { role: 'membre', email: 'm@test.org' });
      await ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' });
      // Legacy account, without a `role` column: absent from the `by_role` index under
      // a staff value, hence absent from the selector.
      await ctx.db.insert('users', { email: 'ancien@test.org' });
      return await ctx.db.insert('users', {
        role: 'editeur',
        email: 'editeur@test.org',
      });
    });

    const staff = await t
      .withIdentity({ subject: `${editorId}|s` })
      .query(api.peerReview.listStaffUsers, {});

    expect(staff.map((u) => u.email).sort()).toEqual([
      'admin@test.org',
      'editeur@test.org',
      'mod@test.org',
    ]);
  });
});
