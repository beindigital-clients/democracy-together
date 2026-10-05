// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { sniffImageType } from './orgAdmin';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = ReturnType<typeof convexTest>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

// The invitation schedules a welcome email: in development mode it is
// logged instead of failing for lack of a provider.
beforeEach(() => vi.stubEnv('AUTH_DEV_OTP', 'true'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function user(t: T, email: string, role: Role, name?: string) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email, role, ...(name ? { name } : {}) }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function org(
  t: T,
  slug: string,
  status: 'active' | 'pending' = 'active',
) {
  return await t.run((ctx) =>
    ctx.db.insert('organizations', {
      name: `Institut ${slug}`,
      slug,
      country: 'SN',
      region: 'afrique-ouest',
      languages: ['fr'],
      themes: ['gouvernance'],
      status,
      createdAt: 0,
    }),
  );
}

async function attach(
  t: T,
  orgId: Id<'organizations'>,
  userId: Id<'users'>,
  orgRole: 'owner' | 'member',
) {
  await t.run((ctx) =>
    ctx.db.insert('organizationMemberships', {
      orgId,
      userId,
      orgRole,
      createdAt: 0,
    }),
  );
}

const FIELDS = {
  name: 'Institut Renommé',
  description: 'Centre de recherche sur la gouvernance locale.',
  websiteUrl: 'https://institut.example.org',
  country: 'sn',
  region: 'afrique-ouest',
  themes: ['gouvernance', 'elections'],
  languages: ['fr', 'wo'],
  showMembers: true,
};

describe('Fiche d’organisation — seul le responsable l’édite (F-21)', () => {
  it('refuse un simple membre, un responsable d’une AUTRE organisation, et un modérateur', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const orgB = await org(t, 'b');
    const owner = await user(t, 'owner@a.org', 'membre');
    const member = await user(t, 'member@a.org', 'membre');
    const ownerB = await user(t, 'owner@b.org', 'membre');
    const mod = await user(t, 'mod@test.org', 'moderateur');
    await attach(t, orgA, owner.id, 'owner');
    await attach(t, orgA, member.id, 'member');
    await attach(t, orgB, ownerB.id, 'owner');

    for (const who of [member, ownerB, mod]) {
      await expect(
        who.as.mutation(api.orgAdmin.submitRevision, {
          orgId: orgA,
          fields: FIELDS,
        }),
      ).rejects.toThrow('NOT_ORG_OWNER');
      await expect(
        who.as.mutation(api.orgAdmin.generateLogoUploadUrl, { orgId: orgA }),
      ).rejects.toThrow('NOT_ORG_OWNER');
    }

    const revisionId = await owner.as.mutation(api.orgAdmin.submitRevision, {
      orgId: orgA,
      fields: FIELDS,
    });
    // The public profile has NOT changed: the revision awaits a moderator.
    const before = await t.query(api.organizations.getBySlug, { slug: 'a' });
    expect(before?.name).toBe('Institut a');

    // The manager does not approve themselves.
    await expect(
      owner.as.mutation(api.orgAdmin.reviewRevision, {
        revisionId,
        decision: 'approved',
      }),
    ).rejects.toThrow(/Accès refusé/);

    await mod.as.mutation(api.orgAdmin.reviewRevision, {
      revisionId,
      decision: 'approved',
    });
    const after = await t.query(api.organizations.getBySlug, { slug: 'a' });
    expect(after).toMatchObject({
      name: 'Institut Renommé',
      country: 'SN',
      websiteUrl: 'https://institut.example.org',
      themes: ['gouvernance', 'elections'],
    });
    // The manager is notified.
    const notes = await owner.as.query(api.notifications.myNotifications, {});
    expect(notes[0]?.titleKey).toBe('orgRevisionApproved');
  });

  it('valide les champs comme l’annuaire (site web, région)', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre');
    await attach(t, orgA, owner.id, 'owner');
    await expect(
      owner.as.mutation(api.orgAdmin.submitRevision, {
        orgId: orgA,
        fields: { ...FIELDS, websiteUrl: 'javascript:alert(1)' },
      }),
    ).rejects.toThrow('INVALID_WEBSITE');
    await expect(
      owner.as.mutation(api.orgAdmin.submitRevision, {
        orgId: orgA,
        fields: { ...FIELDS, region: 'atlantide' },
      }),
    ).rejects.toThrow('INVALID_REGION');
  });

  it('publie une fiche « à compléter » à l’approbation de sa première révision', async () => {
    const t = convexTest(schema, modules);
    const orgP = await org(t, 'p', 'pending');
    const owner = await user(t, 'owner@p.org', 'membre');
    const mod = await user(t, 'mod@test.org', 'moderateur');
    await attach(t, orgP, owner.id, 'owner');
    expect(await t.query(api.organizations.getBySlug, { slug: 'p' })).toBe(
      null,
    );
    const revisionId = await owner.as.mutation(api.orgAdmin.submitRevision, {
      orgId: orgP,
      fields: FIELDS,
    });
    await mod.as.mutation(api.orgAdmin.reviewRevision, {
      revisionId,
      decision: 'approved',
    });
    expect(
      await t.query(api.organizations.getBySlug, { slug: 'p' }),
    ).not.toBeNull();
  });

  it('refuse un logo qui n’est pas passé par la vérification de contenu', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre');
    await attach(t, orgA, owner.id, 'owner');
    const fileId = await t.run((ctx) =>
      ctx.storage.store(new Blob(['<svg onload="alert(1)"/>'])),
    );
    await expect(
      owner.as.mutation(api.orgAdmin.submitRevision, {
        orgId: orgA,
        fields: FIELDS,
        logoFileId: fileId,
      }),
    ).rejects.toThrow('INVALID_LOGO');
    // And the verification action refuses (then deletes) an SVG.
    expect(
      await owner.as.action(api.orgAdmin.attachLogo, { orgId: orgA, fileId }),
    ).toEqual({ ok: false, reason: 'LOGO_TYPE' });
  });

  it('accepte un PNG vérifié', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre');
    await attach(t, orgA, owner.id, 'owner');
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const fileId = await t.run((ctx) => ctx.storage.store(new Blob([png])));
    expect(
      await owner.as.action(api.orgAdmin.attachLogo, { orgId: orgA, fileId }),
    ).toMatchObject({ ok: true });
    await owner.as.mutation(api.orgAdmin.submitRevision, {
      orgId: orgA,
      fields: FIELDS,
      logoFileId: fileId,
    });
  });
});

