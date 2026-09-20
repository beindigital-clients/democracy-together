// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { internal } from './_generated/api';
import {
  setRoleByEmail,
  clearRoleByEmail,
  purgeUserByEmail,
  deleteTestPublications,
  enrichPublication,
} from './devAdmin';
import { COUNTER, readCounter } from './lib/counters';
import { ROLE_ORDER } from './lib/roles';
import { resolveSignInUserId } from './lib/signIn';

// `devAdmin.ts` n'était couvert par AUCUN test (issue #42), alors que la PR #4
// a changé la nature même de `setRoleByEmail` : de `patch` à UPSERT.
//
// Pourquoi ce changement : la fermeture de l'auto-inscription a supprimé le
// dernier chemin qui CRÉAIT un compte. `setRoleByEmail` — le seul moyen
// documenté d'amorcer un administrateur sur un déploiement de dev, et la
// fixture de toutes les sessions E2E — échouait donc systématiquement sur
// « Utilisateur introuvable » : un déploiement neuf n'avait plus aucun compte à
// promouvoir. C'est le CAS DE CRÉATION qui débloque tout, et c'est précisément
// celui que rien ne vérifiait.
//
// Attention au périmètre : ce helper n'est PAS la procédure de production.
// L'amorçage en service passe par `bootstrap:bootstrapAdmin` et sa variable
// dédiée (TESTING.md, docs/deploiement.md § 5) ; ses tests vivent dans
// convex/bootstrap.test.ts et ne sont pas redits ici.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Convention de bootstrap.test.ts / otp.test.ts : on part de l'état d'un
// déploiement de PRODUCTION, drapeau absent, et chaque test pose ce dont il a
// besoin. Ici presque tous en ont besoin — la garde est le sujet d'un seul.
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.AUTH_DEV_OTP;
  delete process.env.AUTH_DEV_OTP;
});

afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_DEV_OTP;
  else process.env.AUTH_DEV_OTP = saved;
});

const ADMIN = 'fondateur@dt.test';

const utilisateurs = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.query('users').collect());

describe('setRoleByEmail — le cas de CRÉATION (PR #4)', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('crée le compte quand l’e-mail est inconnu, au lieu d’échouer', async () => {
    const t = convexTest(schema, modules);
    // Base neuve : c'est l'état d'un déploiement de dev tout juste créé, et
    // celui d'une préversion CI. Avant l'upsert, l'appel levait ici.
    expect(await utilisateurs(t)).toHaveLength(0);

    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(res).toMatchObject({ ok: true, role: 'admin', created: true });
    expect(await t.run((ctx) => ctx.db.get(res.userId))).toMatchObject({
      email: ADMIN,
      role: 'admin',
    });
  });

  it('met à jour le compte existant sans en créer un second', async () => {
    const t = convexTest(schema, modules);
    const existant = await t.run((ctx) =>
      ctx.db.insert('users', { email: ADMIN, role: 'membre' }),
    );

    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(res).toMatchObject({ created: false, userId: existant });
    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(existant))).toMatchObject({
      role: 'admin',
    });
  });

  // Le compteur `users` alimente le tableau de bord du back-office. Il est
  // incrémenté DANS la transaction qui crée — donc il doit l'être une fois à la
  // création, et JAMAIS sur une mise à jour : `setRoleByEmail` est rejoué à
  // chaque exécution E2E (les helpers sont idempotents), et un incrément par
  // passage ferait dériver l'écran un peu plus à chaque run.
  it('compte la création une seule fois, et ne compte pas les mises à jour', async () => {
    const t = convexTest(schema, modules);
    const compteur = () => t.run((ctx) => readCounter(ctx, COUNTER.USERS));

    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });
    expect(await compteur()).toBe(1);

    for (const role of ['membre', 'editeur', 'admin'] as const) {
      await t.mutation(internal.devAdmin.setRoleByEmail, {
        email: ADMIN,
        role,
      });
    }
    expect(await compteur()).toBe(1);
    expect(await utilisateurs(t)).toHaveLength(1);
  });

  it.each(ROLE_ORDER)(
    'sait amorcer un compte avec le rôle « %s »',
    async (role) => {
      const t = convexTest(schema, modules);
      const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
        email: ADMIN,
        role,
      });
      expect(res).toMatchObject({ created: true, role });
    },
  );
});

describe('setRoleByEmail — normalisation de l’adresse', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('enregistre l’adresse en minuscules et sans espaces', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: '  Fondateur@DT.TEST  ',
      role: 'admin',
    });
    expect(await t.run((ctx) => ctx.db.get(res.userId))).toMatchObject({
      email: ADMIN,
    });
  });

  // L'ENJEU de cette normalisation, et la raison pour laquelle elle mérite un
  // test à elle : la décision de connexion (convex/lib/signIn.ts, appelée par
  // le callback createOrUpdateUser) fait une égalité EXACTE sur l'adresse. Un
  // compte amorcé sous « Fondateur@DT.TEST » ne serait JAMAIS retrouvé — un
  // administrateur créé, visible en base, et hors d'état de se connecter.
  it('le compte amorcé est retrouvé par la décision de connexion', async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: '  Fondateur@DT.TEST  ',
      role: 'admin',
    });

    // L'adresse telle que Convex Auth la présentera au callback : normalisée.
    expect(await t.run((ctx) => resolveSignInUserId(ctx.db, ADMIN))).toBe(
      res.userId,
    );
  });

  it('deux casses différentes désignent le même compte (helper idempotent)', async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: 'Fondateur@DT.test',
      role: 'membre',
    });
    const b = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: 'FONDATEUR@dt.TEST',
      role: 'admin',
    });

    expect(b.userId).toBe(a.userId);
    expect(b.created).toBe(false);
    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(1);
  });
});

