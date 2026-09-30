// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  INVITATION_RESEND_LIMIT,
  STAFF_ALERT_EMAIL_LIMIT,
} from './organizations';
import {
  applicationDeclinedEmail,
  applicationReceivedEmail,
  staffApplicationAlertEmail,
} from './lib/membershipEmails';
import { SITE_LOCALES } from './lib/locales';

// WHO HEARS OF A MEMBERSHIP APPLICATION, AND WHEN (F-22 / F-25 / F-26).
//
// Before: staff learnt of an application only by opening the back office —
// no notification, no e-mail — and the applicant, promised an answer "par
// e-mail", got none when it was no (no account, hence no notification). This
// file holds the three messages the flow now sends, and what they must NOT
// carry: the applicant's free text to a stranger's inbox, the moderator's
// internal note to the applicant.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Every e-mail here is scheduled with `runAfter(0)` and runs once the test
// lets go of the event loop: left alone, it logs after its test has ended,
// and a log landing during the file's teardown fails the whole Vitest run (see
// convex/newsletter.test.ts). Each instance is drained before its test ends —
// before the environment is unstubbed, so that the sends still simulate.
const drains: (() => Promise<void>)[] = [];
function newConvexTest(): T {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}

// Without a provider, `sendEmail` only simulates in development mode.
beforeEach(() => vi.stubEnv('AUTH_DEV_OTP', 'true'));
afterEach(async () => {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

type T = TestConvex<typeof schema>;

async function scheduled(t: T, fn: string) {
  const rows = await t.run((ctx) =>
    ctx.db.system.query('_scheduled_functions').collect(),
  );
  return rows
    .filter((s) => s.name === `organizations:${fn}`)
    .map((s) => s.args[0] as Record<string, unknown>);
}

async function account(
  t: T,
  fields: Partial<Omit<Doc<'users'>, '_id' | '_creationTime'>>,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', fields));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

function apply(
  t: T,
  over: Partial<{
    type: 'organisation' | 'individu';
    organizationName: string;
    contactEmail: string;
    country: string;
    locale: 'fr' | 'en' | 'es' | 'pt' | 'ar';
  }> = {},
) {
  return t.mutation(internal.organizations.storeApplication, {
    type: 'organisation',
    organizationName: 'Institut Démo Sahel',
    contactEmail: 'Contact@Institut-Sahel.org',
    country: 'Sénégal',
    locale: 'fr',
    ...over,
  });
}

async function notificationsOf(t: T, userId: Id<'users'>) {
  return t.run((ctx) =>
    ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) => q.eq('userId', userId))
      .collect(),
  );
}

describe('Nouvelle candidature — l’équipe est prévenue', () => {
  it('modérateur, éditeur et admin reçoivent une notification qui mène à la file ; pas les autres', async () => {
    const t = newConvexTest();
    const staff = [
      await account(t, { role: 'moderateur', email: 'mod@dt.org' }),
      await account(t, { role: 'editeur', email: 'ed@dt.org' }),
      await account(t, { role: 'admin', email: 'admin@dt.org' }),
    ];
    const others = [
      await account(t, { role: 'membre', email: 'membre@dt.org' }),
      await account(t, { role: 'visiteur', email: 'visiteur@dt.org' }),
    ];

    await apply(t);

    for (const { id } of staff) {
      expect(await notificationsOf(t, id)).toMatchObject([
        {
          type: 'membership_application',
          titleKey: 'membershipApplicationReceived',
          params: { name: 'Institut Démo Sahel' },
          link: '/admin/candidatures',
          read: false,
        },
      ]);
    }
    for (const { id } of others) {
      expect(await notificationsOf(t, id)).toEqual([]);
    }
  });

  it('l’alerte part aussi par e-mail, une fois, dans la langue de chacun', async () => {
    const t = newConvexTest();
    await account(t, {
      role: 'moderateur',
      email: 'mod@dt.org',
      preferredLocale: 'en',
    });
    await account(t, { role: 'admin', email: 'admin@dt.org' });

    await apply(t, { type: 'individu', organizationName: 'Awa Diop' });

    expect(await scheduled(t, 'sendStaffApplicationAlert')).toEqual([
      {
        recipients: [
          { email: 'mod@dt.org', locale: 'en' },
          { email: 'admin@dt.org', locale: 'fr' },
        ],
        organizationName: 'Awa Diop',
        type: 'individu',
        country: 'Sénégal',
        pending: 1,
      },
    ]);
  });

  it('un compte suspendu n’est pas prévenu ; une adresse réservée n’est pas écrite', async () => {
    const t = newConvexTest();
    const suspended = await account(t, {
      role: 'admin',
      email: 'ancien@dt.org',
      suspendedAt: 1,
    });
    const e2e = await account(t, {
      role: 'admin',
      email: 'admin_e2e@democracytogether.test',
    });

    await apply(t);

    expect(await notificationsOf(t, suspended.id)).toEqual([]);
    // The E2E account sees it in the bell, but no e-mail goes to `.test`.
    expect(await notificationsOf(t, e2e.id)).toHaveLength(1);
    expect(await scheduled(t, 'sendStaffApplicationAlert')).toEqual([]);
  });

  it('désactivée dans le profil, l’alerte ne sonne pas et ne part pas par e-mail', async () => {
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    await mod.as.mutation(api.social.profiles.saveProfile, {
      displayName: 'Modératrice',
      handle: '',
      bio: '',
      jobTitle: '',
      country: '',
      themes: [],
      languages: [],
      links: [],
      visibility: 'members',
      messagePolicy: 'members',
      mutedNotificationTypes: ['membership_application'],
      messageEmail: false,
    });
    const admin = await account(t, { role: 'admin', email: 'admin@dt.org' });

    await apply(t);

    expect(await notificationsOf(t, mod.id)).toEqual([]);
    expect(await notificationsOf(t, admin.id)).toHaveLength(1);
    expect(await scheduled(t, 'sendStaffApplicationAlert')).toMatchObject([
      { recipients: [{ email: 'admin@dt.org', locale: 'fr' }] },
    ]);
  });

  it(`au-delà de ${STAFF_ALERT_EMAIL_LIMIT.max} par heure, les e-mails s’arrêtent ; la cloche continue`, async () => {
    const t = newConvexTest();
    const admin = await account(t, { role: 'admin', email: 'admin@dt.org' });
    const total = STAFF_ALERT_EMAIL_LIMIT.max + 2;
    for (let i = 0; i < total; i++) {
      await apply(t, {
        organizationName: `Institut ${i}`,
        contactEmail: `contact${i}@institut-sahel.org`,
      });
    }
    expect(await scheduled(t, 'sendStaffApplicationAlert')).toHaveLength(
      STAFF_ALERT_EMAIL_LIMIT.max,
    );
    expect(await notificationsOf(t, admin.id)).toHaveLength(total);
  });

  it('une candidature refusée (doublon) ne prévient personne', async () => {
    const t = newConvexTest();
    const admin = await account(t, { role: 'admin', email: 'admin@dt.org' });
    await apply(t);
    await expect(
      apply(t, { contactEmail: 'contact@institut-sahel.org' }),
    ).rejects.toThrow();

    expect(await notificationsOf(t, admin.id)).toHaveLength(1);
    expect(await scheduled(t, 'sendStaffApplicationAlert')).toHaveLength(1);
    expect(await scheduled(t, 'sendApplicationReceipt')).toHaveLength(1);
  });

  it('l’alerte planifiée part vers chaque membre de l’équipe, dans sa langue', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = newConvexTest();
    await account(t, {
      role: 'moderateur',
      email: 'mod@dt.org',
      preferredLocale: 'ar',
    });
    await account(t, { role: 'admin', email: 'admin@dt.org' });

    await apply(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const alert = (locale: 'ar' | 'fr') =>
      staffApplicationAlertEmail({
        siteUrl: 'http://localhost:3000',
        locale,
        organizationName: 'Institut Démo Sahel',
        type: 'organisation',
        country: 'Sénégal',
        pending: 1,
      }).subject;
    expect(log).toHaveBeenCalledWith(
      `[DEV EMAIL] -> mod@dt.org : ${alert('ar')}`,
    );
    expect(log).toHaveBeenCalledWith(
      `[DEV EMAIL] -> admin@dt.org : ${alert('fr')}`,
    );
  });
});

describe('Nouvelle candidature — le candidat reçoit un accusé de réception', () => {
  it('planifié vers l’adresse normalisée, dans la langue du formulaire, sans rien de ce qu’il a saisi', async () => {
    const t = newConvexTest();
    await apply(t, { locale: 'pt' });
    // Only the address and the language: the name, the country or the
    // presentation typed into a public form never reach an inbox from here.
    expect(await scheduled(t, 'sendApplicationReceipt')).toEqual([
      { email: 'contact@institut-sahel.org', locale: 'pt' },
    ]);
  });

  it('une adresse réservée (tests, exemples) n’en reçoit pas', async () => {
    const t = newConvexTest();
    await apply(t, { contactEmail: 'cand_1@democracytogether.test' });
    await apply(t, { contactEmail: 'someone@example.org' });
    expect(await scheduled(t, 'sendApplicationReceipt')).toEqual([]);
  });

  it('l’accusé part vraiment, dans sa langue', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = newConvexTest();
    await apply(t, { locale: 'es' });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const { subject } = applicationReceivedEmail({
      siteUrl: 'http://localhost:3000',
      locale: 'es',
    });
    expect(log).toHaveBeenCalledWith(
      `[DEV EMAIL] -> contact@institut-sahel.org : ${subject}`,
    );
  });
});