describe('Rattachements', () => {
  it('le responsable invite un collègue ; jamais le dernier responsable retiré', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre');
    await attach(t, orgA, owner.id, 'owner');

    const res = await owner.as.mutation(api.orgAdmin.inviteColleague, {
      orgId: orgA,
      email: 'Collegue@A.org',
    });
    expect(res.created).toBe(true);
    const colleague = await t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', 'collegue@a.org'))
        .first(),
    );
    expect(colleague?.role).toBe('membre');
    const colleagueAs = t.withIdentity({ subject: `${colleague!._id}|s` });

    // A member can neither invite nor remove someone else.
    await expect(
      colleagueAs.mutation(api.orgAdmin.inviteColleague, {
        orgId: orgA,
        email: 'x@a.org',
      }),
    ).rejects.toThrow('NOT_ORG_OWNER');
    await expect(
      colleagueAs.mutation(api.orgAdmin.removeMember, {
        orgId: orgA,
        userId: owner.id,
      }),
    ).rejects.toThrow('NOT_ORG_OWNER');

    // The last manager cannot leave, nor demote themselves.
    await expect(
      owner.as.mutation(api.orgAdmin.removeMember, {
        orgId: orgA,
        userId: owner.id,
      }),
    ).rejects.toThrow('LAST_ORG_OWNER');
    await expect(
      owner.as.mutation(api.orgAdmin.setMemberRole, {
        orgId: orgA,
        userId: owner.id,
        orgRole: 'member',
      }),
    ).rejects.toThrow('LAST_ORG_OWNER');

    // Once promoted, the colleague lets the first one leave.
    await owner.as.mutation(api.orgAdmin.setMemberRole, {
      orgId: orgA,
      userId: colleague!._id,
      orgRole: 'owner',
    });
    await owner.as.mutation(api.orgAdmin.removeMember, {
      orgId: orgA,
      userId: owner.id,
    });
    expect(await owner.as.query(api.orgAdmin.myOrganizations, {})).toEqual([]);
    // The invitation scheduled a welcome e-mail: send it before the test ends,
    // not after, when AUTH_DEV_OTP is no longer set.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('un simple membre ne voit pas les adresses de ses collègues', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre');
    const member = await user(t, 'member@a.org', 'membre');
    await attach(t, orgA, owner.id, 'owner');
    await attach(t, orgA, member.id, 'member');
    const view = await member.as.query(api.orgAdmin.organizationForMember, {
      orgId: orgA,
    });
    const ownerRow = view.members.find((m) => m.userId === owner.id);
    expect(ownerRow?.email).toBeNull();
    const outsider = await user(t, 'x@test.org', 'membre');
    await expect(
      outsider.as.query(api.orgAdmin.organizationForMember, { orgId: orgA }),
    ).rejects.toThrow('NOT_ORG_MEMBER');
  });
});