describe('clearRoleByEmail — reproduire un compte hérité', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('RETIRE la colonne `role` au lieu de l’écrire à null', async () => {
    const t = convexTest(schema, modules);
    const { userId } = await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    await t.mutation(internal.devAdmin.clearRoleByEmail, { email: ADMIN });

    const ligne = await t.run((ctx) => ctx.db.get(userId));
    // La nuance est tout le helper : la ligne doit redevenir EXACTEMENT celle
    // d'un compte d'avant la PR #4 — champ absent. Un `role: null` serait un
    // troisième état, que le validateur de schéma refuse et que le back-office
    // n'a jamais eu à afficher.
    expect(ligne).not.toBeNull();
    // `Object.keys` plutôt que `Object.hasOwn` : la lib déclarée par
    // convex/tsconfig.json s'arrête à ES2021. Et le message d'échec est plus
    // parlant — il liste les colonnes réellement présentes.
    expect(Object.keys(ligne!)).not.toContain('role');
    expect(ligne?.role).toBeUndefined();
  });

  it('échoue sur un compte inconnu (elle ne crée rien, contrairement à l’upsert)', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.devAdmin.clearRoleByEmail, { email: ADMIN }),
    ).rejects.toThrow(/introuvable/i);
    expect(await utilisateurs(t)).toHaveLength(0);
  });
});

describe('purgeUserByEmail — le compteur revient à son point de départ', () => {
  beforeEach(() => {
    process.env.AUTH_DEV_OTP = 'true';
  });

  it('défait exactement ce que la création avait compté', async () => {
    // Sans cette symétrie, chaque cycle « amorcer puis purger » d'une suite E2E
    // laisserait le compteur `users` un cran plus haut, définitivement.
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(
      await t.mutation(internal.devAdmin.purgeUserByEmail, { email: ADMIN }),
    ).toMatchObject({ deleted: true });

    expect(await utilisateurs(t)).toHaveLength(0);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(0);
  });

  it('sur une adresse inconnue : ne détruit rien et ne décrémente rien', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });

    expect(
      await t.mutation(internal.devAdmin.purgeUserByEmail, {
        email: 'jamais-vu@dt.test',
      }),
    ).toMatchObject({ deleted: false });

    expect(await utilisateurs(t)).toHaveLength(1);
    expect(await t.run((ctx) => readCounter(ctx, COUNTER.USERS))).toBe(1);
  });
});

// --- La surface de développement reste fermée --------------------------------
//
// Ces cinq mutations promeuvent un compte au rang d'administrateur, purgent un
// utilisateur, suppriment des publications. Deux verrous les tiennent, et
// aucun des deux n'était vérifié : la garde AUTH_DEV_OTP, et le fait qu'elles
// soient INTERNES — donc injoignables par un client, quelle que soit la valeur
// du drapeau. Même raisonnement que convex/dev-oracles.test.ts pour les
// oracles de lecture, appliqué ici aux mutations qui ÉCRIVENT.

const MUTATIONS = [
  ['setRoleByEmail', setRoleByEmail, { email: ADMIN, role: 'admin' }],
  ['clearRoleByEmail', clearRoleByEmail, { email: ADMIN }],
  ['purgeUserByEmail', purgeUserByEmail, { email: ADMIN }],
  ['deleteTestPublications', deleteTestPublications, { marker: 'MARQUEUR' }],
  ['enrichPublication', enrichPublication, { marker: 'MARQUEUR' }],
] as const;

describe('devAdmin — surface DEV/TEST verrouillée', () => {
  it.each(MUTATIONS)('%s exige AUTH_DEV_OTP', async (nom, _fn, args) => {
    expect(process.env.AUTH_DEV_OTP).toBeUndefined();
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        internal.devAdmin[nom],
        args as { email: string; role: 'admin' } & { marker: string },
      ),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
  });

  it.each(MUTATIONS)(
    '%s reste hors API publique (internalMutation)',
    (_nom, fn) => {
      const enregistree = fn as unknown as {
        isMutation?: boolean;
        isInternal?: boolean;
        isPublic?: boolean;
      };
      expect(enregistree.isMutation).toBe(true);
      expect(enregistree.isInternal).toBe(true);
      expect(enregistree.isPublic).toBeUndefined();
    },
  );

  it('l’amorçage ne laisse aucun code de connexion en clair', async () => {
    // `setRoleByEmail` est gardé par AUTH_DEV_OTP, le drapeau qui ouvre
    // l'écriture des codes OTP en clair. Il ne doit pas pour autant en écrire :
    // promouvoir un compte n'émet aucun code.
    process.env.AUTH_DEV_OTP = 'true';
    const t = convexTest(schema, modules);
    await t.mutation(internal.devAdmin.setRoleByEmail, {
      email: ADMIN,
      role: 'admin',
    });
    expect(
      await t.run((ctx) => ctx.db.query('devOtpCodes').collect()),
    ).toHaveLength(0);
  });
});
