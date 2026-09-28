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

// These tests cover the PUBLISHED feed and its effects (comments, counters,
// notifications, reports): POST-moderation mode is set
// explicitly, as the administrator would. Pre-moderation —
// the default since the community workstream (F-45) — has its own tests
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
  // Writing language, declared by the author (issue #35): required argument,
  // no implicit fallback — it is what sets the entry's canonical.
  lang: 'fr' as const,
  title: 'Sur les transitions',
  body: 'Une contribution courte mais valable.',
};

describe('Tribune — écriture (F-44)', () => {
  it('réserve la prise de parole aux membres, valide les champs', async () => {
    const t = await aPosteriori(convexTest(schema, modules));

    // anonymous rejected
    await expect(t.mutation(api.tribune.createPost, POST)).rejects.toThrow();

    // visitor rejected
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.tribune.createPost, POST),
    ).rejects.toThrow();

    const { as } = await member(t, 'm@test.org', 'Awa Diop');
    // invalid theme / title too short / long-form format too short
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

    // success -> published, instant author name
    const id = await as.mutation(api.tribune.createPost, POST);
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('published');
    expect(doc?.authorName).toBe('Awa Diop');
  });
});

describe('Tribune — langue de rédaction (issue #35)', () => {
  // A post is written in ONE language and is never translated: it is that language,
  // and not the visited URL prefix, that decides the entry's canonical. It
  // must therefore survive the write -> read round trip.
  it('conserve la langue déclarée et la ressert au détail', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org', 'Awa Diop');

    // Written in English — the case the interface language would have guessed
    // wrong for a member browsing in French.
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

    // The cast exercises what an untyped client can send: the argument
    // validator rejects it, it does not silently fall back to the default language
    // — otherwise a post would end up canonicalized in a language that
    // is not its own.
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
    // Exactly the shape of a row written before the field was added: this is what
    // justifies `v.optional` in the database rather than a migration.
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
    // Intended absence: the fallback to the default language belongs to
    // `resolveLocale`, on the Next side, the only place in the project that decides it.
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

    // filter by theme
    const trans = await t.query(api.tribune.listPosts, {
      theme: 'transitions',
    });
    expect(trans).toHaveLength(1);
    expect(trans[0].title).toBe('Sur les transitions');
    // without filter: both
    expect((await t.query(api.tribune.listPosts, {})).length).toBe(2);
    // The writing language comes out in the FEED (RGAA audit of 27/09, 8.7): the
    // page sets `lang` on the title and excerpt of a post that is not
    // in the page's language.
    expect(trans[0].lang).toBe('fr');

    // another member comments -> counter +1, notification to the author
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

    // commenting on one's own post does not notify
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

    // a member reports the post
    await author.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: id,
    });

    // the queue is reserved for moderators
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

    // remove -> post hidden from the feed + queue emptied
    await asMod.mutation(api.tribune.resolveReport, {
      reportId: reports[0]._id,
      action: 'remove',
    });
    expect((await t.query(api.tribune.listPosts, {})).length).toBe(0);
    expect(await t.query(api.tribune.getPost, { postId: id })).toBeNull();
    expect((await asMod.query(api.tribune.listReports, {})).length).toBe(0);
  });
});

// F-46 / 27/09 campaign (A-05): a post's length is bounded PER
// FORMAT — a "Brève" at 10,000 characters, an "Analyse" at 20,000 — and
// the refusal carries a code readable by the composer (`ConvexError`), instead of the
// generic "La publication a échoué" measured with 21,000 characters.
describe('Tribune — longueur calibrée par format (F-46, A-05)', () => {
  it('refuse une Brève de plus de 10 000 caractères, accepte l’Analyse équivalente', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const { as } = await member(t, 'm@test.org');
    const body = 'a'.repeat(TRIBUNE_BODY.court.max + 1);

    await expect(
      as.mutation(api.tribune.createPost, { ...POST, format: 'court', body }),
    ).rejects.toMatchObject({ data: 'BODY_TOO_LONG' });

    // The same text fits in an Analyse (≤ 20,000).
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

// A-06: a one-character or 4,001-character comment was rejected
// silently — the form received no usable code.
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
    // The exact bound passes.
    await as.mutation(api.tribune.addComment, {
      postId,
      body: 'b'.repeat(TRIBUNE_COMMENT.max),
    });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.commentCount).toBe(1);
  });
});

// A-11: the author never saw the status of their posts. `myPosts` returns
// theirs — published AND withdrawn — and only theirs.
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
    // The withdrawn post no longer appears in the public feed…
    expect(
      (await t.query(api.tribune.listPosts, {})).map((p) => p._id),
    ).not.toContain(removed);
    // …and Bob only sees his own.
    const bobs = await bob.as.query(api.tribune.myPosts, {});
    expect(bobs.map((p) => p.title)).toEqual(['De Bob']);
  });

  it('un visiteur anonyme reçoit une liste vide, pas une erreur', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    expect(await t.query(api.tribune.myPosts, {})).toEqual([]);
  });
});
