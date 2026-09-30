// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';

// GOING BACK ON A MEMBERSHIP DECISION (F-22 / F-26, issue #9).
//
// A rejected application could never be rescued, an approved one never
// reconsidered: `reviewApplication` refused any second decision, and nothing
// else existed — the rejection dialog even said the decision was final. Staff
// can now put a decision back under review (`reopenApplication`), then decide
// again. What this file holds:
//   - both ways round: rescued then approved, reconsidered then rejected;
//   - going back on an approval takes back what it granted — the `membre`
//     role it gave, the directory entry it published — and nothing more;
//   - approving again restores that same entry, without a duplicate;
//   - the confirmation (`reopenImpact`) announces what the mutation does.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = TestConvex<typeof schema>;

// Every test here schedules e-mails with `runAfter(0)` (receipt, staff alert,
// invitation, decline, colleague welcome). Fake timers from the start, and
// each instance drained before its test ends, while the environment still
// simulates the sends: nothing runs on a real timer once the test is over
// (see convex/membership-notifications.test.ts).
const drains: (() => Promise<void>)[] = [];
function newConvexTest(): T {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}

beforeEach(() => {
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  vi.useFakeTimers();
});
afterEach(async () => {
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  }
});

const CONTACT = 'contact@institut-sahel.org';

const DIRECTORY = {
  countryCode: 'SN',
  region: 'afrique-ouest',
  themes: ['gouvernance', 'elections'],
  languages: ['fr'],
};

async function account(
  t: T,
  fields: Partial<Omit<Doc<'users'>, '_id' | '_creationTime'>>,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', fields));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const moderator = (t: T) =>
  account(t, { role: 'moderateur', email: 'mod@dt.org' });

type ApplicationInput = {
  type: 'organisation' | 'individu';
  organizationName: string;
  contactEmail: string;
  country: string;
};

// An application, anonymous — or submitted by `by`, signed in.
function apply(
  t: T,
  over: Partial<ApplicationInput> = {},
  by?: { as: ReturnType<T['withIdentity']> },
) {
  return (by?.as ?? t).mutation(internal.organizations.storeApplication, {
    type: 'organisation',
    organizationName: 'Institut Démo Sahel',
    contactEmail: CONTACT,
    country: 'Sénégal',
    ...over,
  });
}

type Moderator = Awaited<ReturnType<typeof moderator>>;

function decide(
  mod: Moderator,
  applicationId: Id<'membershipApplications'>,
  decision: 'approved' | 'rejected',
  extra: { notes?: string; directory?: typeof DIRECTORY } = {},
) {
  return mod.as.mutation(api.organizations.reviewApplication, {
    applicationId,
    decision,
    ...extra,
  });
}

function reopen(mod: Moderator, applicationId: Id<'membershipApplications'>) {
  return mod.as.mutation(api.organizations.reopenApplication, {
    applicationId,
  });
}

const application = (t: T, id: Id<'membershipApplications'>) =>
  t.run((ctx) => ctx.db.get(id));

const userByEmail = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique(),
  );

const all = <
  Table extends 'users' | 'organizations' | 'organizationMemberships',
>(
  t: T,
  table: Table,
) => t.run((ctx) => ctx.db.query(table).collect());

async function auditOf(t: T, action: string) {
  const rows = await t.run((ctx) => ctx.db.query('auditLog').collect());
  return rows.filter((r) => r.action === action);
}

async function scheduled(t: T, fn: string) {
  const rows = await t.run((ctx) =>
    ctx.db.system.query('_scheduled_functions').collect(),
  );
  return rows
    .filter((s) => s.name === `organizations:${fn}`)
    .map((s) => s.args[0] as Record<string, unknown>);
}

