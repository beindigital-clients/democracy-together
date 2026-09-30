// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { AUDIT } from './lib/auditActions';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from './lib/search';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Search and filters of the back-office lists (issue #49).
//
// WHAT THESE TESTS REALLY CHECK. The issue's constraint is not
// "the list narrows" — a `.filter()` on the rendered array would suffice —
// but "it narrows WITHOUT re-reading the table". A test comparing two
// arrays cannot tell the two apart. Each case below is therefore written
// the same way: we seed a searched-for row AND rows that must not
// come out, we request a PAGE SMALLER than the table, and we check that the
// page contains only what matches. A search filtered in memory
// after pagination would fail — the page would be filled with non-matches
// then emptied by the filter.
//
// ABOUT THE ENVIRONMENT. `convex-test` implements full-text indexes
// by matching word PREFIXES split on spaces, whereas Convex
// also splits on punctuation. The terms searched here are therefore
// prefixes of the whole word AND of the sub-word — they match under both
// tokenizations, and the E2E flow exercises the real one.
// Corollary: the search scans every document in the table, and
// `convex-test` reads the searched field without guarding it — a document without
// `email` would make the search on `users` fail there. The accounts seeded here
// therefore always carry one, like real accounts.

const PAGE = (numItems = 50) => ({
  paginationOpts: { numItems, cursor: null },
});

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
  );
  return t.withIdentity({ subject: `${adminId}|s` });
}

describe('Utilisateurs — recherche par adresse et filtre par rôle (issue #49)', () => {
  async function seedUsers(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      await ctx.db.insert('users', {
        role: 'membre',
        name: 'Awa Diop',
        email: 'awa.diop@institut-sahel.org',
      });
      await ctx.db.insert('users', {
        role: 'moderateur',
        email: 'moussa@institut-sahel.org',
      });
      // Three addresses sharing the same START: that is what makes the
      // "one fragment, several accounts" case verifiable under both
      // tokenizations (see the file header).
      await ctx.db.insert('users', {
        role: 'membre',
        email: 'europe.lea@reseau.eu',
      });
      await ctx.db.insert('users', {
        role: 'editeur',
        email: 'europe.jan@reseau.eu',
      });
      await ctx.db.insert('users', {
        role: 'membre',
        email: 'europe.tom@reseau.eu',
      });
    });
  }

  it('remonte le compte cherché, et lui seul, dans une page plus petite que la table', async () => {
    const t = convexTest(schema, modules);
    await seedUsers(t);
    const as = await seedAdmin(t);

    // Page of 2 out of 6 accounts: if the narrowing happened after the read,
    // the page would contain any two accounts, of which zero or only one
    // matching.
    const res = await as.query(api.admin.listUsers, {
      ...PAGE(2),
      search: 'awa',
    });
    expect(res.page.map((u) => u.email)).toEqual([
      'awa.diop@institut-sahel.org',
    ]);
  });

  it('un fragment partagé remonte tous les comptes concernés, et aucun autre', async () => {
    const t = convexTest(schema, modules);
    await seedUsers(t);
    const as = await seedAdmin(t);

    const res = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'europe',
    });
    expect(res.page.map((u) => u.email).sort()).toEqual([
      'europe.jan@reseau.eu',
      'europe.lea@reseau.eu',
      'europe.tom@reseau.eu',
    ]);

    const none = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'zzzz-personne',
    });
    expect(none.page).toEqual([]);
    expect(none.isDone).toBe(true);
  });

  it('filtre par rôle : seul ce rôle sort, et la page reste bornée', async () => {
    const t = convexTest(schema, modules);
    await seedUsers(t);
    const as = await seedAdmin(t);

    const editeurs = await as.query(api.admin.listUsers, {
      ...PAGE(),
      role: 'editeur',
    });
    expect(editeurs.page.map((u) => u.email)).toEqual(['europe.jan@reseau.eu']);

    const membres = await as.query(api.admin.listUsers, {
      ...PAGE(),
      role: 'membre',
    });
    expect(membres.page.map((u) => u.email).sort()).toEqual([
      'awa.diop@institut-sahel.org',
      'europe.lea@reseau.eu',
      'europe.tom@reseau.eu',
    ]);
    // The filter only reads its index range: the admin themselves is not in it.
    expect(membres.page.map((u) => u.role)).toEqual([
      'membre',
      'membre',
      'membre',
    ]);
  });

  it('recherche ET rôle se combinent dans la même lecture', async () => {
    const t = convexTest(schema, modules);
    await seedUsers(t);
    const as = await seedAdmin(t);

    // "europe" matches three accounts; the role keeps one.
    const combined = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'europe',
      role: 'editeur',
    });
    expect(combined.page.map((u) => u.email)).toEqual(['europe.jan@reseau.eu']);

    // A role matching none of the results returns nothing —
    // it is not the search alone that decides.
    const empty = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'europe',
      role: 'admin',
    });
    expect(empty.page).toEqual([]);
  });

  it('la pagination survit à la recherche : pages successives, sans trou ni doublon', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 7; i++) {
        await ctx.db.insert('users', {
          role: 'membre',
          email: `cherche-${i}@reseau.org`,
        });
      }
      // Two accounts outside the search, which must appear on no page.
      await ctx.db.insert('users', {
        role: 'membre',
        email: 'hors-1@ailleurs.org',
      });
      await ctx.db.insert('users', {
        role: 'membre',
        email: 'hors-2@ailleurs.org',
      });
    });
    const as = await seedAdmin(t);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const res = await as.query(api.admin.listUsers, {
        paginationOpts: { numItems: 3, cursor },
        search: 'cherche-',
      });
      seen.push(...res.page.map((u) => u.email ?? ''));
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen.some((e) => e.includes('ailleurs'))).toBe(false);
  });

  it('un compte SANS rôle stocké : cherchable par adresse, absent du filtre « visiteur »', async () => {
    // The accepted and documented behavior of `listUsers` (issue #27 + #49):
    // the `role` column is missing on accounts from before PR #4, so they are
    // indexed under `undefined` — outside the `role = 'visiteur'` range. This test
    // exists so that this is a DECISION, not a surprise: the account remains
    // reachable through the full list and through search.
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'ancien-compte@legacy.org' }),
    );
    const as = await seedAdmin(t);

    const all = await as.query(api.admin.listUsers, PAGE());
    const legacy = all.page.find((u) => u.email === 'ancien-compte@legacy.org');
    expect(legacy?.role).toBe('visiteur');

    const found = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'ancien-compte',
    });
    expect(found.page.map((u) => u.email)).toEqual([
      'ancien-compte@legacy.org',
    ]);

    const filtered = await as.query(api.admin.listUsers, {
      ...PAGE(),
      role: 'visiteur',
    });
    expect(filtered.page).toEqual([]);
  });

  it('reste réservée aux administrateurs, recherche comprise', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .query(api.admin.listUsers, { ...PAGE(), search: 'mod' }),
    ).rejects.toThrow();
  });
});

