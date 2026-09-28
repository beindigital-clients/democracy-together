// @vitest-environment edge-runtime
import { describe, it, expect, vi } from 'vitest';
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

// Audit blocker no. 1 (§ 1, F-01 + F-22): since self-registration was
// removed, approving an application only promoted ALREADY existing accounts.
// An approved think tank that had never created an account could therefore
// NEVER sign in (code sign-in refuses an unknown e-mail, see the
// createOrUpdateUser callback in convex/auth.ts), and its profile never
// appeared in the directory (approval created no organisation).
//
// Approval must now: create the account, create the organisation, create the
// affiliation, and notify the applicant.

const DIRECTORY = {
  countryCode: 'SN',
  region: 'afrique-ouest',
  themes: ['gouvernance', 'elections'],
  languages: ['fr'],
};

async function moderator(t: ReturnType<typeof convexTest>) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function applicationFrom(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  return await t.mutation(internal.organizations.storeApplication, {
    type: 'organisation',
    organizationName: 'Institut Démo Sahel',
    contactEmail: 'Contact@Institut-Sahel.org',
    country: 'Sénégal',
    message: 'Nous souhaitons rejoindre le réseau.',
    ...overrides,
  } as never);
}

describe("Approbation d'adhésion — création du compte (F-01/F-22)", () => {
  it('crée un compte « membre » pour un candidat qui n’en avait aucun', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const users = await t.run((ctx) => ctx.db.query('users').collect());
    const created = users.find((u) => u.email === 'contact@institut-sahel.org');
    expect(created, 'un compte doit être créé pour le candidat').toBeDefined();
    expect(created!.role).toBe('membre');
  });

  it("normalise l'e-mail en minuscules (sinon la connexion ne retrouve pas le compte)", async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t, {
      contactEmail: '  MAJUSCULES@Example.ORG ',
    });

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.map((u) => u.email)).toContain('majuscules@example.org');
  });

  it('réutilise un compte existant au lieu d’en créer un doublon', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const existing = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'contact@institut-sahel.org' }),
    );
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const users = await t.run((ctx) =>
      ctx.db
        .query('users')
        .collect()
        .then((all) =>
          all.filter((u) => u.email === 'contact@institut-sahel.org'),
        ),
    );
    expect(users).toHaveLength(1);
    expect(users[0]._id).toBe(existing);
    expect(users[0].role).toBe('membre');
  });

  it('ne rétrograde JAMAIS un rôle supérieur', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'contact@institut-sahel.org',
        role: 'admin',
      }),
    );
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const u = await t.run((ctx) =>
      ctx.db
        .query('users')
        .collect()
        .then((all) =>
          all.find((x) => x.email === 'contact@institut-sahel.org'),
        ),
    );
    expect(u!.role).toBe('admin');
  });

  it('un refus ne crée NI compte NI organisation', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'rejected',
      notes: 'Hors périmètre.',
    });

    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.some((u) => u.email === 'contact@institut-sahel.org')).toBe(
      false,
    );
    expect(
      await t.run((ctx) => ctx.db.query('organizations').collect()),
    ).toHaveLength(0);
  });
});

