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

// F-17 : « Aucun écran admin ni e-mail au secrétariat : les messages restent en
// base, `contactMessages.handled` n'est jamais mis à jour » (audit § 3.1). Le
// formulaire de contact écrivait donc dans un trou noir : personne ne pouvait
// lire ce que les visiteurs envoyaient.

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
    expect(msgs[0].subject).toBe('Question presse'); // le plus récent
    expect(msgs[0].name).toBe('Jean Martin');
    expect(msgs[0].handled).toBe(false);
  });

  // RÉGRESSION — égalité de `createdAt`.
  //
  // `listMessages` triait sur `createdAt` seul. Deux messages arrivés dans la
  // MÊME milliseconde donnent un comparateur à 0 : `Array.sort` conserve alors
  // l'ordre d'entrée, c'est-à-dire celui de `.collect()` — donc le PLUS ANCIEN
  // en tête, l'inverse de ce que l'écran annonce. Ce n'est pas théorique : le
  // seed ci-dessus insère deux messages coup sur coup, et le test « les plus
  // récents d'abord » échouait dès que la machine était assez rapide pour les
  // horodater identiquement.
  //
  // Ici l'égalité est FORCÉE, pour que la garde ne dépende pas de la vitesse de
  // la machine. Le tri doit être un ordre total : `_creationTime` (précision
  // infra-milliseconde) départage.
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

    // réversible : un message rouvert redevient traitable
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
