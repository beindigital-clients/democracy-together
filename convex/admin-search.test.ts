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

// Recherche et filtres des listes du back-office (issue #49).
//
// CE QUE CES TESTS VÉRIFIENT VRAIMENT. La contrainte de l'issue n'est pas
// « la liste se restreint » — un `.filter()` sur le tableau rendu y suffirait —
// mais « elle se restreint SANS relire la table ». Un test qui compare deux
// tableaux ne distingue pas les deux. Chaque cas ci-dessous est donc écrit de
// la même façon : on sème une ligne cherchée ET des lignes qui ne doivent pas
// sortir, on demande une PAGE PLUS PETITE que la table, et on vérifie que la
// page ne contient que ce qui correspond. Une recherche filtrée en mémoire
// après pagination échouerait — la page serait remplie de non-correspondances
// puis vidée par le filtre.
//
// À SAVOIR SUR L'ENVIRONNEMENT. `convex-test` implémente les index plein texte
// en appariant des PRÉFIXES de mots découpés sur les espaces, là où Convex
// découpe aussi sur la ponctuation. Les termes cherchés ici sont donc des
// préfixes du mot entier ET du sous-mot — ils correspondent sous les deux
// tokenisations, et le parcours E2E exerce la vraie.
// Corollaire : la recherche parcourt tous les documents de la table, et
// `convex-test` lit le champ cherché sans le protéger — un document sans
// `email` y ferait échouer la recherche sur `users`. Les comptes semés ici en
// portent donc toujours un, comme les comptes réels.

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
      // Trois adresses partageant un même DÉBUT : c'est ce qui rend le cas
      // « un fragment, plusieurs comptes » vérifiable sous les deux
      // tokenisations (cf. l'en-tête du fichier).
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

    // Page de 2 sur 6 comptes : si la restriction se faisait après la lecture,
    // la page contiendrait deux comptes quelconques, dont zéro ou un seul
    // correspondant.
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
    // Le filtre ne lit que sa plage d'index : l'admin lui-même n'y est pas.
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

    // « europe » correspond à trois comptes ; le rôle en garde un.
    const combined = await as.query(api.admin.listUsers, {
      ...PAGE(),
      search: 'europe',
      role: 'editeur',
    });
    expect(combined.page.map((u) => u.email)).toEqual(['europe.jan@reseau.eu']);

    // Un rôle qui ne correspond à aucun des résultats ne remonte rien —
    // ce n'est pas la recherche seule qui décide.
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
      // Deux comptes hors recherche, qui ne doivent apparaître sur aucune page.
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
    // Le comportement assumé et documenté de `listUsers` (issue #27 + #49) :
    // la colonne `role` manque sur les comptes d'avant la PR #4, ils sont donc
    // indexés sous `undefined` — hors de la plage `role = 'visiteur'`. Ce test
    // existe pour que ce soit une DÉCISION, pas une surprise : le compte reste
    // atteignable par la liste complète et par la recherche.
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
    // 3 comptes : le terme est ignoré, pas appliqué. Sans ce plancher, un seul
    // caractère remonterait presque toute la table — la lecture que #8 a
    // supprimée, rhabillée en recherche.
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

    // Le terme dépasse le plafond ; tronqué, il reste un préfixe de l'adresse,
    // donc la recherche aboutit au lieu de lever.
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

    // « Institut Sahel » est la PLUS ANCIENNE des trois en attente : une page
    // de 1 sans recherche remonterait « Centre Baltique ». La recherche doit
    // donc atteindre une ligne que la première page ne contient pas.
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

    // « Sahel » correspond à une candidature en attente et à une approuvée.
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
    // La note de revue est destinée au staff : elle sort. Les champs d'usage
    // interne du workflow d'onboarding, non.
    expect(res.page[0].reviewNotes).toBe('Note de revue');
    for (const field of [
      'invitedAt',
      'createdOrgId',
      'reviewedBy',
      '_creationTime',
    ]) {
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
    // L'identifiant ressort : c'est lui que l'écran renvoie pour ce filtre.
    expect(res.page.every((r) => r.actorId === awa)).toBe(true);
  });

  it('filtre par acteur sur une page étroite : aucune entrée d’un autre acteur', async () => {
    const t = convexTest(schema, modules);
    const { jan } = await seedJournal(t);
    const as = await seedAdmin(t);

    // Page de 1 sur 4 entrées : la plus récente de TOUTES est celle de Jan,
    // donc on prend le cas où la borne ne suffit pas à conclure et on
    // parcourt jusqu'au bout.
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
