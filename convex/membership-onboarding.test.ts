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

// Blocage n°1 de l'audit (§ 1, F-01 + F-22) : depuis la suppression de
// l'auto-inscription, approuver une candidature n'élevait que les comptes DÉJÀ
// existants. Un think tank approuvé qui n'avait jamais créé de compte ne
// pouvait donc JAMAIS se connecter (la connexion par code refuse un e-mail
// inconnu, cf. le callback createOrUpdateUser de convex/auth.ts), et sa fiche
// n'apparaissait jamais dans l'annuaire (l'approbation ne créait aucune
// organisation).
//
// L'approbation doit désormais : créer le compte, créer l'organisation, créer
// le rattachement, et notifier le candidat.

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

    const { items } = await t.query(api.organizations.listDirectory, {});
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Institut Démo Sahel');
    expect(items[0].status).toBe('active');
    expect(items[0].country).toBe('SN');
    expect(items[0].region).toBe('afrique-ouest');
    expect(items[0].themes).toEqual(['gouvernance', 'elections']);

    // la fiche publique répond sur son slug
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
    // …et l'annuaire public reste vide
    expect(
      (await t.query(api.organizations.listDirectory, {})).items,
    ).toHaveLength(0);
    // mais le COMPTE est bien créé : le blocage de connexion est levé
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
    // rejouer la même décision, ou la renverser, doit être refusé : l'audit
    // (M6) relevait qu'une candidature approuvée pouvait repasser « rejetée »
    // sans retirer le rôle accordé.
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
    process.env.AUTH_DEV_OTP = 'true'; // no-op d'envoi assumé en test
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

      // l'envoi est planifié dans une ACTION (jamais de fetch en mutation)
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