describe('Termes de recherche — bornes côté serveur (issue #49)', () => {
  it('un terme trop court ne déclenche pas de recherche : la liste reste entière', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { role: 'membre', email: 'aaa@reseau.org' });
      await ctx.db.insert('users', { role: 'membre', email: 'bbb@reseau.org' });
    });
    const as = await seedAdmin(t);

    const short = 'a'.repeat(SEARCH_MIN_LENGTH - 1);
    const res = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: short,
    });
    // 3 accounts: the term is ignored, not applied. Without this floor, a single
    // character would return almost the whole table — the read that #8
    // removed, dressed up as a search.
    expect(res.page).toHaveLength(3);
  });

  it('une chaîne blanche équivaut à pas de recherche', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'aaa@reseau.org' }),
    );
    const as = await seedAdmin(t);

    const blank = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: '   ',
    });
    const none = await as.query(api.admin.listUsers, PAGE());
    expect(blank.page).toEqual(none.page);
  });

  it('un terme démesuré est tronqué, pas refusé', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'membre',
        email: `${'x'.repeat(SEARCH_MAX_LENGTH + 40)}@reseau.org`,
      }),
    );
    const as = await seedAdmin(t);

    // The term exceeds the cap; truncated, it is still a prefix of the address,
    // so the search succeeds instead of throwing.
    const res = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'x'.repeat(SEARCH_MAX_LENGTH + 40),
    });
    expect(res.page).toHaveLength(1);
  });
});