describe('Décision — le candidat l’apprend par e-mail', () => {
  it('un refus écrit au candidat sans compte, dans sa langue, sans la note interne', async () => {
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const applicationId = await apply(t, { locale: 'es' });

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'rejected',
      notes: 'Hors périmètre — note pour l’équipe',
    });

    expect(await scheduled(t, 'sendApplicationDecline')).toEqual([
      { email: 'contact@institut-sahel.org', locale: 'es' },
    ]);
    expect(await scheduled(t, 'sendMembershipInvitation')).toEqual([]);
  });

  it('le refus part vraiment', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const applicationId = await apply(t, { locale: 'en' });
    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'rejected',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const { subject } = applicationDeclinedEmail({
      siteUrl: 'http://localhost:3000',
      locale: 'en',
    });
    expect(log).toHaveBeenCalledWith(
      `[DEV EMAIL] -> contact@institut-sahel.org : ${subject}`,
    );
  });

  it('une approbation n’envoie pas de refus, et invite l’adresse de contact', async () => {
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const applicationId = await apply(t);
    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });
    expect(await scheduled(t, 'sendApplicationDecline')).toEqual([]);
    expect(await scheduled(t, 'sendMembershipInvitation')).toMatchObject([
      { email: 'contact@institut-sahel.org' },
    ]);
  });

  it('déposée en étant connecté, l’invitation va au compte élevé, pas au contact sans compte', async () => {
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const applicant = await account(t, {
      role: 'visiteur',
      email: 'chercheuse@univ-dakar.sn',
    });
    const applicationId = await applicant.as.mutation(
      internal.organizations.storeApplication,
      {
        type: 'organisation',
        organizationName: 'Institut X',
        contactEmail: 'contact@institut-x.org',
        country: 'Sénégal',
      },
    );

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });

    // It is THIS account that became a member, and the only one that can
    // "request a code at this address".
    expect(await scheduled(t, 'sendMembershipInvitation')).toMatchObject([
      { email: 'chercheuse@univ-dakar.sn' },
    ]);
    const elevated = await t.run((ctx) => ctx.db.get(applicant.id));
    expect(elevated?.role).toBe('membre');
  });
});