describe("Approbation d'adhésion — entrée dans l'annuaire (F-19/F-22)", () => {
  it("crée l'organisation ACTIVE et la rend visible dans l'annuaire public", async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    // `status` no longer comes out of the public directory (issue #30): we check
    // it in the database. VISIBILITY, on the other hand, is proven by
    // `listDirectory` itself, which only lists active profiles — appearing there
    // means being active.
    const stored = await t.run((ctx) =>
      ctx.db.query('organizations').collect(),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('active');

    const { items } = await t.query(api.organizations.listDirectory, {});
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Institut Démo Sahel');
    expect(items[0].country).toBe('SN');
    expect(items[0].region).toBe('afrique-ouest');
    expect(items[0].themes).toEqual(['gouvernance', 'elections']);

    // the public profile responds on its slug
    const fiche = await t.query(api.organizations.getBySlug, {
      slug: items[0].slug,
    });
    expect(fiche?.name).toBe('Institut Démo Sahel');
  });

  it('rattache le compte à l’organisation en tant que propriétaire', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const links = await t.run((ctx) =>
      ctx.db.query('organizationMemberships').collect(),
    );
    expect(
      links,
      'la table organizationMemberships ne doit plus être morte',
    ).toHaveLength(1);
    expect(links[0].orgRole).toBe('owner');

    const org = await t.run((ctx) => ctx.db.query('organizations').first());
    const user = await t.run((ctx) =>
      ctx.db
        .query('users')
        .collect()
        .then((all) =>
          all.find((u) => u.email === 'contact@institut-sahel.org'),
        ),
    );
    expect(links[0].orgId).toBe(org!._id);
    expect(links[0].userId).toBe(user!._id);
  });

  it("sans champs d'annuaire, l'organisation est créée en « pending » (jamais publiée à moitié)", async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });

    const orgs = await t.run((ctx) => ctx.db.query('organizations').collect());
    expect(orgs).toHaveLength(1);
    expect(orgs[0].status).toBe('pending');
    // …and the public directory stays empty
    expect(
      (await t.query(api.organizations.listDirectory, {})).items,
    ).toHaveLength(0);
    // but the ACCOUNT is indeed created: the sign-in blocker is lifted
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.some((u) => u.email === 'contact@institut-sahel.org')).toBe(
      true,
    );
  });

  it('une candidature « individu » ne crée pas d’organisation, mais crée le compte', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t, {
      type: 'individu',
      organizationName: 'Awa Diop',
      contactEmail: 'awa@example.org',
    });

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
    });

    expect(
      await t.run((ctx) => ctx.db.query('organizations').collect()),
    ).toHaveLength(0);
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users.some((u) => u.email === 'awa@example.org')).toBe(true);
  });

  it('slug unique : deux organisations homonymes ne se écrasent pas', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const a1 = await applicationFrom(t, { contactEmail: 'a@sahel.org' });
    const a2 = await applicationFrom(t, { contactEmail: 'b@sahel.org' });

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId: a1,
      decision: 'approved',
      directory: DIRECTORY,
    });
    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId: a2,
      decision: 'approved',
      directory: DIRECTORY,
    });

    const orgs = await t.run((ctx) => ctx.db.query('organizations').collect());
    expect(orgs).toHaveLength(2);
    expect(new Set(orgs.map((o) => o.slug)).size).toBe(2);
  });
});

describe("Approbation d'adhésion — idempotence et machine à états", () => {
  it('refuse de rejouer une décision déjà prise (pas de doublons)', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: DIRECTORY,
    });
    // replaying the same decision, or reversing it, must be refused: the audit
    // (M6) found that an approved application could go back to "rejected"
    // without removing the granted role.
    await expect(
      mod.as.mutation(api.organizations.reviewApplication, {
        applicationId,
        decision: 'rejected',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    expect(
      await t.run((ctx) => ctx.db.query('organizations').collect()),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query('organizationMemberships').collect()),
    ).toHaveLength(1);
  });
});

describe("Approbation d'adhésion — invitation à se connecter", () => {
  it('planifie un e-mail d’invitation au candidat', async () => {
    const prevDev = process.env.AUTH_DEV_OTP;
    process.env.AUTH_DEV_OTP = 'true'; // sending no-op, accepted in tests
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const mod = await moderator(t);
      const applicationId = await applicationFrom(t);

      await mod.as.mutation(api.organizations.reviewApplication, {
        applicationId,
        decision: 'approved',
        directory: DIRECTORY,
      });

      // sending is scheduled in an ACTION (never fetch in a mutation)
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const app = await t.run((ctx) => ctx.db.get(applicationId));
      expect(app?.invitedAt, "l'invitation doit être horodatée").toBeTypeOf(
        'number',
      );
    } finally {
      vi.useRealTimers();
      if (prevDev === undefined) delete process.env.AUTH_DEV_OTP;
      else process.env.AUTH_DEV_OTP = prevDev;
    }
  });
});