describe('Candidatures — pagination et recherche (issues #8 et #49)', () => {
  async function seedApplications(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      const rows = [
        {
          organizationName: 'Institut Sahel',
          status: 'pending' as const,
          at: 1,
        },
        {
          organizationName: 'Fondation Rhin',
          status: 'pending' as const,
          at: 2,
        },
        {
          organizationName: 'Observatoire Sahel',
          status: 'approved' as const,
          at: 3,
        },
        {
          organizationName: 'Centre Baltique',
          status: 'pending' as const,
          at: 4,
        },
        {
          organizationName: 'Cercle Danube',
          status: 'rejected' as const,
          at: 5,
        },
      ];
      for (const r of rows) {
        await ctx.db.insert('membershipApplications', {
          type: 'organisation',
          organizationName: r.organizationName,
          contactEmail: `${r.at}@demo.org`,
          country: 'SN',
          status: r.status,
          submittedAt: r.at,
        });
      }
    });
  }

  it('la file « en attente » sort la plus récente d’abord, et se pagine', async () => {
    const t = convexTest(schema, modules);
    await seedApplications(t);
    const as = await seedAdmin(t);

    const first = await as.query(api.admin.listApplications, {
      ...PAGE(2),
      status: 'pending',
    });
    expect(first.page.map((a) => a.organizationName)).toEqual([
      'Centre Baltique',
      'Fondation Rhin',
    ]);
    expect(first.isDone).toBe(false);

    const next = await as.query(api.admin.listApplications, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
      status: 'pending',
    });
    expect(next.page.map((a) => a.organizationName)).toEqual([
      'Institut Sahel',
    ]);
  });

  it('cherche par nom d’organisation à travers TOUTE la file, pas seulement la page', async () => {
    const t = convexTest(schema, modules);
    await seedApplications(t);
    const as = await seedAdmin(t);

    // "Institut Sahel" is the OLDEST of the three pending: a page
    // of 1 without search would return "Centre Baltique". The search must
    // therefore reach a row the first page does not contain.
    const res = await as.query(api.admin.listApplications, {
      ...PAGE(1),
      status: 'pending',
      search: 'institut',
    });
    expect(res.page.map((a) => a.organizationName)).toEqual(['Institut Sahel']);
  });

  it('la recherche respecte le statut demandé', async () => {
    const t = convexTest(schema, modules);
    await seedApplications(t);
    const as = await seedAdmin(t);

    // "Sahel" matches one pending application and one approved.
    const pending = await as.query(api.admin.listApplications, {
      ...PAGE(),
      status: 'pending',
      search: 'Sahel',
    });
    expect(pending.page.map((a) => a.organizationName)).toEqual([
      'Institut Sahel',
    ]);

    const all = await as.query(api.admin.listApplications, {
      ...PAGE(),
      search: 'Sahel',
    });
    expect(all.page.map((a) => a.organizationName).sort()).toEqual([
      'Institut Sahel',
      'Observatoire Sahel',
    ]);
  });

  it('ne laisse pas sortir un champ que le validateur ne déclare pas', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert('membershipApplications', {
        type: 'organisation',
        organizationName: 'Institut Sahel',
        contactEmail: 'a@demo.org',
        country: 'SN',
        status: 'approved',
        submittedAt: 1,
        reviewNotes: 'Note de revue',
        invitedAt: 2,
      }),
    );
    const as = await seedAdmin(t);

    const res = await as.query(api.admin.listApplications, PAGE());
    // The review note is meant for staff: it comes out. So does the moment the
    // sign-in invitation left — the queue shows it, and offers to send it
    // again. The workflow's other internal fields do not.
    expect(res.page[0].reviewNotes).toBe('Note de revue');
    expect(res.page[0].invitedAt).toBe(2);
    for (const field of ['createdOrgId', 'reviewedBy', '_creationTime']) {
      expect(Object.keys(res.page[0])).not.toContain(field);
    }
  });
});

describe('Publications — recherche dans la file de modération (issue #49)', () => {
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
      doi: `10.59000/dt.${i}`,
      downloads: 0,
      citations: 0,
      status: 'pending' as const,
      createdAt: i,
      submittedAt: i,
      ...over,
    };
  }

  it('cherche par titre, et seulement dans le statut demandé', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run(async (ctx) => {
      await ctx.db.insert(
        'publications',
        pubDoc(1, { title: 'Transitions démocratiques au Sahel', slug: 'p-1' }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc(2, { title: 'Financement des partis', slug: 'p-2' }),
      );
      await ctx.db.insert(
        'publications',
        pubDoc(3, {
          title: 'Transitions et médias',
          slug: 'p-3',
          status: 'published',
        }),
      );
      return await ctx.db.insert('users', {
        role: 'moderateur',
        email: 'mod@test.org',
      });
    });
    const as = t.withIdentity({ subject: `${modId}|s` });

    const pending = await as.query(api.publications.listForReview, {
      ...PAGE(1),
      status: 'pending',
      search: 'transitions',
    });
    expect(pending.page.map((p) => p.slug)).toEqual(['p-1']);

    const all = await as.query(api.publications.listForReview, {
      ...PAGE(),
      status: 'all',
      search: 'transitions',
    });
    expect(all.page.map((p) => p.slug).sort()).toEqual(['p-1', 'p-3']);
  });
});

