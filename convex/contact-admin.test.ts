// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
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

// F-17: "No admin screen or email to the secretariat: messages stay in
// the database, `contactMessages.handled` is never updated" (audit § 3.1). The
// contact form was therefore writing into a black hole: nobody could
// read what visitors sent.

async function withRole(
  t: ReturnType<typeof convexTest>,
  role: string,
  email: string,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', { role, email }));
  return t.withIdentity({ subject: `${id}|s` });
}

async function seedMessages(t: ReturnType<typeof convexTest>) {
  await t.mutation(internal.contact.store, {
    name: 'Awa Diop',
    email: 'awa@example.org',
    subject: 'Partenariat think tank',
    body: 'Nous souhaitons discuter d’un partenariat avec le réseau.',
  });
  await t.mutation(internal.contact.store, {
    name: 'Jean Martin',
    email: 'jean@example.org',
    subject: 'Question presse',
    body: 'Je prépare un article sur le baromètre et j’aurais des questions.',
  });
}

describe('Messages de contact — lecture réservée au back-office (F-17/F-26)', () => {
  it('refuse un anonyme, un visiteur et un simple membre', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);

    await expect(t.query(api.contact.listMessages, {})).rejects.toThrow();
    const asVisitor = await withRole(t, 'visiteur', 'v@test.org');
    await expect(
      asVisitor.query(api.contact.listMessages, {}),
    ).rejects.toThrow();
    const asMember = await withRole(t, 'membre', 'm@test.org');
    await expect(
      asMember.query(api.contact.listMessages, {}),
    ).rejects.toThrow();
  });

  it('un modérateur lit les messages, les plus récents d’abord', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');

    const msgs = await asMod.query(api.contact.listMessages, {});
    expect(msgs).toHaveLength(2);
    expect(msgs[0].subject).toBe('Question presse'); // the most recent
    expect(msgs[0].name).toBe('Jean Martin');
    expect(msgs[0].handled).toBe(false);
  });

  // REGRESSION — equal `createdAt`.
  //
  // `listMessages` sorted on `createdAt` alone. Two messages arriving in the
  // SAME millisecond give a comparator result of 0: `Array.sort` then keeps
  // the input order, i.e. that of `.collect()` — so the OLDEST
  // first, the opposite of what the screen announces. This is not theoretical: the
  // seed above inserts two messages back to back, and the "most
  // recent first" test failed as soon as the machine was fast enough to
  // timestamp them identically.
  //
  // Here the tie is FORCED, so that the guard does not depend on the machine's
  // speed. The sort must be a total order: `_creationTime` (sub-millisecond
  // precision) breaks the tie.
  it('ordonne du plus récent au plus ancien même à createdAt identique', async () => {
    const t = convexTest(schema, modules);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');

    const sameMs = 1_760_000_000_000;
    await t.run(async (ctx) => {
      await ctx.db.insert('contactMessages', {
        name: 'Premier inséré',
        email: 'un@example.org',
        subject: 'Le plus ancien',
        body: 'Inséré en premier.',
        handled: false,
        createdAt: sameMs,
      });
      await ctx.db.insert('contactMessages', {
        name: 'Second inséré',
        email: 'deux@example.org',
        subject: 'Le plus récent',
        body: 'Inséré en second, même milliseconde.',
        handled: false,
        createdAt: sameMs,
      });
    });

    const msgs = await asMod.query(api.contact.listMessages, {});
    expect(msgs.map((m) => m.subject)).toEqual([
      'Le plus récent',
      'Le plus ancien',
    ]);
  });

  it('filtre les messages non traités', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');
    const all = await asMod.query(api.contact.listMessages, {});

    await asMod.mutation(api.contact.setHandled, {
      messageId: all[0]._id,
      handled: true,
    });

    expect(
      await asMod.query(api.contact.listMessages, { status: 'pending' }),
    ).toHaveLength(1);
    expect(
      await asMod.query(api.contact.listMessages, { status: 'all' }),
    ).toHaveLength(2);
  });
});

describe('Messages de contact — marquage « traité » (F-17)', () => {
  it('bascule handled dans les deux sens et journalise', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');
    const [msg] = await asMod.query(api.contact.listMessages, {});

    await asMod.mutation(api.contact.setHandled, {
      messageId: msg._id,
      handled: true,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(msg._id)))?.handled,
      'handled n’était jamais mis à jour avant ce correctif',
    ).toBe(true);

    // reversible: a reopened message becomes actionable again
    await asMod.mutation(api.contact.setHandled, {
      messageId: msg._id,
      handled: false,
    });
    expect((await t.run((ctx) => ctx.db.get(msg._id)))?.handled).toBe(false);

    const log = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(log.filter((l) => l.action === 'contact.handled')).toHaveLength(2);
  });

  it('refuse le marquage à un simple membre', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');
    const [msg] = await asMod.query(api.contact.listMessages, {});

    const asMember = await withRole(t, 'membre', 'm@test.org');
    await expect(
      asMember.mutation(api.contact.setHandled, {
        messageId: msg._id,
        handled: true,
      }),
    ).rejects.toThrow();
  });

  it('refuse un message inexistant', async () => {
    const t = convexTest(schema, modules);
    await seedMessages(t);
    const asMod = await withRole(t, 'moderateur', 'mod@test.org');
    const [msg] = await asMod.query(api.contact.listMessages, {});
    await t.run((ctx) => ctx.db.delete(msg._id));

    await expect(
      asMod.mutation(api.contact.setHandled, {
        messageId: msg._id,
        handled: true,
      }),
    ).rejects.toThrow('NOT_FOUND');
  });
});