describe('Repêcher une candidature rejetée', () => {
  it('la remet en attente, tracée, puis l’approuve comme une première fois', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'rejected', { notes: 'Hors périmètre.' });

    expect(await reopen(mod, applicationId)).toEqual({
      roleWithdrawn: false,
      organizationSuspended: false,
      // Anonymous applicant: no account to tell before the new decision.
      accountNotified: false,
    });

    const reopened = await application(t, applicationId);
    expect(reopened?.status).toBe('pending');
    expect(reopened?.reopenedFrom).toBe('rejected');
    expect(reopened?.reopenedAt).toBeTypeOf('number');
    // The note says why it had been turned down: it stays in sight.
    expect(reopened?.reviewNotes).toBe('Hors périmètre.');
    const stats = await mod.as.query(api.admin.dashboardStats, {});
    expect(stats.pendingApplications).toBe(1);
    expect(await auditOf(t, 'membership.reopened')).toMatchObject([
      {
        actorId: mod.id,
        targetId: applicationId,
        metadata: { from: 'rejected', roleWithdrawn: false },
      },
    ]);

    // Decided again, like any application: account, entry, link, invitation.
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    expect((await application(t, applicationId))?.status).toBe('approved');
    expect((await userByEmail(t, CONTACT))?.role).toBe('membre');
    const orgs = await all(t, 'organizations');
    expect(orgs).toHaveLength(1);
    expect(orgs[0].status).toBe('active');
    expect(await all(t, 'organizationMemberships')).toHaveLength(1);
    expect(await scheduled(t, 'sendMembershipInvitation')).toHaveLength(1);
  });

  it('le compte qui avait déposé la candidature en est prévenu', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicant = await account(t, {
      role: 'visiteur',
      email: 'chercheuse@univ-dakar.sn',
    });
    const applicationId = await apply(
      t,
      { contactEmail: 'chercheuse@univ-dakar.sn' },
      applicant,
    );
    await decide(mod, applicationId, 'rejected');

    expect((await reopen(mod, applicationId)).accountNotified).toBe(true);
    const told = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', applicant.id))
        .collect(),
    );
    // Told of the refusal, then that it no longer holds.
    expect(told.map((n) => n.titleKey)).toEqual([
      'membershipRejected',
      'membershipReopened',
    ]);
  });

  it('refuse de rouvrir ce qui attend déjà une décision', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await expect(reopen(mod, applicationId)).rejects.toThrow(
      /INVALID_TRANSITION/,
    );

    await decide(mod, applicationId, 'rejected');
    await reopen(mod, applicationId);
    // A second click on "Remettre en étude" replays nothing.
    await expect(reopen(mod, applicationId)).rejects.toThrow(
      /INVALID_TRANSITION/,
    );
    expect(await auditOf(t, 'membership.reopened')).toHaveLength(1);
  });

  it('refuse quand la même adresse a déposé une nouvelle candidature depuis', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const first = await apply(t);
    await decide(mod, first, 'rejected');
    // Turned down, the applicant applied again.
    await apply(t, { contactEmail: 'Contact@Institut-Sahel.org' });

    await expect(reopen(mod, first)).rejects.toThrow(/DUPLICATE_APPLICATION/);
    expect((await application(t, first))?.status).toBe('rejected');
    expect(await auditOf(t, 'membership.reopened')).toHaveLength(0);
  });

  it('une décision ne se rejoue toujours pas sans passer par la remise en étude', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'rejected');
    await expect(
      decide(mod, applicationId, 'approved', { directory: DIRECTORY }),
    ).rejects.toThrow(/ALREADY_REVIEWED/);
    expect(await all(t, 'organizations')).toHaveLength(0);
  });
});

