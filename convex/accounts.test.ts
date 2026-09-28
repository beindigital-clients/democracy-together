// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { assertMaySignIn } from './lib/signIn';
import { USER_DATA_MODULES } from './lib/accountDeletion';

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

// Un compte AVEC une vraie session Convex Auth (ligne `authSessions` + jeton
// de rafraîchissement) : c'est ce que la suspension doit supprimer.
async function account(
  t: T,
  email: string,
  role: 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin',
) {
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email, role });
    const sessionId = await ctx.db.insert('authSessions', {
      userId,
      expirationTime: Date.now() + 3_600_000,
    });
    await ctx.db.insert('authRefreshTokens', {
      sessionId,
      expirationTime: Date.now() + 3_600_000,
    });
    return { userId, sessionId };
  });
  return {
    userId,
    sessionId,
    as: t.withIdentity({ subject: `${userId}|${sessionId}` }),
  };
}

// Les courriels planifiés (accueil, code) sont journalisés en mode
// développement au lieu d'échouer faute de fournisseur.
beforeEach(() => vi.stubEnv('AUTH_DEV_OTP', 'true'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Suspension (F-63)', () => {
  it('bloque TOUTES les gardes et supprime les sessions', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const mod = await account(t, 'mod@test.org', 'moderateur');

    // Avant : le compte a accès (requireUser, requireNetworkRole, getCurrentUser).
    expect(await mod.as.query(api.users.current, {})).not.toBeNull();
    await mod.as.query(api.admin.dashboardStats, {});

    // Motif obligatoire.
    await expect(
      admin.as.mutation(api.accounts.suspendAccount, {
        userId: mod.userId,
        reason: ' ',
      }),
    ).rejects.toThrow('INVALID_REASON');

    const res = await admin.as.mutation(api.accounts.suspendAccount, {
      userId: mod.userId,
      reason: 'Usurpation signalée',
    });
    expect(res.sessionsRevoked).toBe(1);

    // getCurrentUser -> null ; requireUser -> ACCOUNT_SUSPENDED ;
    // requireNetworkRole -> ACCOUNT_SUSPENDED.
    expect(await mod.as.query(api.users.current, {})).toBeNull();
    await expect(
      mod.as.mutation(api.users.setPreferredLocale, { locale: 'en' }),
    ).rejects.toThrow('ACCOUNT_SUSPENDED');
    await expect(mod.as.query(api.admin.dashboardStats, {})).rejects.toThrow(
      'ACCOUNT_SUSPENDED',
    );
    // Les lectures personnalisées le traitent en visiteur.
    expect(await mod.as.query(api.notifications.myNotifications, {})).toEqual(
      [],
    );
    expect(await mod.as.query(api.accounts.sessionState, {})).toEqual({
      state: 'suspended',
    });

    // Sessions ET jetons de rafraîchissement supprimés.
    const left = await t.run(async (ctx) => ({
      session: await ctx.db.get(mod.sessionId),
      tokens: await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', mod.sessionId))
        .collect(),
    }));
    expect(left.session).toBeNull();
    expect(left.tokens).toEqual([]);

    // Plus de NOUVELLE session (callback beforeSessionCreation).
    await t.run(async (ctx) => {
      await expect(assertMaySignIn(ctx.db, mod.userId)).rejects.toThrow(
        'ACCOUNT_SUSPENDED',
      );
      await expect(assertMaySignIn(ctx.db, admin.userId)).resolves.toBe(
        undefined,
      );
    });

    // Journalisée, motif compris.
    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'user.suspended'))
        .collect(),
    );
    expect(audit[0]?.metadata).toMatchObject({ reason: 'Usurpation signalée' });

    // Réactivation : l'accès revient (nouvelle session).
    await admin.as.mutation(api.accounts.reactivateAccount, {
      userId: mod.userId,
    });
    const again = await t.run((ctx) =>
      ctx.db.insert('authSessions', {
        userId: mod.userId,
        expirationTime: Date.now() + 1000,
      }),
    );
    expect(
      await t
        .withIdentity({ subject: `${mod.userId}|${again}` })
        .query(api.users.current, {}),
    ).not.toBeNull();
  });

  it('refuse un non-administrateur et sa propre suspension', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const mod = await account(t, 'mod@test.org', 'moderateur');
    await expect(
      mod.as.mutation(api.accounts.suspendAccount, {
        userId: admin.userId,
        reason: 'Tentative',
      }),
    ).rejects.toThrow(/Accès refusé/);
    await expect(
      admin.as.mutation(api.accounts.suspendAccount, {
        userId: admin.userId,
        reason: 'Moi-même',
      }),
    ).rejects.toThrow('SELF_ACTION');
  });
});

