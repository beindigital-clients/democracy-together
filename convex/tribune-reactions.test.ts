// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Insère un membre et renvoie son id (helper).
async function seedMember(
  t: ReturnType<typeof convexTest>,
  email: string,
  role: 'membre' | 'visiteur' = 'membre',
): Promise<Id<'users'>> {
  return await t.run((ctx) => ctx.db.insert('users', { role, email }));
}

// Insère un post publié et renvoie son id (helper).
async function seedPost(
  t: ReturnType<typeof convexTest>,
  authorUserId: Id<'users'>,
): Promise<Id<'tribunePosts'>> {
  return await t.run((ctx) =>
    ctx.db.insert('tribunePosts', {
      authorUserId,
      authorName: 'Membre',
      theme: 'participation',
      format: 'court',
      title: 'Une prise de parole',
      body: 'Un texte assez long pour passer la validation minimale.',
      status: 'published',
      commentCount: 0,
      createdAt: Date.now(),
    }),
  );
}

describe('Tribune — réactions « soutien »', () => {
  it('toggle ajoute puis retire la réaction (unicité 1 par membre/post)', async () => {
    const t = convexTest(schema, modules);
    const author = await seedMember(t, 'author@test.org');
    const postId = await seedPost(t, author);
    const asAuthor = t.withIdentity({ subject: `${author}|s` });

    // Ajout
    const r1 = await asAuthor.mutation(api.tribune.toggleReaction, { postId });
    expect(r1.reacted).toBe(true);
    let state = await asAuthor.query(api.tribune.reactionState, { postId });
    expect(state.count).toBe(1);
    expect(state.mine).toBe(true);

    // Re-toggle = retrait (revient à 0)
    const r2 = await asAuthor.mutation(api.tribune.toggleReaction, { postId });
    expect(r2.reacted).toBe(false);
    state = await asAuthor.query(api.tribune.reactionState, { postId });
    expect(state.count).toBe(0);
    expect(state.mine).toBe(false);

    // Une seule ligne en base au plus à tout moment pour ce couple.
    const rows = await t.run((ctx) =>
      ctx.db.query('tribuneReactions').collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it("plusieurs membres : le décompte s'additionne, mine reste propre à chacun", async () => {
    const t = convexTest(schema, modules);
    const author = await seedMember(t, 'a@test.org');
    const postId = await seedPost(t, author);
    const m1 = await seedMember(t, 'm1@test.org');
    const m2 = await seedMember(t, 'm2@test.org');
    const asM1 = t.withIdentity({ subject: `${m1}|s` });
    const asM2 = t.withIdentity({ subject: `${m2}|s` });

    await asM1.mutation(api.tribune.toggleReaction, { postId });
    await asM2.mutation(api.tribune.toggleReaction, { postId });

    const s1 = await asM1.query(api.tribune.reactionState, { postId });
    expect(s1.count).toBe(2);
    expect(s1.mine).toBe(true);

    // Un 3e membre n'ayant pas réagi voit count=2 mais mine=false.
    const m3 = await seedMember(t, 'm3@test.org');
    const s3 = await t
      .withIdentity({ subject: `${m3}|s` })
      .query(api.tribune.reactionState, { postId });
    expect(s3.count).toBe(2);
    expect(s3.mine).toBe(false);
  });

  it('unicité : un même membre qui re-toggle ne crée pas de doublon (compte 0)', async () => {
    const t = convexTest(schema, modules);
    const author = await seedMember(t, 'a2@test.org');
    const postId = await seedPost(t, author);
    const asAuthor = t.withIdentity({ subject: `${author}|s` });

    await asAuthor.mutation(api.tribune.toggleReaction, { postId }); // +1
    await asAuthor.mutation(api.tribune.toggleReaction, { postId }); // -1 -> 0

    const state = await asAuthor.query(api.tribune.reactionState, { postId });
    expect(state.count).toBe(0);
    const rows = await t.run((ctx) =>
      ctx.db
        .query('tribuneReactions')
        .withIndex('by_post_and_user', (q) =>
          q.eq('postId', postId).eq('userId', author),
        )
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it('gating : anonyme et visiteur ne peuvent pas réagir', async () => {
    const t = convexTest(schema, modules);
    const author = await seedMember(t, 'a3@test.org');
    const postId = await seedPost(t, author);

    // Anonyme
    await expect(
      t.mutation(api.tribune.toggleReaction, { postId }),
    ).rejects.toThrow();

    // Visiteur (compte sans rôle membre)
    const visitor = await seedMember(t, 'v@test.org', 'visiteur');
    await expect(
      t
        .withIdentity({ subject: `${visitor}|s` })
        .mutation(api.tribune.toggleReaction, { postId }),
    ).rejects.toThrow();

    // Aucune réaction créée.
    const rows = await t.run((ctx) =>
      ctx.db.query('tribuneReactions').collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it('reactionState : mine=false pour un visiteur anonyme, sans throw', async () => {
    const t = convexTest(schema, modules);
    const author = await seedMember(t, 'a4@test.org');
    const postId = await seedPost(t, author);
    const asAuthor = t.withIdentity({ subject: `${author}|s` });
    await asAuthor.mutation(api.tribune.toggleReaction, { postId });

    // Lecture anonyme : voit le décompte, mais mine=false (pas de throw).
    const anon = await t.query(api.tribune.reactionState, { postId });
    expect(anon.count).toBe(1);
    expect(anon.mine).toBe(false);
  });
});
