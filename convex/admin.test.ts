// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { effectiveRole, DEFAULT_ROLE } from './lib/roles';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Pagination : `listUsers` prend `paginationOpts` depuis l'issue #8, et
// `listApplications` depuis l'issue #49 — c'était la dernière liste du
// back-office à charger sa table entière. Une page large suffit ici : ce qui
// est vérifié n'est pas le découpage (cf. pagination.test.ts) mais le RBAC et
// le contenu.
const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

describe('Back-office — RBAC des queries (F-26/F-61/F-63)', () => {
  it('dashboard+candidatures = modérateur+ ; utilisateurs = admin', async () => {
    const t = convexTest(schema, modules);
    const membreId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );

    const asMembre = t.withIdentity({ subject: `${membreId}|s` });
    await expect(
      asMembre.query(api.admin.dashboardStats, {}),
    ).rejects.toThrow();
    await expect(
      asMembre.query(api.admin.listApplications, PAGE),
    ).rejects.toThrow();
    await expect(asMembre.query(api.admin.listUsers, PAGE)).rejects.toThrow();

    const asMod = t.withIdentity({ subject: `${modId}|s` });
    await asMod.query(api.admin.dashboardStats, {});
    await asMod.query(api.admin.listApplications, PAGE);
    await expect(asMod.query(api.admin.listUsers, PAGE)).rejects.toThrow();

    const { page: users } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, PAGE);
    expect(users.length).toBe(3);
  });

  it('dashboardStats compte les candidatures en attente (F-61)', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut A',
      contactEmail: 'a@demo.org',
      country: 'SN',
    });
    await t.mutation(internal.organizations.storeApplication, {
      type: 'individu',
      organizationName: 'Awa Diop',
      contactEmail: 'b@demo.org',
      country: 'FR',
    });

    // Les compteurs du tableau de bord sont tenus À L'ÉCRITURE (issue #8) :
    // `storeApplication` les incrémente, mais l'insertion directe du compte
    // admin ci-dessus passe à côté des mutations. `counters.recompute` est
    // précisément la réconciliation prévue pour ce cas — et pour l'amorçage
    // d'un déploiement qui existait avant les compteurs.
    await t.mutation(internal.counters.recompute, {});

    const stats = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.dashboardStats, {});
    expect(stats.pendingApplications).toBe(2);
    expect(stats.totalApplications).toBe(2);
    expect(stats.totalUsers).toBe(1);

    const { page: pending } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listApplications, { ...PAGE, status: 'pending' });
    expect(pending.map((a) => a.organizationName).sort()).toEqual([
      'Awa Diop',
      'Institut A',
    ]);
  });
});

// Le back-office affichait « membre » pour un compte SANS rôle explicite,
// alors que le RBAC serveur traite l'absence de rôle comme « visiteur »
// (issue #27). L'écran où l'administrateur décide qui a accès à quoi lui
// annonçait donc un droit de dépôt que le serveur refuse — et comme le
// <Select> de /admin/utilisateurs est contrôlé sur cette valeur, ne rien
// toucher laissait le compte sans rôle sans que l'écart se voie.
//
// Le cas subsiste sur l'existant : depuis la PR #4 `reviewApplication` et
// `inviteUser` posent toujours un rôle, mais les comptes créés avant ne
// portent pas de colonne `role`.
describe('Back-office — rôle affiché (F-63)', () => {
  it('listUsers : un compte sans rôle remonte « visiteur », pas « membre »', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    // Compte hérité : aucune colonne `role`.
    await t.run((ctx) => ctx.db.insert('users', { email: 'ancien@test.org' }));

    const { page: users } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, PAGE);

    const legacy = users.find((u) => u.email === 'ancien@test.org');
    expect(legacy?.role).toBe('visiteur');
    // …et c'est bien la dérivation partagée qui est affichée, pas un littéral
    // recopié : si la valeur par défaut bouge, les deux bougent ensemble.
    expect(legacy?.role).toBe(effectiveRole(undefined));
    expect(legacy?.role).toBe(DEFAULT_ROLE);
  });

  it("le compte sans rôle est bien refusé par le serveur : l'écran ne ment plus", async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    const legacyId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'ancien@test.org' }),
    );

    // Ce que « visiteur » signifie concrètement : la Tribune refuse la plume
    // (requireNetworkRole(ctx, 'membre')) — arguments valides, donc c'est bien
    // la garde de rôle qui rejette, pas la validation des champs.
    await expect(
      t
        .withIdentity({ subject: `${legacyId}|s` })
        .mutation(api.tribune.createPost, {
          theme: 'transitions',
          format: 'court',
          lang: 'fr',
          title: 'Sur les transitions',
          body: 'Une contribution courte mais valable.',
        }),
    ).rejects.toThrow(/rôle/);

    // …et c'est exactement ce que le back-office affiche désormais.
    const { page: users } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, PAGE);
    expect(users.find((u) => u.email === 'ancien@test.org')?.role).toBe(
      'visiteur',
    );
  });
});