describe('Journal — recherche par action et filtre par acteur (issue #49)', () => {
  async function seedJournal(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const awa = await ctx.db.insert('users', {
        role: 'admin',
        name: 'Awa Diop',
        email: 'awa@demo.org',
      });
      const jan = await ctx.db.insert('users', {
        role: 'moderateur',
        name: 'Jan Novak',
        email: 'jan@demo.org',
      });
      await ctx.db.insert('auditLog', {
        actorId: awa,
        action: AUDIT.PUBLICATION_REVIEWED,
        targetId: 'pub-1',
        createdAt: 1_000,
      });
      await ctx.db.insert('auditLog', {
        actorId: jan,
        action: AUDIT.PUBLICATION_REVIEWED,
        targetId: 'pub-2',
        createdAt: 2_000,
      });
      await ctx.db.insert('auditLog', {
        actorId: awa,
        action: AUDIT.USER_ROLE_CHANGED,
        targetId: 'user-1',
        createdAt: 3_000,
      });
      await ctx.db.insert('auditLog', {
        actorId: jan,
        action: AUDIT.TRIBUNE_MODERATED,
        targetId: 'post-1',
        createdAt: 4_000,
      });
      return { awa, jan };
    });
  }

  it('filtre par acteur : tout ce qu’il a fait, en ordre chronologique inverse', async () => {
    const t = convexTest(schema, modules);
    const { awa } = await seedJournal(t);
    const as = await seedAdmin(t);

    const res = await as.query(api.journal.listAuditLog, {
      ...PAGE(),
      actorId: awa,
    });
    expect(res.page.map((r) => r.targetId)).toEqual(['user-1', 'pub-1']);
    expect(res.page.every((r) => r.actorName === 'Awa Diop')).toBe(true);
    // The identifier comes out: it is what the screen sends back for this filter.
    expect(res.page.every((r) => r.actorId === awa)).toBe(true);
  });

  it('filtre par acteur sur une page étroite : aucune entrée d’un autre acteur', async () => {
    const t = convexTest(schema, modules);
    const { jan } = await seedJournal(t);
    const as = await seedAdmin(t);

    // Page of 1 out of 4 entries: the most recent of ALL is Jan's,
    // so we take the case where the bound is not enough to conclude and we
    // scan to the end.
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const res = await as.query(api.journal.listAuditLog, {
        paginationOpts: { numItems: 1, cursor },
        actorId: jan,
      });
      seen.push(...res.page.map((r) => r.targetId ?? ''));
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(seen).toEqual(['post-1', 'pub-2']);
  });

  it('cherche une famille d’actions par son préfixe pointé', async () => {
    const t = convexTest(schema, modules);
    await seedJournal(t);
    const as = await seedAdmin(t);

    const res = await as.query(api.journal.listAuditLog, {
      ...PAGE(),
      search: 'publication',
    });
    expect(res.page.map((r) => r.targetId).sort()).toEqual(['pub-1', 'pub-2']);
  });

  it('recherche ET acteur se combinent', async () => {
    const t = convexTest(schema, modules);
    const { jan } = await seedJournal(t);
    const as = await seedAdmin(t);

    const res = await as.query(api.journal.listAuditLog, {
      ...PAGE(),
      search: 'publication',
      actorId: jan,
    });
    expect(res.page.map((r) => r.targetId)).toEqual(['pub-2']);
  });

  it('reste réservé aux administrateurs, filtres compris', async () => {
    const t = convexTest(schema, modules);
    const { awa } = await seedJournal(t);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod2@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .query(api.journal.listAuditLog, {
          ...PAGE(),
          actorId: awa,
          search: 'publication',
        }),
    ).rejects.toThrow();
  });
});
