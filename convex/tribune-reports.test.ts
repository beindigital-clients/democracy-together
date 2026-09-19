// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Déni de service de la file de modération (audit M1 / pentest H-2).
// `reportContent` acceptait un `targetId` chaîne ARBITRAIRE. `listReports` fait
// ensuite un ctx.db.get(targetId) : un identifiant malformé faisait échouer la
// requête pour TOUS les modérateurs — et comme un signalement ne se résout que
// depuis cette page, la file devenait définitivement inaccessible. N'importe
// quel compte authentifié pouvait donc la condamner.

async function userWith(
  t: ReturnType<typeof convexTest>,
  role: string,
  email: string,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', { role, email }));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function setup() {
  const t = convexTest(schema, modules);
  const membre = await userWith(t, 'membre', 'm@test.org');
  const mod = await userWith(t, 'moderateur', 'mod@test.org');
  const postId = await membre.as.mutation(api.tribune.createPost, {
    theme: 'transitions',
    format: 'court',
    title: 'Sur les transitions',
    body: 'Une contribution courte mais valable.',
  });
  return { t, membre, mod, postId };
}

describe('Signalements Tribune — validation de la cible (audit M1)', () => {
  it('refuse un targetId qui n’est pas un identifiant Convex', async () => {
    const { membre } = await setup();
    await expect(
      membre.as.mutation(api.tribune.reportContent, {
        targetType: 'post',
        targetId: 'pas-un-id',
        reason: 'test',
      }),
    ).rejects.toThrow('INVALID_TARGET');
  });

  it('refuse un identifiant bien formé mais inexistant', async () => {
    const { t, membre } = await setup();
    // identifiant syntaxiquement valide pour la table, mais supprimé
    const ghost = await t.run(async (ctx) => {
      const id = await ctx.db.insert('tribunePosts', {
        theme: 'transitions',
        format: 'court',
        title: 'Fantôme',
        body: 'Sera supprimé.',
        authorUserId: membre.id,
        authorName: 'M',
        status: 'published',
        commentCount: 0,
        createdAt: 0,
      } as never);
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      membre.as.mutation(api.tribune.reportContent, {
        targetType: 'post',
        targetId: ghost,
      }),
    ).rejects.toThrow('INVALID_TARGET');
  });

  it('refuse un identifiant valide mais de la MAUVAISE table', async () => {
    const { membre, postId } = await setup();
    await expect(
      membre.as.mutation(api.tribune.reportContent, {
        targetType: 'comment', // ... alors que l'id est celui d'un post
        targetId: postId,
      }),
    ).rejects.toThrow('INVALID_TARGET');
  });

  it('accepte un signalement légitime sur un post', async () => {
    const { membre, mod, postId } = await setup();
    const r = await membre.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: postId,
      reason: 'hors sujet',
    });
    expect(r.ok).toBe(true);
    const reports = await mod.as.query(api.tribune.listReports, {});
    expect(reports).toHaveLength(1);
    expect(reports[0].excerpt).toBe('Sur les transitions');
  });

  it('accepte un signalement légitime sur un commentaire', async () => {
    const { t, membre, mod, postId } = await setup();
    const commentId = await t.run((ctx) =>
      ctx.db.insert('tribuneComments', {
        postId,
        body: 'Un commentaire problématique.',
        authorUserId: membre.id,
        authorName: 'M',
        status: 'published',
        createdAt: 0,
      } as never),
    );
    await membre.as.mutation(api.tribune.reportContent, {
      targetType: 'comment',
      targetId: commentId,
    });
    const reports = await mod.as.query(api.tribune.listReports, {});
    expect(reports).toHaveLength(1);
    expect(reports[0].postId).toBe(postId);
  });
});

describe('Signalements Tribune — la file résiste aux données déjà corrompues', () => {
  // Le correctif doit aussi GUÉRIR : une ligne malformée écrite avant le
  // correctif ne doit plus condamner la file pour tous les modérateurs.
  it('listReports ne lève pas sur une ligne corrompue préexistante', async () => {
    const { t, membre, mod, postId } = await setup();
    // signalement légitime
    await membre.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: postId,
    });
    // ligne empoisonnée insérée directement en base (héritage d'avant le
    // correctif) : targetId n'est pas un identifiant Convex
    await t.run((ctx) =>
      ctx.db.insert('tribuneReports', {
        targetType: 'post',
        targetId: '../../etc/passwd',
        reporterUserId: membre.id,
        resolved: false,
        createdAt: 1,
      } as never),
    );

    const reports = await mod.as.query(api.tribune.listReports, {});
    expect(reports).toHaveLength(2);
    // la cible illisible est signalée comme telle, la file reste exploitable
    expect(reports.some((r) => r.excerpt === '(supprimé)')).toBe(true);
    expect(reports.some((r) => r.excerpt === 'Sur les transitions')).toBe(true);
  });

  it('un signalement à la cible illisible reste TRAITABLE (dismiss et remove)', async () => {
    const { t, membre, mod } = await setup();
    const poisoned = await t.run((ctx) =>
      ctx.db.insert('tribuneReports', {
        targetType: 'post',
        targetId: 'cible-illisible',
        reporterUserId: membre.id,
        resolved: false,
        createdAt: 1,
      } as never),
    );
    const poisonedComment = await t.run((ctx) =>
      ctx.db.insert('tribuneReports', {
        targetType: 'comment',
        targetId: 'cible-illisible',
        reporterUserId: membre.id,
        resolved: false,
        createdAt: 2,
      } as never),
    );

    // « retirer » ne doit pas lever, même si la cible est introuvable
    await mod.as.mutation(api.tribune.resolveReport, {
      reportId: poisoned,
      action: 'remove',
    });
    await mod.as.mutation(api.tribune.resolveReport, {
      reportId: poisonedComment,
      action: 'remove',
    });

    // la file est vidée : plus aucun signalement bloquant
    expect(await mod.as.query(api.tribune.listReports, {})).toHaveLength(0);
  });
});