describe('Remettre en étude une candidature approuvée', () => {
  it('retire le rôle de membre et sort la fiche de l’annuaire, puis la rejette', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    // The invitation leaves, and is stamped.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await application(t, applicationId))?.invitedAt).toBeTypeOf(
      'number',
    );

    const member = (await userByEmail(t, CONTACT))!;
    const [org] = await all(t, 'organizations');
    expect(member.role).toBe('membre');
    expect(
      (await t.query(api.organizations.listDirectory, {})).items,
    ).toHaveLength(1);

    expect(await reopen(mod, applicationId)).toEqual({
      roleWithdrawn: true,
      organizationSuspended: true,
      accountNotified: true,
    });

    // While it is under review, the applicant is no member — and the account
    // told of the approval hears that it is being reconsidered.
    expect((await userByEmail(t, CONTACT))?.role).toBe('visiteur');
    const told = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', member._id))
        .collect(),
    );
    expect(told.map((n) => [n.titleKey, n.link])).toEqual([
      ['membershipApproved', '/espace-membre'],
      ['membershipReopened', '/adhesion'],
    ]);
    expect((await t.run((ctx) => ctx.db.get(org._id)))?.status).toBe(
      'suspended',
    );
    expect(
      (await t.query(api.organizations.listDirectory, {})).items,
    ).toHaveLength(0);
    expect(
      await t.query(api.organizations.getBySlug, { slug: org.slug }),
    ).toBeNull();
    const stats = await mod.as.query(api.admin.dashboardStats, {});
    expect(stats.activeMembers).toBe(0);
    expect(stats.pendingApplications).toBe(1);
    // The invitation belonged to that approval.
    const reopened = await application(t, applicationId);
    expect(reopened?.invitedAt).toBeUndefined();
    expect(reopened?.reopenedFrom).toBe('approved');

    // Traced: the role change on the account, the reopening on the file.
    expect(await auditOf(t, 'user.role_changed')).toContainEqual(
      expect.objectContaining({
        actorId: mod.id,
        targetId: member._id,
        metadata: { role: 'visiteur', via: 'membership' },
      }),
    );
    expect(await auditOf(t, 'membership.reopened')).toMatchObject([
      {
        targetId: applicationId,
        metadata: {
          from: 'approved',
          roleWithdrawn: true,
          organizationSuspended: org._id,
        },
      },
    ]);
    // Nothing is deleted: the account and the manager's link stay.
    expect(await all(t, 'users')).toHaveLength(2);
    expect(await all(t, 'organizationMemberships')).toHaveLength(1);

    // Then rejected: the usual decline, and the account that had been made
    // a member hears of it in the app too.
    await decide(mod, applicationId, 'rejected');
    expect(await scheduled(t, 'sendApplicationDecline')).toMatchObject([
      { email: CONTACT },
    ]);
    const notifications = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', member._id))
        .collect(),
    );
    expect(notifications.map((n) => n.titleKey)).toContain(
      'membershipRejected',
    );
    expect((await userByEmail(t, CONTACT))?.role).toBe('visiteur');
    expect((await t.run((ctx) => ctx.db.get(org._id)))?.status).toBe(
      'suspended',
    );
  });

  it('approuver de nouveau rétablit la même fiche, sans doublon', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    const [org] = await all(t, 'organizations');
    await reopen(mod, applicationId);

    // No directory fields this time: the entry already has them.
    const res = await decide(mod, applicationId, 'approved');
    expect(res).toEqual({ userCreated: false, organizationId: org._id });

    const orgs = await all(t, 'organizations');
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ slug: org.slug, status: 'active' });
    expect(await all(t, 'organizationMemberships')).toHaveLength(1);
    expect(await all(t, 'users')).toHaveLength(2);
    expect((await userByEmail(t, CONTACT))?.role).toBe('membre');
    const stats = await mod.as.query(api.admin.dashboardStats, {});
    expect(stats.activeMembers).toBe(1);
    expect(stats.pendingApplications).toBe(0);
    // The applicant is told again: their access is back.
    expect(await scheduled(t, 'sendMembershipInvitation')).toHaveLength(2);
    expect(await auditOf(t, 'membership.reviewed')).toContainEqual(
      expect.objectContaining({
        metadata: { decision: 'approved', organizationReinstated: true },
      }),
    );
    expect(await auditOf(t, 'organization.created')).toHaveLength(1);
  });

  it('une fiche approuvée sans champs d’annuaire revient « à compléter »', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved');
    const [org] = await all(t, 'organizations');
    expect(org.status).toBe('pending');

    await reopen(mod, applicationId);
    expect((await t.run((ctx) => ctx.db.get(org._id)))?.status).toBe(
      'suspended',
    );
    await decide(mod, applicationId, 'approved');
    // Back to "to be completed", never published on its own.
    expect((await t.run((ctx) => ctx.db.get(org._id)))?.status).toBe('pending');
    expect(
      (await t.query(api.organizations.listDirectory, {})).items,
    ).toHaveLength(0);
  });

  it('les champs saisis à la nouvelle approbation remplacent ceux de la fiche', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved');
    await reopen(mod, applicationId);
    await decide(mod, applicationId, 'approved', {
      directory: { ...DIRECTORY, countryCode: 'ml', themes: ['elections'] },
    });
    const [org] = await all(t, 'organizations');
    expect(org).toMatchObject({
      status: 'active',
      country: 'ML',
      region: 'afrique-ouest',
      themes: ['elections'],
    });
  });

  it('une candidature individuelle : seul le rôle est retiré', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t, {
      type: 'individu',
      organizationName: 'Awa Diop',
      contactEmail: 'awa@univ-dakar.sn',
    });
    await decide(mod, applicationId, 'approved');
    expect(await reopen(mod, applicationId)).toEqual({
      roleWithdrawn: true,
      organizationSuspended: false,
      accountNotified: true,
    });
    expect((await userByEmail(t, 'awa@univ-dakar.sn'))?.role).toBe('visiteur');
    await decide(mod, applicationId, 'approved');
    expect((await userByEmail(t, 'awa@univ-dakar.sn'))?.role).toBe('membre');
    expect(await all(t, 'organizations')).toHaveLength(0);
  });
});