describe('Dernier administrateur', () => {
  it('ne peut être ni suspendu ni supprimé — un administrateur suspendu ne compte pas', async () => {
    const t = convexTest(schema, modules);
    const a1 = await account(t, 'a1@test.org', 'admin');
    const a2 = await account(t, 'a2@test.org', 'admin');
    const a3 = await account(t, 'a3@test.org', 'admin');

    // Trois administrateurs actifs : en suspendre un est permis.
    await a1.as.mutation(api.accounts.suspendAccount, {
      userId: a2.userId,
      reason: 'Départ du bureau',
    });
    // La garde compte les administrateurs ACTIFS : a2 (suspendu) n'en est
    // plus un, mais a1 et a3 le sont encore.
    await t.run(async (ctx) => {
      const { assertNotLastActiveAdmin } = await import('./accounts');
      // Deux actifs (a1, a3) : viser l'un d'eux est permis.
      await expect(
        assertNotLastActiveAdmin(ctx, (await ctx.db.get(a3.userId))!),
      ).resolves.toBe(undefined);
    });
    await a1.as.mutation(api.accounts.suspendAccount, {
      userId: a3.userId,
      reason: 'Rotation',
    });
    // a1 est désormais le SEUL administrateur actif.
    await t.run(async (ctx) => {
      const { assertNotLastActiveAdmin } = await import('./accounts');
      await expect(
        assertNotLastActiveAdmin(ctx, (await ctx.db.get(a1.userId))!),
      ).rejects.toThrow('LAST_ADMIN');
    });
    // Et le dernier actif ne peut pas non plus se rétrograder.
    await expect(
      a1.as.mutation(api.users.setRole, { userId: a1.userId, role: 'membre' }),
    ).rejects.toThrow();
  });

  it('refuse la suppression du dernier administrateur, même en libre-service', async () => {
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const t = convexTest(schema, modules);
    const only = await account(t, 'seul@test.org', 'admin');
    await only.as.action(api.accounts.requestAccountDeletion, {});
    const code = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('devOtpCodes')
        .withIndex('by_email', (q) => q.eq('email', 'seul@test.org'))
        .order('desc')
        .first();
      return row!.code;
    });
    await expect(
      only.as.action(api.accounts.confirmAccountDeletion, { code }),
    ).rejects.toThrow('LAST_ADMIN');
    expect(await t.run((ctx) => ctx.db.get(only.userId))).not.toBeNull();
  });
});

