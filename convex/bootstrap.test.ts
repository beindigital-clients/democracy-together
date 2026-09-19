// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import { bootstrapAdmin } from './bootstrap';
import { AUDIT } from './lib/auditActions';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

const ADMIN_EMAIL = 'fondateur@dt.test';

// L'amorçage (issue #47) est le SEUL chemin de production vers le premier
// administrateur. Ses deux gardes sont testées ici parce qu'une régression sur
// l'une d'elles ne se verrait pas autrement : sans la garde « zéro admin », la
// mutation resterait rejouable à vie sur un déploiement en service — une porte
// dérobée ; sans la garde BOOTSTRAP_ADMIN_EMAIL, elle promouvrait n'importe
// quelle adresse.
//
// Convention de ce fichier : on part d'un environnement où NI
// BOOTSTRAP_ADMIN_EMAIL NI AUTH_DEV_OTP n'est défini — l'état d'un déploiement
// de production — et chaque test pose seulement ce dont il a besoin.
const ENV_KEYS = ['BOOTSTRAP_ADMIN_EMAIL', 'AUTH_DEV_OTP'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Amorçage de l'administrateur initial (#47)", () => {
  it('déploiement neuf : crée le compte, accorde « admin », audite', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);

    // Casse et espaces quelconques : l'adresse est normalisée comme à la
    // connexion, sinon le compte créé ne serait jamais retrouvé par
    // `createOrUpdateUser` (convex/auth.ts).
    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: '  Fondateur@DT.TEST  ',
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(true);
    expect(res.email).toBe(ADMIN_EMAIL);

    const user = await t.run((ctx) => ctx.db.get(res.userId));
    expect(user?.role).toBe('admin');
    expect(user?.email).toBe(ADMIN_EMAIL);

    // Audit (F-67) : l'opération laisse une trace, sans acteur — elle vient de
    // la CLI d'exploitation, pas d'un compte de la plateforme.
    const entries = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe(AUDIT.ADMIN_BOOTSTRAPPED);
    expect(entries[0].targetId).toBe(res.userId);
    expect(entries[0].actorId).toBeUndefined();
    expect(entries[0].metadata).toMatchObject({
      email: ADMIN_EMAIL,
      role: 'admin',
      created: true,
      via: 'bootstrap',
    });
  });

  it('compte déjà ouvert (invitation) : promeut sans dupliquer la ligne', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    const existingId = await t.run((ctx) =>
      ctx.db.insert('users', { email: ADMIN_EMAIL, role: 'visiteur' }),
    );

    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: ADMIN_EMAIL,
    });
    expect(res.created).toBe(false);
    expect(res.userId).toBe(existingId);

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('admin');
  });

  it('un administrateur existe déjà : rejet (la mutation n’est pas rejouable)', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);

    await t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL });

    // Second appel, variable toujours en place : la garde « zéro admin » suffit
    // à refermer la porte. C'est ce qui empêche l'amorçage d'être une porte
    // dérobée permanente quand la variable est oubliée sur le déploiement.
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ALREADY_DONE/);

    // Rien n'a bougé : un seul compte, un seul enregistrement d'audit.
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      1,
    );
    expect(
      await t.run((ctx) => ctx.db.query('auditLog').collect()),
    ).toHaveLength(1);
  });

  it('un administrateur venu d’ailleurs ferme aussi l’amorçage', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    // Admin existant portant une AUTRE adresse : la garde porte sur la présence
    // d'un administrateur, pas sur celle de l'adresse amorcée — sinon la
    // mutation resterait un moyen de s'ajouter aux administrateurs en place.
    await t.run((ctx) =>
      ctx.db.insert('users', { email: 'deja@dt.test', role: 'admin' }),
    );

    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ALREADY_DONE/);

    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('deja@dt.test');
    expect(
      await t.run((ctx) => ctx.db.query('auditLog').collect()),
    ).toHaveLength(0);
  });

  it('sans BOOTSTRAP_ADMIN_EMAIL : rejet, aucun compte créé', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, { email: ADMIN_EMAIL }),
    ).rejects.toThrow(/BOOTSTRAP_ADMIN_NOT_CONFIGURED/);
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      0,
    );
  });

  it('adresse différente de BOOTSTRAP_ADMIN_EMAIL : rejet', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, {
        email: 'pirate@dt.test',
      }),
    ).rejects.toThrow(/BOOTSTRAP_EMAIL_MISMATCH/);
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toHaveLength(
      0,
    );
  });

  it('adresse invalide : rejet', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = 'pas-une-adresse';
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.bootstrap.bootstrapAdmin, {
        email: 'pas-une-adresse',
      }),
    ).rejects.toThrow(/INVALID_EMAIL/);
  });

  // Régression signalée par l'issue : l'amorçage doit être TOTALEMENT
  // indépendant de la surface de développement. AUTH_DEV_OTP n'est pas un
  // drapeau isolé — quand il est posé, chaque code de connexion émis est écrit
  // en clair dans `devOtpCodes` et relu par un oracle. Amorcer un admin ne doit
  // donc ni exiger ce drapeau ni écrire dans cette table.
  it('n’exige pas AUTH_DEV_OTP et n’écrit rien dans devOtpCodes', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = ADMIN_EMAIL;
    // État d'un déploiement de production : le drapeau de dev est absent.
    expect(process.env.AUTH_DEV_OTP).toBeUndefined();
    const t = convexTest(schema, modules);

    const res = await t.mutation(internal.bootstrap.bootstrapAdmin, {
      email: ADMIN_EMAIL,
    });
    expect((await t.run((ctx) => ctx.db.get(res.userId)))?.role).toBe('admin');

    expect(
      await t.run((ctx) => ctx.db.query('devOtpCodes').collect()),
    ).toHaveLength(0);

    // Contre-épreuve : l'autre chemin d'attribution de rôle, lui, reste fermé
    // sans le drapeau. C'est bien l'amorçage qui a changé, pas la garde de dev.
    await expect(
      t.mutation(internal.devAdmin.setRoleByEmail, {
        email: 'autre@dt.test',
        role: 'admin',
      }),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });

  // Si `internalMutation` devenait `mutation`, l'amorçage passerait dans l'API
  // publique : appelable par n'importe quel client sur la fenêtre où le
  // déploiement est neuf. Les deux gardes tiendraient, mais la surface n'a
  // aucune raison d'exister — ce test la verrouille.
  it('reste hors API publique (internalMutation)', () => {
    const registered = bootstrapAdmin as unknown as {
      isMutation?: boolean;
      isInternal?: boolean;
      isPublic?: boolean;
    };
    expect(registered.isMutation).toBe(true);
    expect(registered.isInternal).toBe(true);
    expect(registered.isPublic).toBeUndefined();
  });
});