describe('Ce qu’une remise en étude ne retire pas', () => {
  it('un compte déjà membre avant sa candidature garde son rôle', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicant = await account(t, {
      role: 'membre',
      email: 'chercheuse@univ-dakar.sn',
    });
    const applicationId = await apply(
      t,
      { contactEmail: 'chercheuse@univ-dakar.sn' },
      applicant,
    );
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    expect((await application(t, applicationId))?.roleRaised).toBe(false);

    const res = await reopen(mod, applicationId);
    expect(res.roleWithdrawn).toBe(false);
    // The entry leaves the directory all the same: the approval made it.
    expect(res.organizationSuspended).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(applicant.id)))?.role).toBe(
      'membre',
    );
  });

  it('un rôle d’encadrement donné depuis reste en place', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    const member = (await userByEmail(t, CONTACT))!;
    // An administrator's later choice.
    await t.run((ctx) => ctx.db.patch(member._id, { role: 'editeur' }));

    expect((await reopen(mod, applicationId)).roleWithdrawn).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(member._id)))?.role).toBe(
      'editeur',
    );
  });

  it('un compte membre par une autre organisation garde son rôle', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const researcher = await account(t, {
      role: 'visiteur',
      email: 'awa@univ-dakar.sn',
    });
    // Approved as an individual: the approval raises the account...
    const individual = await apply(
      t,
      {
        type: 'individu',
        organizationName: 'Awa Diop',
        contactEmail: 'awa@univ-dakar.sn',
      },
      researcher,
    );
    await decide(mod, individual, 'approved');
    expect((await application(t, individual))?.roleRaised).toBe(true);
    // ...then approved for the think tank she runs.
    const thinkTank = await apply(
      t,
      { contactEmail: 'awa@univ-dakar.sn' },
      researcher,
    );
    await decide(mod, thinkTank, 'approved', { directory: DIRECTORY });

    // Taking the FIRST approval back leaves her a member: the think tank's
    // approval stands.
    expect((await reopen(mod, individual)).roleWithdrawn).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(researcher.id)))?.role).toBe(
      'membre',
    );
  });

  it('une approbation antérieure au suivi retire le rôle d’un compte resté simple membre', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    // An approval recorded before `memberUserId` / `roleRaised` existed.
    await t.run((ctx) =>
      ctx.db.patch(applicationId, {
        memberUserId: undefined,
        roleRaised: undefined,
      }),
    );

    expect((await reopen(mod, applicationId)).roleWithdrawn).toBe(true);
    expect((await userByEmail(t, CONTACT))?.role).toBe('visiteur');
  });
});