describe('Suppression par un administrateur', () => {
  it('exige de retaper l’adresse, puis efface, désattribue et journalise', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const victim = await account(t, 'membre@test.org', 'membre');

    const { publishedId, pendingId } = await t.run(async (ctx) => {
      const base = {
        type: 'note' as const,
        theme: 'gouvernance',
        region: 'afrique' as const,
        languages: ['fr' as const],
        access: 'open' as const,
        authors: [{ name: 'Awa Diop' }],
        year: 2025,
        publishedAt: 0,
        abstract: 'Résumé de test suffisamment long.',
        keypoints: [],
        body: [],
        doi: '',
        downloads: 0,
        citations: 0,
        authorUserId: victim.userId,
        createdAt: 0,
      };
      const publishedId = await ctx.db.insert('publications', {
        ...base,
        title: 'Publiée',
        slug: 'publiee',
        status: 'published',
      });
      const pendingId = await ctx.db.insert('publications', {
        ...base,
        title: 'En attente',
        slug: 'en-attente',
        status: 'pending',
      });
      await ctx.db.insert('notifications', {
        userId: victim.userId,
        type: 'x',
        titleKey: 'y',
        read: false,
        createdAt: 0,
      });
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'membre@test.org',
        createdAt: 0,
      });
      const postId = await ctx.db.insert('tribunePosts', {
        authorUserId: victim.userId,
        authorName: 'Awa',
        theme: 'gouvernance',
        format: 'court',
        title: 'Mon billet',
        body: 'Un billet personnel.',
        status: 'published',
        commentCount: 0,
        createdAt: 0,
      });
      await ctx.db.insert('tribuneReactions', {
        postId,
        userId: admin.userId,
        createdAt: 0,
      });
      await ctx.db.insert('authAccounts', {
        userId: victim.userId,
        provider: 'password',
        providerAccountId: 'membre@test.org',
      });
      return { publishedId, pendingId };
    });

    await expect(
      admin.as.mutation(api.accounts.deleteAccount, {
        userId: victim.userId,
        confirmEmail: 'autre@test.org',
      }),
    ).rejects.toThrow('CONFIRMATION_MISMATCH');

    await admin.as.mutation(api.accounts.deleteAccount, {
      userId: victim.userId,
      confirmEmail: ' MEMBRE@test.org ',
    });
    // Aussitôt : plus aucun accès, même avant la fin du traitement.
    expect(await victim.as.query(api.users.current, {})).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.run(async (ctx) => ({
      user: await ctx.db.get(victim.userId),
      published: await ctx.db.get(publishedId),
      pending: await ctx.db.get(pendingId),
      notifications: await ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', victim.userId))
        .collect(),
      newsletter: await ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_email', (q) => q.eq('email', 'membre@test.org'))
        .collect(),
      posts: await ctx.db
        .query('tribunePosts')
        .withIndex('by_author', (q) => q.eq('authorUserId', victim.userId))
        .collect(),
      reactions: await ctx.db.query('tribuneReactions').collect(),
      accounts: await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', victim.userId))
        .collect(),
      job: await ctx.db
        .query('accountDeletions')
        .withIndex('by_user', (q) => q.eq('userId', victim.userId))
        .first(),
      audit: await ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'user.deleted'))
        .collect(),
    }));
    expect(after.user).toBeNull();
    // Règle 3 : la publication PUBLIÉE reste, sans lien vers le compte.
    expect(after.published?.authorUserId).toBeUndefined();
    expect(after.published?.authors).toEqual([{ name: 'Awa Diop' }]);
    // Règle 1 : le dépôt non publié disparaît.
    expect(after.pending).toBeNull();
    expect(after.notifications).toEqual([]);
    expect(after.newsletter).toEqual([]);
    // Règle 2 : l'expression personnelle, et ce qui y était attaché.
    expect(after.posts).toEqual([]);
    expect(after.reactions).toEqual([]);
    expect(after.accounts).toEqual([]);
    // Le suivi du traitement ne garde aucune donnée personnelle.
    expect(after.job?.status).toBe('done');
    expect(after.job?.email).toBeUndefined();
    expect(after.audit).toHaveLength(1);
  });

  it('refuse sa propre suppression par le back-office et un non-admin', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const mod = await account(t, 'mod@test.org', 'moderateur');
    await expect(
      admin.as.mutation(api.accounts.deleteAccount, {
        userId: admin.userId,
        confirmEmail: 'admin@test.org',
      }),
    ).rejects.toThrow('SELF_ACTION');
    await expect(
      mod.as.mutation(api.accounts.deleteAccount, {
        userId: admin.userId,
        confirmEmail: 'admin@test.org',
      }),
    ).rejects.toThrow(/Accès refusé/);
  });
});

describe('Export de ses données (RGPD art. 15/20)', () => {
  it('ne contient QUE les données du compte appelant', async () => {
    const t = convexTest(schema, modules);
    const a = await account(t, 'a@test.org', 'membre');
    const b = await account(t, 'b@test.org', 'membre');
    await t.run(async (ctx) => {
      for (const [who, title] of [
        [a.userId, 'Billet de A'],
        [b.userId, 'Billet de B'],
      ] as const) {
        await ctx.db.insert('tribunePosts', {
          authorUserId: who,
          authorName: title,
          theme: 'gouvernance',
          format: 'court',
          title,
          body: `Corps ${title}`,
          status: 'published',
          commentCount: 0,
          createdAt: 0,
        });
        await ctx.db.insert('notifications', {
          userId: who,
          type: 't',
          titleKey: `notif-${title}`,
          read: false,
          createdAt: 0,
        });
      }
      await ctx.db.insert('newsletterSubscriptions', {
        email: 'b@test.org',
        createdAt: 0,
      });
      await ctx.db.insert('authAccounts', {
        userId: a.userId,
        provider: 'password',
        providerAccountId: 'a@test.org',
        secret: 'empreinte-du-mot-de-passe',
      });
    });

    const exported = await a.as.query(api.accounts.exportMyData, {});
    const text = JSON.stringify(exported);
    expect(exported.account.email).toBe('a@test.org');
    expect(text).toContain('Billet de A');
    expect(text).toContain('notif-Billet de A');
    // Rien de B.
    expect(text).not.toContain('Billet de B');
    expect(text).not.toContain('b@test.org');
    // Ni l'empreinte du mot de passe.
    expect(text).not.toContain('empreinte-du-mot-de-passe');
    // Chaque module exportable du registre a sa section.
    for (const m of USER_DATA_MODULES) {
      if (m.export) expect(Object.keys(exported.data)).toContain(m.key);
    }
  });

  it('refuse un visiteur anonyme', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.accounts.exportMyData, {})).rejects.toThrow();
  });
});

