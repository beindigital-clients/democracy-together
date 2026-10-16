// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
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

// These tests cover the PUBLISHED feed and its effects (comments, counters,
// notifications, reports): POST-moderation mode is set
// explicitly, as the administrator would. Pre-moderation —
// the default since the community workstream (F-45) — has its own tests
// (convex/communaute-moderation.test.ts).
async function aPosteriori<T extends TestConvex<typeof schema>>(t: T) {
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
  t: TestConvex<typeof schema>,
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

function countOf(notifs: { titleKey: string }[], titleKey: string): number {
  return notifs.filter((n) => n.titleKey === titleKey).length;
}

describe('Tribune — notifications de fil (F-25/F-51)', () => {
  it('notifie auteur + participants distincts, sans auto-notif ni doublon', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const a = await member(t, 'a@test.org', 'A');
    const b = await member(t, 'b@test.org', 'B');
    const c = await member(t, 'c@test.org', 'C');

    // A poste.
    const postId = await a.as.mutation(api.tribune.createPost, POST);

    // B comments -> A receives a 'tribuneComment'. B (commenter) gets nothing.
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

    // C comments -> A receives a 2nd 'tribuneComment'; B (participant) receives
    // a 'tribuneThreadReply'; C does not notify themselves.
    await c.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Réponse de C dans le fil.',
    });
    aNotifs = await a.as.query(api.notifications.myNotifications, {});
    expect(countOf(aNotifs, 'tribuneComment')).toBe(2);
    // The post author is never notified via the "thread" channel (no
    // duplicate with 'tribuneComment').
    expect(countOf(aNotifs, 'tribuneThreadReply')).toBe(0);

    bNotifs = await b.as.query(api.notifications.myNotifications, {});
    expect(countOf(bNotifs, 'tribuneThreadReply')).toBe(1);
    expect(countOf(bNotifs, 'tribuneComment')).toBe(0);

    const cNotifs = await c.as.query(api.notifications.myNotifications, {});
    expect(cNotifs).toHaveLength(0);

    // The link and the interpolated title are present on B's thread notification.
    const threadNotif = bNotifs.find(
      (n) => n.titleKey === 'tribuneThreadReply',
    );
    expect(threadNotif?.params?.title).toBe(POST.title);
    expect(threadNotif?.link).toBe(`/tribune/${postId}`);
  });

  it('pas de doublon : B recommente ne crée pas de notif de fil pour B', async () => {
    const t = await aPosteriori(convexTest(schema, modules));
    const a = await member(t, 'a@test.org', 'A');
    const b = await member(t, 'b@test.org', 'B');
    const c = await member(t, 'c@test.org', 'C');

    const postId = await a.as.mutation(api.tribune.createPost, POST);
    await b.as.mutation(api.tribune.addComment, { postId, body: 'B parle.' });
    await c.as.mutation(api.tribune.addComment, { postId, body: 'C parle.' });

    // B comments again: B is the author of the new comment, so B does not
    // notify themselves. C (other participant), however, receives a thread notification.
    await b.as.mutation(api.tribune.addComment, {
      postId,
      body: 'B revient sur le sujet.',
    });

    const bNotifs = await b.as.query(api.notifications.myNotifications, {});
    // B still has only one thread notification (the one triggered by C
    // above), no duplicate from their own new comment.
    expect(countOf(bNotifs, 'tribuneThreadReply')).toBe(1);

    const cNotifs = await c.as.query(api.notifications.myNotifications, {});
    // C was notified by B's 3rd comment (C is a distinct participant).
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
