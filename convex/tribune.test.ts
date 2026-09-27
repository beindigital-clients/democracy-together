// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { TRIBUNE_BODY, TRIBUNE_COMMENT } from './lib/validation';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Ces tests portent sur le fil PUBLIÉ et ses effets (commentaires, compteurs,
// notifications, signalements) : le mode A POSTERIORI y est réglé
// explicitement, comme le ferait l'administrateur. La modération a priori —
// le défaut depuis le chantier communauté (F-45) — a ses propres tests
// (convex/communaute-moderation.test.ts).
async function aPosteriori<T extends ReturnType<typeof convexTest>>(t: T) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert('users', {
      role: 'admin',
      email: 'reglages@test.org',
    });
    await ctx.db.insert('communityModerationConfig', {
      key: 'default',
      postMode: 'a_posteriori',
      commentMode: 'a_posteriori',
      updatedBy: admin,
      updatedAt: 0,
    });
  });
  return t;
}

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
  // Langue de rédaction, déclarée par l'auteur (issue #35) : argument requis,
  // pas de repli implicite — c'est elle qui fixe le canonical de la fiche.
  lang: 'fr' as const,
  title: 'Sur les transitions',
  body: 'Une contribution courte mais valable.',
};

describe('Tribune — écriture (F-44)', () => {
  it('réserve la prise de parole aux membres, valide les champs', async () => {
    const t = await aPosteriori(convexTest(schema, modules));

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

describe('Tribune — langue de rédaction (issue #35)', () => {
  // Un billet est écrit dans UNE langue et n'est jamais traduit : c'est elle,
  // et non le préfixe d'URL visité, qui décide du canonical de la fiche. Elle
  // doit donc survivre à l'aller-retour écriture -> lecture.
  it('conserve la langue déclarée et la ressert au détail', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org', 'Awa Diop');

    // Rédigé en anglais — le cas que la langue de l'interface aurait deviné
    // de travers pour un membre qui navigue en français.
    const id = await as.mutation(api.tribune.createPost, {
      ...POST,
      lang: 'en',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.lang).toBe('en');
    expect((await t.query(api.tribune.getPost, { postId: id }))?.lang).toBe(
      'en',
    );
  });

  it('refuse une langue hors du vocabulaire servi', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');

    // Le cast exerce ce qu'un client non typé peut émettre : le validateur
    // d'arguments refuse, il ne replie pas en silence sur la langue par défaut
    // — sans quoi un billet se retrouverait canonicalisé dans une langue qui
    // n'est pas la sienne.
    await expect(
      as.mutation(api.tribune.createPost, {
        ...POST,
        lang: 'de',
      } as unknown as typeof POST),
    ).rejects.toThrow();
  });

  it('un billet antérieur au champ reste lisible, sans langue déclarée', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const authorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'ancien@test.org' }),
    );
    // Exactement la forme d'une ligne écrite avant l'ajout du champ : c'est ce
    // qui justifie `v.optional` en base plutôt qu'une migration.
    const id = await t.run((ctx) =>
      ctx.db.insert('tribunePosts', {
        authorUserId: authorId,
        authorName: 'Auteur historique',
        theme: 'transitions',
        format: 'court',
        title: 'Billet d’avant',
        body: 'Une contribution courte mais valable.',
        status: 'published',
        commentCount: 0,
        createdAt: 1_700_000_000_000,
      }),
    );

    const post = await t.query(api.tribune.getPost, { postId: id });
    expect(post).not.toBeNull();
    // Absence assumée : le repli sur la langue par défaut appartient à
    // `resolveLocale`, côté Next, seul endroit du projet à le décider.
    expect(post?.lang).toBeUndefined();
  });
});