describe('La confirmation annonce ce que fait le serveur', () => {
  it('nomme le compte, la fiche et les collègues qui gardent leur rôle', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    const [org] = await all(t, 'organizations');
    const member = (await userByEmail(t, CONTACT))!;
    // The manager attached a colleague, who became a member through the entry.
    await t
      .withIdentity({ subject: `${member._id}|s` })
      .mutation(api.orgAdmin.inviteColleague, {
        orgId: org._id,
        email: 'collegue@institut-sahel.org',
      });

    const impact = await mod.as.query(api.organizations.reopenImpact, {
      applicationId,
    });
    expect(impact).toEqual({
      member: { email: CONTACT, role: 'membre', losesRole: true },
      organization: { name: 'Institut Démo Sahel' },
      colleagues: ['collegue@institut-sahel.org'],
      colleaguesTotal: 1,
    });

    // What was announced is what happens — and the colleague keeps their role.
    expect(await reopen(mod, applicationId)).toEqual({
      roleWithdrawn: true,
      organizationSuspended: true,
      accountNotified: true,
    });
    expect((await userByEmail(t, 'collegue@institut-sahel.org'))?.role).toBe(
      'membre',
    );
    // Nothing left to take back once it is under review.
    expect(
      await mod.as.query(api.organizations.reopenImpact, { applicationId }),
    ).toBeNull();
  });

  it('réservées à l’équipe, comme la décision', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    const member = await account(t, { role: 'membre', email: 'm@dt.org' });

    await expect(
      member.as.query(api.organizations.reopenImpact, { applicationId }),
    ).rejects.toThrow(/Accès refusé/);
    await expect(
      member.as.mutation(api.organizations.reopenApplication, {
        applicationId,
      }),
    ).rejects.toThrow(/Accès refusé/);
    expect((await application(t, applicationId))?.status).toBe('approved');
  });
});

describe('Une fiche suspendue ne se gère plus', () => {
  it('ni invitation, ni révision, ni logo — pas même pour son responsable', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    const [org] = await all(t, 'organizations');
    const manager = t.withIdentity({
      subject: `${(await userByEmail(t, CONTACT))!._id}|s`,
    });
    await manager.mutation(api.orgAdmin.inviteColleague, {
      orgId: org._id,
      email: 'collegue@institut-sahel.org',
    });
    await reopen(mod, applicationId);

    // Otherwise the manager would go on handing out the `membre` role.
    await expect(
      manager.mutation(api.orgAdmin.inviteColleague, {
        orgId: org._id,
        email: 'complice@mail-jetable.test',
      }),
    ).rejects.toThrow(/ORG_SUSPENDED/);
    expect(await userByEmail(t, 'complice@mail-jetable.test')).toBeNull();
    await expect(
      manager.mutation(api.orgAdmin.submitRevision, {
        orgId: org._id,
        fields: {
          name: 'Institut Démo Sahel',
          country: 'SN',
          region: 'afrique-ouest',
          themes: ['gouvernance'],
          languages: ['fr'],
          showMembers: false,
        },
      }),
    ).rejects.toThrow(/ORG_SUSPENDED/);
    await expect(
      manager.mutation(api.orgAdmin.generateLogoUploadUrl, { orgId: org._id }),
    ).rejects.toThrow(/ORG_SUSPENDED/);

    // Its member area says so; leaving it stays possible.
    expect(await manager.query(api.orgAdmin.myOrganizations, {})).toMatchObject(
      [{ orgId: org._id, status: 'suspended', orgRole: 'owner' }],
    );
    const colleague = (await userByEmail(t, 'collegue@institut-sahel.org'))!;
    await t
      .withIdentity({ subject: `${colleague._id}|s` })
      .mutation(api.orgAdmin.removeMember, {
        orgId: org._id,
        userId: colleague._id,
      });
    expect(await all(t, 'organizationMemberships')).toHaveLength(1);
  });
});

describe('La file montre la remise en étude', () => {
  it('date, décision précédente, compte concerné et fiche existante', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    const applicationId = await apply(t);
    await decide(mod, applicationId, 'approved', { directory: DIRECTORY });
    await reopen(mod, applicationId);

    const { page } = await mod.as.query(api.admin.listApplications, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({
      _id: applicationId,
      status: 'pending',
      reopenedFrom: 'approved',
      organizationStatus: 'suspended',
      invitedAt: null,
      // Anonymous application: the account a new approval will raise again
      // is the one the first approval opened for the contact address.
      applicantEmail: CONTACT,
      applicantRole: 'visiteur',
    });
    expect(page[0].reopenedAt).toBeTypeOf('number');
  });

  it('une candidature jamais décidée n’a ni remise en étude ni fiche', async () => {
    const t = newConvexTest();
    const mod = await moderator(t);
    await apply(t);
    const { page } = await mod.as.query(api.admin.listApplications, {
      status: 'pending',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page[0]).toMatchObject({
      reopenedAt: null,
      reopenedFrom: null,
      organizationStatus: null,
      applicantEmail: null,
    });
  });
});
