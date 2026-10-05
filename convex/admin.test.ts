// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
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

// Pagination: `listUsers` takes `paginationOpts` since issue #8, and
// `listApplications` since issue #49 — it was the last back-office list
// to load its whole table. A wide page is enough here: what
// is checked is not the slicing (see pagination.test.ts) but RBAC and
// the content.
const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

describe('Back-office — RBAC des queries (F-26/F-61/F-63)', () => {
  it('dashboard+candidatures = modérateur+ ; utilisateurs = admin', async () => {
    const t = newConvexTest();
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
    const t = newConvexTest();
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

    // Dashboard counters are maintained ON WRITE (issue #8):
    // `storeApplication` increments them, but the direct insertion of the
    // admin account above bypasses the mutations. `counters.recompute` is
    // precisely the reconciliation intended for this case — and for bootstrapping
    // a deployment that existed before the counters.
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

// The back office displayed "membre" for an account WITHOUT an explicit role,
// whereas server RBAC treats the absence of a role as "visiteur"
// (issue #27). The screen where the administrator decides who has access to what thus
// announced a submission right that the server refuses — and since the
// <Select> of /admin/utilisateurs is controlled on this value, touching
// nothing left the account without a role without the gap showing.
//
// The case persists on existing data: since PR #4 `reviewApplication` and
// `inviteUser` always set a role, but accounts created before do not
// carry a `role` column.
describe('Back-office — rôle affiché (F-63)', () => {
  it('listUsers : un compte sans rôle remonte « visiteur », pas « membre »', async () => {
    const t = newConvexTest();
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    // Legacy account: no `role` column.
    await t.run((ctx) => ctx.db.insert('users', { email: 'ancien@test.org' }));

    const { page: users } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, PAGE);

    const legacy = users.find((u) => u.email === 'ancien@test.org');
    expect(legacy?.role).toBe('visiteur');
    // …and it is indeed the shared derivation that is displayed, not a copied
    // literal: if the default value moves, both move together.
    expect(legacy?.role).toBe(effectiveRole(undefined));
    expect(legacy?.role).toBe(DEFAULT_ROLE);
  });

  it("le compte sans rôle est bien refusé par le serveur : l'écran ne ment plus", async () => {
    const t = newConvexTest();
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'admin@test.org' }),
    );
    const legacyId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'ancien@test.org' }),
    );

    // What "visiteur" concretely means: the Tribune refuses the pen
    // (requireNetworkRole(ctx, 'membre')) — valid arguments, so it is indeed
    // the role guard that rejects, not field validation.
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

    // …and that is exactly what the back office now displays.
    const { page: users } = await t
      .withIdentity({ subject: `${adminId}|s` })
      .query(api.admin.listUsers, PAGE);
    expect(users.find((u) => u.email === 'ancien@test.org')?.role).toBe(
      'visiteur',
    );
  });
});

// THE ACCOUNT THAT APPROVAL WILL ELEVATE (pentest M-6, left "unverified").
//
// The replay confirms the described mechanism: approving an application does not grant
// a role to `contactEmail` — an address freely typed into a public
// form — but to the SIGNED-IN account that submitted the request. The two are
// independent. This is not a defect: without this link, a member would
// never get their membership. The defect was that the moderation queue
// carried NO field designating this account: the moderator judged a plausible
// organization name and elevated, without seeing it, an arbitrary account.
//
// The first two hold what the screen SAYS before the decision — the field
// did not exist, they fail on the previous code. The third pins what
// the decision DOES: it already passed, and that is the point — it prevents anyone
// "fixing" M-6 by unlinking the application from its submitter, which would deprive
// members of their membership to silence a symptom.
describe('Back-office — candidatures : le compte lié est nommé (pentest M-6)', () => {
  async function candidatureDeposeePar(
    t: TestConvex<typeof schema>,
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
    const t = newConvexTest();
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

    // NON-VACUITY: the application is indeed linked in the database — otherwise the test
    // would only check that a null field is null.
    const enBase = await t.run((ctx) =>
      ctx.db.query('membershipApplications').first(),
    );
    expect(enBase?.applicantUserId).toBe(deposant);

    expect(page).toHaveLength(1);
    expect(page[0].applicantEmail).toBe('attaquant@mail-jetable.test');
    expect(page[0].applicantRole).toBe('visiteur');
    // This is the gap that shows: the front-facing address stays displayed
    // as-is, and the screen flags that it is not the account's.
    expect(page[0].contactEmail).toBe('contact@institut-x.org');
    expect(page[0].applicantEmail).not.toBe(page[0].contactEmail);
  });

  it('une candidature anonyme remonte un compte NUL, pas le contact', async () => {
    const t = newConvexTest();
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    // Submitted without a session: the membership form is open.
    await t.mutation(internal.organizations.storeApplication, {
      type: 'organisation',
      organizationName: 'Institut Y',
      contactEmail: 'contact@institut-y.org',
      country: 'Sénégal',
    });

    const { page } = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.admin.listApplications, { ...PAGE, status: 'pending' });

    // Nothing to elevate: the field must above all not FALL BACK to
    // `contactEmail`, which would suggest an account that does not exist.
    expect(page[0].applicantEmail).toBeNull();
    expect(page[0].applicantRole).toBeNull();
  });

  it("approuver élève le compte déposant — pas l'adresse de contact", async () => {
    const t = newConvexTest();
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

    // What the decision did, in one sentence: it is the submitter's account
    // that becomes a member, and no account is created for the displayed address.
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