// LE COMPTE QUE L'APPROBATION VA ÉLEVER (pentest M-6, resté « non vérifié »).
//
// Le rejeu confirme le mécanisme décrit : approuver une candidature n'accorde
// pas un rôle à `contactEmail` — adresse saisie librement dans un formulaire
// public — mais au compte CONNECTÉ qui a déposé la demande. Les deux sont
// indépendants. Ce n'est pas un défaut : sans cette liaison, un membre ne
// récupérerait jamais son adhésion. Le défaut était que la file de modération
// ne portait AUCUN champ désignant ce compte : le modérateur jugeait un nom
// d'organisation plausible et élevait, sans le voir, un compte quelconque.
//
// Les deux premiers tiennent ce que l'écran DIT avant la décision — le champ
// n'existait pas, ils échouent sur le code d'avant. Le troisième fixe ce que
// la décision FAIT : il passait déjà, et c'est le but — il empêche qu'on
// « corrige » M-6 en déliant la candidature de son déposant, ce qui priverait
// les membres de leur adhésion pour faire taire un symptôme.
describe('Back-office — candidatures : le compte lié est nommé (pentest M-6)', () => {
  async function candidatureDeposeePar(
    t: ReturnType<typeof convexTest>,
    email: string,
    contactEmail: string,
  ) {
    const userId = await t.run((ctx) =>
      ctx.db.insert('users', { email, role: 'visiteur' }),
    );
    await t
      .withIdentity({ subject: `${userId}|s` })
      .mutation(internal.organizations.storeApplication, {
        type: 'organisation',
        organizationName: 'Institut X pour la gouvernance',
        contactEmail,
        country: 'Belgique',
      });
    return userId;
  }

  it('listApplications expose le compte déposant, et sa DISCORDANCE avec le contact', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const deposant = await candidatureDeposeePar(
      t,
      'attaquant@mail-jetable.test',
      'contact@institut-x.org',
    );

    const { page } = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.admin.listApplications, { ...PAGE, status: 'pending' });

    // NON-VACUITÉ : la candidature est bien liée en base — sans quoi le test
    // vérifierait seulement qu'un champ nul est nul.
    const enBase = await t.run((ctx) =>
      ctx.db.query('membershipApplications').first(),
    );
    expect(enBase?.applicantUserId).toBe(deposant);

    expect(page).toHaveLength(1);
    expect(page[0].applicantEmail).toBe('attaquant@mail-jetable.test');
    expect(page[0].applicantRole).toBe('visiteur');
    // C'est l'écart qui se voit : l'adresse de façade reste affichée telle
    // quelle, et l'écran signale qu'elle n'est pas celle du compte.
    expect(page[0].contactEmail).toBe('contact@institut-x.org');
    expect(page[0].applicantEmail).not.toBe(page[0].contactEmail);
  });

  it('une candidature anonyme remonte un compte NUL, pas le contact', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    // Déposée sans session : le formulaire d'adhésion est ouvert.
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut Y',
      contactEmail: 'contact@institut-y.org',
      country: 'Sénégal',
    });

    const { page } = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.admin.listApplications, { ...PAGE, status: 'pending' });

    // Rien à élever : le champ ne doit surtout pas se REPLIER sur
    // `contactEmail`, ce qui ferait croire à un compte qui n'existe pas.
    expect(page[0].applicantEmail).toBeNull();
    expect(page[0].applicantRole).toBeNull();
  });

  it("approuver élève le compte déposant — pas l'adresse de contact", async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const deposant = await candidatureDeposeePar(
      t,
      'attaquant@mail-jetable.test',
      'contact@institut-x.org',
    );
    const candidature = await t.run((ctx) =>
      ctx.db.query('membershipApplications').first(),
    );

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.organizations.reviewApplication, {
        applicationId: candidature!._id,
        decision: 'approved',
        directory: {
          countryCode: 'BE',
          region: 'europe-ouest',
          themes: ['gouvernance'],
          languages: ['fr'],
        },
      });

    // Ce que la décision a fait, en une phrase : c'est le compte du déposant
    // qui devient membre, et aucun compte n'est créé pour l'adresse affichée.
    expect(await t.run((ctx) => ctx.db.get(deposant))).toMatchObject({
      role: 'membre',
    });
    const compteFaçade = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'contact@institut-x.org'))
        .first(),
    );
    expect(compteFaçade).toBeNull();
  });
});