describe('Tribune — fil & commentaires (F-47)', () => {
  it('liste par thème, commente (compteur + notif auteur)', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
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
    const t = await aPosteriori(convexTest(schema, modules));
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

// F-46 / campagne du 27/09 (A-05) : la longueur d'un billet est bornée PAR
// FORMAT — une « Brève » à 10 000 caractères, une « Analyse » à 20 000 — et
// le refus porte un code lisible par le composer (`ConvexError`), au lieu du
// « La publication a échoué » générique mesuré avec 21 000 caractères.
describe('Tribune — longueur calibrée par format (F-46, A-05)', () => {
  it('refuse une Brève de plus de 10 000 caractères, accepte l’Analyse équivalente', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');
    const body = 'a'.repeat(TRIBUNE_BODY.court.max + 1);

    await expect(
      as.mutation(api.tribune.createPost, { ...POST, format: 'court', body }),
    ).rejects.toMatchObject({ data: 'BODY_TOO_LONG' });

    // Le même texte tient dans une Analyse (≤ 20 000).
    const id = await as.mutation(api.tribune.createPost, {
      ...POST,
      format: 'fond',
      body,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.format).toBe('fond');
  });

  it('refuse une Analyse de plus de 20 000 caractères', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');
    await expect(
      as.mutation(api.tribune.createPost, {
        ...POST,
        format: 'fond',
        body: 'a'.repeat(TRIBUNE_BODY.fond.max + 1),
      }),
    ).rejects.toMatchObject({ data: 'BODY_TOO_LONG' });
  });

  it('accepte exactement la limite de chaque format', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');
    for (const format of ['court', 'fond'] as const) {
      const id = await as.mutation(api.tribune.createPost, {
        ...POST,
        format,
        body: 'a'.repeat(TRIBUNE_BODY[format].max),
      });
      expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('published');
    }
  });
});

// A-06 : un commentaire d'un caractère ou de 4 001 caractères était refusé en
// silence — le formulaire ne recevait aucun code exploitable.
describe('Tribune — commentaire refusé avec un code lisible (A-06)', () => {
  it('trop court et trop long portent INVALID_COMMENT dans `data`', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');
    const postId = await as.mutation(api.tribune.createPost, POST);
    for (const body of ['a', 'b'.repeat(TRIBUNE_COMMENT.max + 1)]) {
      await expect(
        as.mutation(api.tribune.addComment, { postId, body }),
      ).rejects.toMatchObject({ data: 'INVALID_COMMENT' });
    }
    // La borne exacte passe.
    await as.mutation(api.tribune.addComment, {
      postId,
      body: 'b'.repeat(TRIBUNE_COMMENT.max),
    });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.commentCount).toBe(1);
  });
});

// A-11 : l'auteur ne voyait jamais le statut de ses billets. `myPosts` rend
// les siens — publiés ET retirés — et seulement les siens.
describe('Tribune — mes billets et leur statut (A-11)', () => {
  it('rend les billets de l’appelant avec leur statut, et rien aux autres', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const awa = await member(t, 'awa@test.org', 'Awa Diop');
    const bob = await member(t, 'bob@test.org', 'Bob');
    const kept = await awa.as.mutation(api.tribune.createPost, POST);
    const removed = await awa.as.mutation(api.tribune.createPost, {
      ...POST,
      title: 'Sera retiré',
    });
    await bob.as.mutation(api.tribune.createPost, { ...POST, title: 'De Bob' });
    await t.run((ctx) => ctx.db.patch(removed, { status: 'removed' }));

    const mine = await awa.as.query(api.tribune.myPosts, {});
    expect(mine.map((p) => [p._id, p.status])).toEqual(
      expect.arrayContaining([
        [kept, 'published'],
        [removed, 'removed'],
      ]),
    );
    expect(mine).toHaveLength(2);
    // Le billet retiré n'apparaît plus dans le fil public…
    expect(
      (await t.query(api.tribune.listPosts, {})).map((p) => p._id),
    ).not.toContain(removed);
    // …et Bob ne voit que le sien.
    const bobs = await bob.as.query(api.tribune.myPosts, {});
    expect(bobs.map((p) => p.title)).toEqual(['De Bob']);
  });

  it('un visiteur anonyme reçoit une liste vide, pas une erreur', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    expect(await t.query(api.tribune.myPosts, {})).toEqual([]);
  });
});
