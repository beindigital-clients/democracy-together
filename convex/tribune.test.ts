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

async function member(
  t: ReturnType<typeof convexTest>,
  email: string,
  name?: string,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const POST = {
  theme: 'transitions',
  format: 'court' as const,
  title: 'Sur les transitions',
  body: 'Une contribution courte mais valable.',
};

describe('Tribune — écriture (F-44)', () => {
  it('réserve la prise de parole aux membres, valide les champs', async () => {
    const t = convexTest(schema, modules);

    // anonyme refusé
    await expect(t.mutation(api.tribune.createPost, POST)).rejects.toThrow();

    // visiteur refusé
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.tribune.createPost, POST),
    ).rejects.toThrow();

    const { as } = await member(t, 'm@test.org', 'Awa Diop');
    // thème invalide / titre trop court / format fond trop court
    await expect(
      as.mutation(api.tribune.createPost, { ...POST, theme: 'inconnu' }),
    ).rejects.toThrow();
    await expect(
      as.mutation(api.tribune.createPost, { ...POST, title: 'ab' }),
    ).rejects.toThrow();
    await expect(
      as.mutation(api.tribune.createPost, {
        ...POST,
        format: 'fond',
        body: 'trop court pour du fond',
      }),
    ).rejects.toThrow();

    // succès -> publié, nom d'auteur instantané
    const id = await as.mutation(api.tribune.createPost, POST);
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('published');
    expect(doc?.authorName).toBe('Awa Diop');
  });
});

describe('Tribune — fil & commentaires (F-47)', () => {
  it('liste par thème, commente (compteur + notif auteur)', async () => {
    const t = convexTest(schema, modules);
    const author = await member(t, 'author@test.org', 'Auteur');
    const commenter = await member(t, 'c@test.org', 'Commentateur');

    const id = await author.as.mutation(api.tribune.createPost, POST);
    await author.as.mutation(api.tribune.createPost, {
      ...POST,
      theme: 'crises',
      title: 'Autre sujet',
    });

    // filtre par thème
    const trans = await t.query(api.tribune.listPosts, {
      theme: 'transitions',
    });
    expect(trans).toHaveLength(1);
    expect(trans[0].title).toBe('Sur les transitions');
    // sans filtre : les deux
    expect((await t.query(api.tribune.listPosts, {})).length).toBe(2);

    // un autre membre commente -> compteur +1, notif à l'auteur
    await commenter.as.mutation(api.tribune.addComment, {
      postId: id,
      body: 'Bien vu, mais…',
    });
    const detail = await t.query(api.tribune.getPost, { postId: id });
    expect(detail?.commentCount).toBe(1);
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.comments[0].authorName).toBe('Commentateur');

    const notifs = await author.as.query(api.notifications.myNotifications, {});
    expect(notifs.some((n) => n.titleKey === 'tribuneComment')).toBe(true);

    // commenter son propre post ne se notifie pas
    await author.as.mutation(api.tribune.addComment, {
      postId: id,
      body: 'Je précise…',
    });
    const after = await author.as.query(api.notifications.myNotifications, {});
    expect(after.filter((n) => n.titleKey === 'tribuneComment')).toHaveLength(
      1,
    );
  });
});

describe('Tribune — signalement & modération (F-50)', () => {
  it('signaler puis retirer masque le contenu ; gating modérateur', async () => {
    const t = convexTest(schema, modules);
    const author = await member(t, 'author@test.org', 'Auteur');
    const id = await author.as.mutation(api.tribune.createPost, POST);

    // un membre signale le post
    await author.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: id,
    });

    // la file est réservée aux modérateurs
    await expect(t.query(api.tribune.listReports, {})).rejects.toThrow();
    await expect(
      author.as.query(api.tribune.listReports, {}),
    ).rejects.toThrow();

    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });

    const reports = await asMod.query(api.tribune.listReports, {});
    expect(reports).toHaveLength(1);
    expect(reports[0].excerpt).toBe('Sur les transitions');

    // retirer -> post masqué du fil + file vidée
    await asMod.mutation(api.tribune.resolveReport, {
      reportId: reports[0]._id,
      action: 'remove',
    });
    expect((await t.query(api.tribune.listPosts, {})).length).toBe(0);
    expect(await t.query(api.tribune.getPost, { postId: id })).toBeNull();
    expect((await asMod.query(api.tribune.listReports, {})).length).toBe(0);
  });
});