describe('Renvoyer l’invitation depuis la file', () => {
  async function approved(t: T) {
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const applicationId = await apply(t, { locale: 'pt' });
    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });
    return { mod, applicationId };
  }

  it('renvoie l’invitation d’une candidature approuvée, et le journal le trace', async () => {
    const t = newConvexTest();
    const { mod, applicationId } = await approved(t);

    const res = await mod.as.mutation(
      api.organizations.resendMembershipInvitation,
      { applicationId },
    );

    expect(res).toEqual({
      email: 'contact@institut-sahel.org',
      emailMode: 'simulated',
    });
    const invitations = await scheduled(t, 'sendMembershipInvitation');
    expect(invitations).toHaveLength(2);
    expect(invitations[1]).toMatchObject({
      applicationId,
      email: 'contact@institut-sahel.org',
      locale: 'pt',
    });
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.some(
        (a) =>
          a.action === 'membership.invitation_resent' &&
          a.actorId === mod.id &&
          a.targetId === applicationId,
      ),
    ).toBe(true);
  });

  it('refusé sur une candidature en attente ou rejetée', async () => {
    const t = newConvexTest();
    const mod = await account(t, { role: 'moderateur', email: 'mod@dt.org' });
    const pending = await apply(t);
    await expect(
      mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId: pending,
      }),
    ).rejects.toThrow(/INVALID_TRANSITION/);

    const rejected = await apply(t, { contactEmail: 'autre@institut.org' });
    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId: rejected,
      decision: 'rejected',
    });
    await expect(
      mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId: rejected,
      }),
    ).rejects.toThrow(/INVALID_TRANSITION/);
    expect(await scheduled(t, 'sendMembershipInvitation')).toEqual([]);
  });

  it('refusé à un simple membre', async () => {
    const t = newConvexTest();
    const { applicationId } = await approved(t);
    const member = await account(t, { role: 'membre', email: 'm@dt.org' });
    await expect(
      member.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId,
      }),
    ).rejects.toThrow();
    expect(await scheduled(t, 'sendMembershipInvitation')).toHaveLength(1);
  });

  it('refusé quand le compte est suspendu ou n’existe plus', async () => {
    const t = newConvexTest();
    const { mod, applicationId } = await approved(t);
    const member = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'contact@institut-sahel.org'))
        .unique(),
    );
    await t.run((ctx) => ctx.db.patch(member!._id, { suspendedAt: 1 }));
    await expect(
      mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId,
      }),
    ).rejects.toThrow(/MEMBER_SUSPENDED/);

    await t.run((ctx) => ctx.db.delete(member!._id));
    await expect(
      mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
    expect(await scheduled(t, 'sendMembershipInvitation')).toHaveLength(1);
  });

  it(`au plus ${INVITATION_RESEND_LIMIT.max} renvois par heure et par candidature`, async () => {
    const t = newConvexTest();
    const { mod, applicationId } = await approved(t);
    for (let i = 0; i < INVITATION_RESEND_LIMIT.max; i++) {
      await mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId,
      });
    }
    await expect(
      mod.as.mutation(api.organizations.resendMembershipInvitation, {
        applicationId,
      }),
    ).rejects.toThrow(/RATE_LIMITED/);
    expect(await scheduled(t, 'sendMembershipInvitation')).toHaveLength(
      1 + INVITATION_RESEND_LIMIT.max,
    );
  });
});