describe('Invitation manuelle par un admin (F-63)', () => {
  it('crée un compte et le rend connectable, avec audit', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'a@test.org' }),
    );
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });

    const res = await asAdmin.mutation(api.users.inviteUser, {
      email: 'Nouveau@Membre.org',
      role: 'membre',
    });
    expect(res.created).toBe(true);

    const users = await t.run((ctx) => ctx.db.query('users').collect());
    const u = users.find((x) => x.email === 'nouveau@membre.org');
    expect(u).toBeDefined();
    expect(u!.role).toBe('membre');

    const log = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(log.some((l) => l.action === 'user.invited')).toBe(true);
  });

  it('réinvite un compte existant sans le dupliquer ni changer son rôle', async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'a@test.org' }),
    );
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'deja@membre.org', role: 'editeur' }),
    );
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });

    const res = await asAdmin.mutation(api.users.inviteUser, {
      email: 'deja@membre.org',
      role: 'membre',
    });
    expect(res.created).toBe(false);

    const all = await t.run((ctx) => ctx.db.query('users').collect());
    expect(all.filter((u) => u.email === 'deja@membre.org')).toHaveLength(1);
    expect(all.find((u) => u.email === 'deja@membre.org')!.role).toBe(
      'editeur',
    );
  });

  it('refuse un non-admin et une adresse invalide', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'm@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .mutation(api.users.inviteUser, { email: 'x@y.org', role: 'membre' }),
    ).rejects.toThrow();

    const adminId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'admin', email: 'a@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${adminId}|s` })
        .mutation(api.users.inviteUser, {
          email: 'pas-un-email',
          role: 'membre',
        }),
    ).rejects.toThrow('INVALID_EMAIL');
  });
});

// WEBSITE ADDRESS OF A PROFILE (pentest M-9, write side).
//
// `websiteUrl` was only constrained by `v.string()`, and the public profile
// put it as is in an `href`. The render filter
// (src/lib/safe-href.ts + tests/unit/portable-text-liens.test.tsx) has the
// last word — it covers profiles saved before this validation — but
// accepting the payload in the database only to stop it at display time
// would amount to storing it while waiting for the next screen that forgets.
describe("Approbation d'adhésion — schéma de l'adresse de site (pentest M-9)", () => {
  it('refuse un schéma non http(s), et ne crée alors NI compte NI organisation', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);

    for (const [i, websiteUrl] of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'institut-sahel.org', // entered without a scheme: incomplete, not a link
    ].entries()) {
      // One address per application: only one pending application per address
      // since R-09, and all four stay `pending` here.
      const applicationId = await applicationFrom(t, {
        organizationName: `Institut ${websiteUrl.slice(0, 8)}`,
        contactEmail: `contact-${i}@institut-sahel.org`,
      });
      await expect(
        mod.as.mutation(api.organizations.reviewApplication, {
          applicationId,
          decision: 'approved',
          directory: { ...DIRECTORY, websiteUrl },
        }),
        `schéma accepté : ${websiteUrl}`,
      ).rejects.toThrow('INVALID_WEBSITE');
    }

    // The decision was not half-made: nothing went through.
    expect(
      await t.run((ctx) => ctx.db.query('organizations').collect()),
    ).toHaveLength(0);
    const candidatures = await t.run((ctx) =>
      ctx.db.query('membershipApplications').collect(),
    );
    expect(candidatures.every((c) => c.status === 'pending')).toBe(true);
  });

  it('accepte http et https — sinon ce test ne mesurerait rien', async () => {
    const t = convexTest(schema, modules);
    const mod = await moderator(t);
    const applicationId = await applicationFrom(t);

    await mod.as.mutation(api.organizations.reviewApplication, {
      applicationId,
      decision: 'approved',
      directory: { ...DIRECTORY, websiteUrl: 'https://institut-sahel.org' },
    });

    const [org] = await t.run((ctx) => ctx.db.query('organizations').collect());
    expect(org.websiteUrl).toBe('https://institut-sahel.org');
  });
});