describe('Organisation ↔ publications ↔ fiche publique', () => {
  it('un dépôt porte l’organisation, que la fiche liste une fois publié', async () => {
    const t = convexTest(schema, modules);
    const orgA = await org(t, 'a');
    const owner = await user(t, 'owner@a.org', 'membre', 'Awa Diop');
    await attach(t, orgA, owner.id, 'owner');

    const { id } = await owner.as.mutation(api.publications.submitPublication, {
      title: 'Note sur la décentralisation',
      type: 'note',
      theme: 'participation',
      region: 'afrique',
      languages: ['fr'],
      access: 'open',
      year: 2025,
      authors: [{ name: 'Awa Diop' }],
      abstract: 'Un résumé suffisamment long pour être accepté.',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.organizationId).toBe(orgA);

    // Not yet published: the profile does not show it.
    let details = await t.query(api.orgAdmin.publicDetails, { slug: 'a' });
    expect(details?.publications).toEqual([]);
    expect(details?.members).toBeNull();

    // Only a review chief or an administrator publishes a deposit (D-7).
    const chief = await user(t, 'chief@test.org', 'admin');
    await chief.as.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'approved',
    });
    await t.run((ctx) => ctx.db.patch(orgA, { showMembers: true }));
    details = await t.query(api.orgAdmin.publicDetails, { slug: 'a' });
    expect(details?.publications.map((p) => p.title)).toEqual([
      'Note sur la décentralisation',
    ]);
    // Members: NAMES only, never an address.
    expect(details?.members).toEqual([{ name: 'Awa Diop' }]);
    expect(JSON.stringify(details)).not.toContain('owner@a.org');
  });

  it('une organisation non active n’a pas de fiche publique', async () => {
    const t = convexTest(schema, modules);
    await org(t, 'p', 'pending');
    expect(await t.query(api.orgAdmin.publicDetails, { slug: 'p' })).toBe(null);
  });
});

describe('Vérification du contenu d’une image', () => {
  it('reconnaît PNG, JPEG, WebP à leur signature, et rien d’autre', () => {
    expect(
      sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
    ).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffImageType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
    expect(
      sniffImageType(new TextEncoder().encode('<svg xmlns="…"></svg>')),
    ).toBe(null);
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBe(null);
  });
});
