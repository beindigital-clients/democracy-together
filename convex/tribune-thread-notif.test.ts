// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import fr from '../src/messages/fr.json';
import en from '../src/messages/en.json';

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
  // Langue de rédaction, déclarée par l'auteur (issue #35) : argument requis,
  // pas de repli implicite — c'est elle qui fixe le canonical de la fiche.
  lang: 'fr' as const,
  title: 'Sur les transitions',
  body: 'Une contribution courte mais valable.',
};

function countOf(notifs: { titleKey: string }[], titleKey: string): number {
  return notifs.filter((n) => n.titleKey === titleKey).length;
}

describe('Tribune — notifications de fil (F-25/F-51)', () => {
  it('notifie auteur + participants distincts, sans auto-notif ni doublon', async () => {
    const t = convexTest(schema, modules);
    const a = await member(t, 'a@test.org', 'A');
    const b = await member(t, 'b@test.org', 'B');
    const c = await member(t, 'c@test.org', 'C');

    // A poste.
    const postId = await a.as.mutation(api.tribune.createPost, POST);

    // B commente -> A reçoit un 'tribuneComment'. B (commentateur) n'a rien.
    await b.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Premier commentaire de B.',
    });
    let aNotifs = await a.as.query(api.notifications.myNotifications, {});
    expect(countOf(aNotifs, 'tribuneComment')).toBe(1);
    expect(countOf(aNotifs, 'tribuneThreadReply')).toBe(0);
    let bNotifs = await b.as.query(api.notifications.myNotifications, {});
    expect(countOf(bNotifs, 'tribuneComment')).toBe(0);
    expect(countOf(bNotifs, 'tribuneThreadReply')).toBe(0);

    // C commente -> A reçoit un 2e 'tribuneComment' ; B (participant) reçoit
    // un 'tribuneThreadReply' ; C ne se notifie pas.
    await c.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Réponse de C dans le fil.',
    });
    aNotifs = await a.as.query(api.notifications.myNotifications, {});
    expect(countOf(aNotifs, 'tribuneComment')).toBe(2);
    // L'auteur du post n'est jamais notifié via le canal « thread » (pas de
    // doublon avec 'tribuneComment').
    expect(countOf(aNotifs, 'tribuneThreadReply')).toBe(0);

    bNotifs = await b.as.query(api.notifications.myNotifications, {});
    expect(countOf(bNotifs, 'tribuneThreadReply')).toBe(1);
    expect(countOf(bNotifs, 'tribuneComment')).toBe(0);

    const cNotifs = await c.as.query(api.notifications.myNotifications, {});
    expect(cNotifs).toHaveLength(0);

    // Le lien et le titre interpolé sont présents sur la notif de fil de B.
    const threadNotif = bNotifs.find(
      (n) => n.titleKey === 'tribuneThreadReply',
    );
    expect(threadNotif?.params?.title).toBe(POST.title);
    expect(threadNotif?.link).toBe(`/tribune/${postId}`);
  });

  it('pas de doublon : B recommente ne crée pas de notif de fil pour B', async () => {
    const t = convexTest(schema, modules);
    const a = await member(t, 'a@test.org', 'A');
    const b = await member(t, 'b@test.org', 'B');
    const c = await member(t, 'c@test.org', 'C');

    const postId = await a.as.mutation(api.tribune.createPost, POST);
    await b.as.mutation(api.tribune.addComment, { postId, body: 'B parle.' });
    await c.as.mutation(api.tribune.addComment, { postId, body: 'C parle.' });

    // B recommente : B est l'auteur du nouveau commentaire, donc B ne se
    // notifie pas. C (autre participant) reçoit en revanche un fil.
    await b.as.mutation(api.tribune.addComment, {
      postId,
      body: 'B revient sur le sujet.',
    });

    const bNotifs = await b.as.query(api.notifications.myNotifications, {});
    // B n'a toujours qu'une seule notif de fil (celle déclenchée par C plus
    // haut), aucune en double depuis son propre nouveau commentaire.
    expect(countOf(bNotifs, 'tribuneThreadReply')).toBe(1);

    const cNotifs = await c.as.query(api.notifications.myNotifications, {});
    // C a été notifié par le 3e commentaire de B (C est participant distinct).
    expect(countOf(cNotifs, 'tribuneThreadReply')).toBe(1);
  });
});

describe('Tribune — i18n : terme « démocratie libérale » banni', () => {
  it('absent des clés de notification (FR + EN)', () => {
    const frReply = (fr.notifications as Record<string, string>)
      .tribuneThreadReply;
    const enReply = (en.notifications as Record<string, string>)
      .tribuneThreadReply;
    expect(frReply).toBeTruthy();
    expect(enReply).toBeTruthy();
    expect(frReply.toLowerCase()).not.toContain('démocratie libérale');
    expect(frReply.toLowerCase()).not.toContain('democratie liberale');
    expect(enReply.toLowerCase()).not.toContain('liberal democracy');
  });
});