describe('La file montre la date de décision et celle de l’invitation', () => {
  it('reviewedAt et invitedAt sortent de listApplications', async () => {
    vi.useFakeTimers();
    const t = newConvexTest();
    const admin = await account(t, { role: 'admin', email: 'admin@dt.org' });
    const applicationId = await apply(t);
    await admin.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });

    const before = await admin.as.query(api.admin.listApplications, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(before.page[0].reviewedAt).toBeTypeOf('number');
    expect(before.page[0].invitedAt).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await admin.as.query(api.admin.listApplications, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(after.page[0].invitedAt).toBeTypeOf('number');
  });
});

describe('Contenu des e-mails de candidature', () => {
  const SITE = 'https://exemple.org/';

  it.each(SITE_LOCALES)(
    '%s : chaque lien mène dans la langue du destinataire',
    (loc) => {
      expect(
        applicationReceivedEmail({ siteUrl: SITE, locale: loc }).html,
      ).toContain(`href="https://exemple.org/${loc}/le-reseau"`);
      expect(
        applicationDeclinedEmail({ siteUrl: SITE, locale: loc }).html,
      ).toContain(`href="https://exemple.org/${loc}/contact"`);
      const alert = staffApplicationAlertEmail({
        siteUrl: SITE,
        locale: loc,
        organizationName: 'Institut X',
        type: 'individu',
        country: 'Mali',
        pending: 4,
      });
      expect(alert.html).toContain(
        `href="https://exemple.org/${loc}/admin/candidatures"`,
      );
      expect(alert.html).toContain('Institut X');
      expect(alert.html).toContain('>4<');
    },
  );

  it('dans l’alerte, le nom saisi est échappé, et le sujet tient sur une ligne', () => {
    const { subject, html } = staffApplicationAlertEmail({
      siteUrl: SITE,
      locale: 'fr',
      organizationName: '<img src=x onerror=alert(1)>\r\nBcc: x@y.org',
      type: 'organisation',
      country: '<b>Mali</b>',
      pending: 1,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Mali&lt;/b&gt;');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('dans le sujet, `$&` reste du texte, et un nom trop long est coupé', () => {
    const special = staffApplicationAlertEmail({
      siteUrl: SITE,
      locale: 'en',
      organizationName: "A $& B $' C",
      type: 'organisation',
      country: 'Mali',
      pending: 1,
    });
    expect(special.subject).toContain("A $& B $' C");

    const long = staffApplicationAlertEmail({
      siteUrl: SITE,
      locale: 'en',
      organizationName: 'X'.repeat(120),
      type: 'organisation',
      country: 'Mali',
      pending: 1,
    });
    expect(long.subject).toContain(`${'X'.repeat(59)}…`);
    expect(long.subject).not.toContain('X'.repeat(60));
  });
});