describe('Suppression en libre-service (code par e-mail)', () => {
  it('exige le code envoyé, compte les essais, puis supprime', async () => {
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await account(t, 'admin@test.org', 'admin');
    const me = await account(t, 'moi@test.org', 'membre');

    // Sans demande préalable.
    expect(
      await me.as.action(api.accounts.confirmAccountDeletion, {
        code: '123456',
      }),
    ).toEqual({ ok: false, reason: 'NO_REQUEST' });

    await me.as.action(api.accounts.requestAccountDeletion, {});
    const stored = await t.run((ctx) =>
      ctx.db.query('accountConfirmationCodes').collect(),
    );
    // Empreinte seulement, jamais le code.
    const code = await t.run(async (ctx) => {
      const row = await ctx.db
        .query('devOtpCodes')
        .withIndex('by_email', (q) => q.eq('email', 'moi@test.org'))
        .order('desc')
        .first();
      return row!.code;
    });
    expect(stored[0].codeHash).not.toContain(code);

    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      await me.as.action(api.accounts.confirmAccountDeletion, { code: wrong }),
    ).toEqual({ ok: false, reason: 'INVALID_CODE' });

    expect(
      await me.as.action(api.accounts.confirmAccountDeletion, { code }),
    ).toEqual({ ok: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(me.userId))).toBeNull();
  });
});

describe('Création directe par un administrateur', () => {
  it('crée le compte, le rattache à une organisation et planifie l’accueil', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const orgId = await t.run((ctx) =>
      ctx.db.insert('organizations', {
        name: 'Institut Test',
        slug: 'institut-test',
        country: 'SN',
        region: 'afrique-ouest',
        languages: ['fr'],
        themes: ['gouvernance'],
        status: 'active',
        createdAt: 0,
      }),
    );
    const res = await admin.as.mutation(api.accounts.createAccount, {
      email: ' Nouveau@Test.org ',
      role: 'membre',
      organizationId: orgId,
      orgRole: 'owner',
      locale: 'en',
    });
    expect(res.created).toBe(true);
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(res.userId),
      membership: await ctx.db
        .query('organizationMemberships')
        .withIndex('by_org_user', (q) =>
          q.eq('orgId', orgId).eq('userId', res.userId),
        )
        .first(),
      scheduled: await ctx.db.system.query('_scheduled_functions').collect(),
    }));
    expect(state.user).toMatchObject({
      email: 'nouveau@test.org',
      role: 'membre',
      preferredLocale: 'en',
    });
    expect(state.membership?.orgRole).toBe('owner');
    expect(state.scheduled.map((s) => s.name)).toContain(
      'accounts:sendWelcomeEmail',
    );

    // Idempotent, et ne touche jamais au rôle d'un compte existant.
    const again = await admin.as.mutation(api.accounts.createAccount, {
      email: 'nouveau@test.org',
      role: 'admin',
    });
    expect(again).toMatchObject({ created: false, userId: res.userId });
    expect((await t.run((ctx) => ctx.db.get(res.userId)))?.role).toBe('membre');
  });

  it('refuse un non-administrateur et une adresse invalide', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const mod = await account(t, 'mod@test.org', 'moderateur');
    await expect(
      mod.as.mutation(api.accounts.createAccount, {
        email: 'x@test.org',
        role: 'membre',
      }),
    ).rejects.toThrow(/Accès refusé/);
    await expect(
      admin.as.mutation(api.accounts.createAccount, {
        email: 'pas-une-adresse',
        role: 'membre',
      }),
    ).rejects.toThrow('INVALID_EMAIL');
  });
});

describe('Garde interne', () => {
  it('selfForAction refuse un compte suspendu', async () => {
    const t = convexTest(schema, modules);
    const admin = await account(t, 'admin@test.org', 'admin');
    const m = await account(t, 'm@test.org', 'membre');
    await admin.as.mutation(api.accounts.suspendAccount, {
      userId: m.userId,
      reason: 'Abus',
    });
    await expect(
      m.as.query(internal.accounts.selfForAction, {}),
    ).rejects.toThrow('ACCOUNT_SUSPENDED');
  });
});
