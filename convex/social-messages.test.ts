// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

// The Tribune is PRE-moderated by default (community workstream, F-45): a
// newly created post awaits approval. These tests cover what happens
// AFTER publication; they therefore set post-moderation mode, like the setting
// the administrator can choose.
async function tribuneAPosteriori(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert('users', {
      role: 'admin',
      email: 'reglages-tribune@test.org',
    });
    await ctx.db.insert('communityModerationConfig', {
      key: 'default',
      postMode: 'a_posteriori',
      commentMode: 'a_posteriori',
      updatedBy: admin,
      updatedAt: 0,
    });
  });
}

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Private messaging, follows, activity feed, deletion and export
// ("social" workstream).

type T = ReturnType<typeof convexTest>;
type Policy = 'nobody' | 'followed' | 'members';

type Caller = Pick<T, 'query'>;

// The thread as the screen shows it: oldest first (`listMessages` serves the
// newest first, page by page).
async function threadOf(as: Caller, conversationId: Id<'conversations'>) {
  const { page } = await as.query(api.social.messages.listMessages, {
    conversationId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  return [...page].reverse();
}

async function person(
  t: T,
  name: string,
  opts: {
    role?: string;
    policy?: Policy;
    visibility?: 'private' | 'members' | 'public';
    muted?: string[];
    profile?: boolean;
  } = {},
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: `${name.toLowerCase()}@test.org`,
      name,
      // Explicit role of each test account (member, unless stated otherwise).
      role: (opts.role === undefined ? 'membre' : opts.role) as never,
    }),
  );
  const as = t.withIdentity({ subject: `${id}|s` });
  if (opts.profile !== false) {
    await as.mutation(api.social.profiles.saveProfile, {
      displayName: name,
      handle: '',
      bio: '',
      jobTitle: '',
      country: '',
      themes: [],
      languages: [],
      links: [],
      visibility: opts.visibility ?? 'members',
      messagePolicy: opts.policy ?? 'members',
      mutedNotificationTypes: opts.muted ?? [],
      messageEmail: false,
    });
  }
  return { id, as };
}

describe('Messagerie — envoi, non-lus, lecture', () => {
  it('A écrit à B : B voit un non-lu, la pastille compte, marquer comme lu remet à zéro', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Bonjour Bob' },
    );
    expect(await b.as.query(api.social.messages.unreadSummary, {})).toEqual({
      count: 1,
      capped: false,
    });
    expect(await a.as.query(api.social.messages.unreadSummary, {})).toEqual({
      count: 0,
      capped: false,
    });

    const list = await b.as.query(api.social.messages.listConversations, {});
    expect(list).toHaveLength(1);
    expect(list[0].unreadCount).toBe(1);
    expect(list[0].other.displayName).toBe('Awa');
    expect(list[0].preview).toEqual({
      fromMe: false,
      text: 'Bonjour Bob',
      removed: false,
    });

    await a.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Tu es là ?',
    });
    const thread = await b.as.query(api.social.messages.getConversation, {
      conversationId,
    });
    expect(thread?.unreadCount).toBe(2);
    expect((await threadOf(b.as, conversationId)).map((m) => m.body)).toEqual([
      'Bonjour Bob',
      'Tu es là ?',
    ]);

    await b.as.mutation(api.social.messages.markRead, { conversationId });
    expect(await b.as.query(api.social.messages.unreadSummary, {})).toEqual({
      count: 0,
      capped: false,
    });

    // B's reply: unread on A's side, and only one conversation per pair.
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Oui !',
    });
    expect(
      (await a.as.query(api.social.messages.unreadSummary, {})).count,
    ).toBe(1);
    const again = await a.as.mutation(api.social.messages.startConversation, {
      userId: b.id,
      body: 'Encore moi',
    });
    expect(again).toBe(conversationId);
  });

  it('la notification ne porte que le nom, jamais le contenu — et une rafale ne sonne qu’une fois', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Contenu confidentiel 1234' },
    );
    await a.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Contenu confidentiel 5678',
    });
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', b.id))
        .collect(),
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('social_message');
    expect(JSON.stringify(notifs[0])).not.toContain('confidentiel');
    expect(notifs[0].params).toEqual({ name: 'Awa' });
  });

  it('préférence coupée : aucun message ne crée de notification', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob', { muted: ['social_message'] });
    await a.as.mutation(api.social.messages.startConversation, {
      userId: b.id,
      body: 'Bonjour',
    });
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', b.id))
        .collect(),
    );
    expect(notifs).toHaveLength(0);
    // …but the messaging unread count still exists.
    expect(
      (await b.as.query(api.social.messages.unreadSummary, {})).count,
    ).toBe(1);
  });

  it('bornes du message : vide et trop long refusés', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: '   ',
      }),
    ).rejects.toThrow(/EMPTY_MESSAGE/);
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/MESSAGE_TOO_LONG/);
  });

  it('limitation de débit : au-delà de 30 messages en 10 minutes', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Message 0' },
    );
    for (let i = 1; i < 30; i++) {
      await a.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body: `Message ${i}`,
      });
    }
    await expect(
      a.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body: 'Un de trop',
      }),
    ).rejects.toThrow(/RATE_LIMITED/);
  });
});

describe('Messagerie — « qui peut m’écrire »', () => {
  it('personne : refusé', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob', { policy: 'nobody' });
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/POLICY/);
  });

  it('personnes suivies : refusé tant que le destinataire ne suit pas l’expéditeur', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob', { policy: 'followed' });
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/POLICY/);
    // A follows B: that is not enough (it is B who opens their door).
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/POLICY/);
    await b.as.mutation(api.social.follows.follow, { userId: a.id });
    await a.as.mutation(api.social.messages.startConversation, {
      userId: b.id,
      body: 'Bonjour',
    });
  });

  it('celui qui ouvre l’échange ne peut pas se voir refuser la réponse', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa', { policy: 'nobody' });
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Je vous écris' },
    );
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Et je vous réponds',
    });
  });

  it('un visiteur (non membre) ne peut ni écrire ni recevoir', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const v = await person(t, 'Visiteur', { role: 'visiteur' });
    await expect(
      v.as.mutation(api.social.messages.startConversation, {
        userId: a.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: v.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it('profil privé : écrire est refusé comme pour un profil inexistant', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob', { visibility: 'private' });
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it('sans profil, on ne peut pas écrire (le destinataire doit savoir qui écrit)', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa', { profile: false });
    const b = await person(t, 'Bob');
    await expect(
      a.as.mutation(api.social.messages.startConversation, {
        userId: b.id,
        body: 'Bonjour',
      }),
    ).rejects.toThrow(/PROFILE_REQUIRED/);
  });
});

describe('Messagerie — blocage (dans les deux sens)', () => {
  it('B bloque A : ni A ni B ne peuvent plus écrire, et les suivis tombent', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    await b.as.mutation(api.social.follows.follow, { userId: a.id });
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Bonjour' },
    );
    await b.as.mutation(api.social.messages.block, { userId: a.id });

    await expect(
      a.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body: 'Encore',
      }),
    ).rejects.toThrow(/BLOCKED/);
    await expect(
      b.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body: 'Et moi',
      }),
    ).rejects.toThrow(/BLOCKED/);
    await expect(
      a.as.mutation(api.social.follows.follow, { userId: b.id }),
    ).rejects.toThrow(/NOT_FOUND|BLOCKED/);

    const network = await a.as.query(api.social.follows.myNetwork, {});
    expect(network?.following.items).toHaveLength(0);
    expect(network?.followers.items).toHaveLength(0);
    const counts = await b.as.query(api.social.profiles.getMine, {});
    expect(counts?.followerCount).toBe(0);
    expect(counts?.followingCount).toBe(0);

    const thread = await b.as.query(api.social.messages.getConversation, {
      conversationId,
    });
    expect(thread?.refusal).toBe('BLOCKED');
    expect(thread?.blockedByMe).toBe(true);

    await b.as.mutation(api.social.messages.unblock, { userId: a.id });
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Débloqué',
    });
  });
});

describe('Messagerie — un tiers ne lit jamais une conversation', () => {
  it('ni un autre membre, ni un administrateur, ni un anonyme', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const c = await person(t, 'Chloe');
    const admin = await person(t, 'Admin', { role: 'admin' });
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Secret entre nous' },
    );
    const [msg] = await threadOf(a.as, conversationId);

    for (const intruder of [c.as, admin.as, t]) {
      expect(
        await intruder.query(api.social.messages.getConversation, {
          conversationId,
        }),
      ).toBeNull();
      expect((await threadOf(intruder, conversationId)).length).toBe(0);
      expect(
        await intruder.query(api.social.messages.typingState, {
          conversationId,
        }),
      ).toBeNull();
    }
    for (const intruder of [c.as, admin.as]) {
      await expect(
        intruder.mutation(api.social.messages.sendMessage, {
          conversationId,
          body: 'Intrusion',
        }),
      ).rejects.toThrow(/NOT_FOUND/);
      await expect(
        intruder.mutation(api.social.messages.markRead, { conversationId }),
      ).rejects.toThrow(/NOT_FOUND/);
      await expect(
        intruder.mutation(api.social.messages.deleteMessage, {
          messageId: msg._id,
        }),
      ).rejects.toThrow(/NOT_FOUND/);
      await expect(
        intruder.mutation(api.social.messages.reportMessage, {
          messageId: msg._id,
        }),
      ).rejects.toThrow(/NOT_FOUND/);
      expect(
        await intruder.query(api.social.messages.listConversations, {}),
      ).toEqual([]);
    }
  });
});

describe('Messagerie — suppression de sa copie', () => {
  it('un message supprimé de ma copie reste chez l’autre ; supprimé des deux, il disparaît', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'À effacer' },
    );
    const messageId = (await threadOf(a.as, conversationId))[0]._id;
    await a.as.mutation(api.social.messages.deleteMessage, { messageId });
    expect(await threadOf(a.as, conversationId)).toHaveLength(0);
    expect(await threadOf(b.as, conversationId)).toHaveLength(1);
    await b.as.mutation(api.social.messages.deleteMessage, { messageId });
    expect(await t.run((ctx) => ctx.db.get(messageId))).toBeNull();
  });

  it('effacer la conversation la retire de ma liste ; un nouveau message la ramène, sans l’historique', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Ancien' },
    );
    await b.as.mutation(api.social.messages.deleteConversation, {
      conversationId,
    });
    expect(await b.as.query(api.social.messages.listConversations, {})).toEqual(
      [],
    );
    await new Promise((r) => setTimeout(r, 2));
    await a.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Nouveau',
    });
    expect((await threadOf(b.as, conversationId)).map((m) => m.body)).toEqual([
      'Nouveau',
    ]);
    // On A's side, nothing has changed.
    expect((await threadOf(a.as, conversationId)).map((m) => m.body)).toEqual([
      'Ancien',
      'Nouveau',
    ]);
  });
});

describe('Messagerie — signalement et modération', () => {
  it('B signale un message de A ; le modérateur ne lit que la transmission ; retirer vide le message ; le journal ne porte aucun contenu', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const mod = await person(t, 'Modo', { role: 'moderateur' });
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Propos injurieux' },
    );
    await a.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Autre message non signalé',
    });
    const messageId = (await threadOf(b.as, conversationId))[0]._id;

    // You cannot report your own message.
    await expect(
      a.as.mutation(api.social.messages.reportMessage, { messageId }),
    ).rejects.toThrow(/OWN_MESSAGE/);
    await b.as.mutation(api.social.messages.reportMessage, {
      messageId,
      reason: 'Insulte',
    });
    // Idempotent.
    await b.as.mutation(api.social.messages.reportMessage, { messageId });

    // A member cannot access the queue.
    await expect(
      b.as.query(api.social.messages.listReports, {}),
    ).rejects.toThrow();
    const queue = await mod.as.query(api.social.messages.listReports, {});
    expect(queue).toHaveLength(1);
    expect(queue[0].excerpt).toBe('Propos injurieux');
    expect(queue[0].reason).toBe('Insulte');
    expect(queue[0].reportedName).toBe('Awa');
    expect(JSON.stringify(queue)).not.toContain('non signalé');

    await mod.as.mutation(api.social.messages.resolveReport, {
      reportId: queue[0]._id,
      action: 'remove',
    });
    expect(await mod.as.query(api.social.messages.listReports, {})).toEqual([]);
    const [after] = await threadOf(a.as, conversationId);
    expect(after).toMatchObject({ removed: true, body: '' });

    const audit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) =>
          q.eq('action', 'message.report_resolved'),
        )
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('injurieux');
    // Minimization: the forwarded copy is erased once the report is decided.
    const report = await t.run((ctx) => ctx.db.get(queue[0]._id));
    expect(report?.bodySnapshot).toBeUndefined();
  });
});

describe('Messagerie — lu, saisie en cours, réponses, corrections, réactions', () => {
  it('« Vu » : l’instant de lecture de l’autre avance quand il lit', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Tu as vu ?' },
    );
    const [sent] = await threadOf(a.as, conversationId);
    await new Promise((r) => setTimeout(r, 2));
    const before = await a.as.query(api.social.messages.getConversation, {
      conversationId,
    });
    expect(before!.otherLastReadAt).toBeLessThan(sent.createdAt);
    await b.as.mutation(api.social.messages.markRead, { conversationId });
    const after = await a.as.query(api.social.messages.getConversation, {
      conversationId,
    });
    expect(after!.otherLastReadAt).toBeGreaterThanOrEqual(sent.createdAt);
  });

  it('saisie en cours : visible par l’autre seulement, effacée à l’envoi', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Salut' },
    );
    await b.as.mutation(api.social.messages.setTyping, {
      conversationId,
      typing: true,
    });
    const seen = await a.as.query(api.social.messages.typingState, {
      conversationId,
    });
    expect(seen!.until).toBeGreaterThan(Date.now());
    // One does not see oneself typing.
    expect(
      await b.as.query(api.social.messages.typingState, { conversationId }),
    ).toBeNull();
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Réponse',
    });
    expect(
      await a.as.query(api.social.messages.typingState, { conversationId }),
    ).toBeNull();

    await b.as.mutation(api.social.messages.setTyping, {
      conversationId,
      typing: true,
    });
    await b.as.mutation(api.social.messages.setTyping, {
      conversationId,
      typing: false,
    });
    expect(
      await a.as.query(api.social.messages.typingState, { conversationId }),
    ).toBeNull();

    // Blocked: the signal is no longer written.
    await a.as.mutation(api.social.messages.block, { userId: b.id });
    await b.as.mutation(api.social.messages.setTyping, {
      conversationId,
      typing: true,
    });
    expect(
      await a.as.query(api.social.messages.typingState, { conversationId }),
    ).toBeNull();
  });

  it('répondre à un message : la citation suit la copie de chacun', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const c = await person(t, 'Chloe');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'On se voit jeudi ?' },
    );
    const [question] = await threadOf(b.as, conversationId);
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Oui, à 10 h',
      replyToId: question._id,
    });
    const reply = (await threadOf(a.as, conversationId))[1];
    expect(reply.replyTo).toEqual({
      _id: question._id,
      fromMe: true,
      excerpt: 'On se voit jeudi ?',
      removed: false,
    });

    // Quoting a message of ANOTHER conversation is refused.
    const other = await c.as.mutation(api.social.messages.startConversation, {
      userId: a.id,
      body: 'Autre fil',
    });
    const [foreign] = await threadOf(c.as, other);
    await expect(
      b.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body: 'Intrus',
        replyToId: foreign._id,
      }),
    ).rejects.toThrow(/NOT_FOUND/);

    // A deletes the quoted message from their copy: the quote disappears
    // for A, not for B.
    await a.as.mutation(api.social.messages.deleteMessage, {
      messageId: question._id,
    });
    expect((await threadOf(a.as, conversationId))[0].replyTo).toBeNull();
    expect((await threadOf(b.as, conversationId))[1].replyTo?._id).toBe(
      question._id,
    );
  });

  it('corriger son message : seulement l’expéditeur, dans le quart d’heure', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Rendez-vous à 10 h' },
    );
    const [m] = await threadOf(a.as, conversationId);
    expect(m.editedAt).toBeNull();
    await a.as.mutation(api.social.messages.editMessage, {
      messageId: m._id,
      body: 'Rendez-vous à 11 h',
    });
    const [edited] = await threadOf(b.as, conversationId);
    expect(edited.body).toBe('Rendez-vous à 11 h');
    expect(edited.editedAt).not.toBeNull();

    await expect(
      b.as.mutation(api.social.messages.editMessage, {
        messageId: m._id,
        body: 'Détourné',
      }),
    ).rejects.toThrow(/NOT_EDITABLE/);
    await expect(
      a.as.mutation(api.social.messages.editMessage, {
        messageId: m._id,
        body: '   ',
      }),
    ).rejects.toThrow(/EMPTY_MESSAGE/);

    await t.run((ctx) =>
      ctx.db.patch(m._id, { createdAt: Date.now() - 16 * 60 * 1000 }),
    );
    await expect(
      a.as.mutation(api.social.messages.editMessage, {
        messageId: m._id,
        body: 'Trop tard',
      }),
    ).rejects.toThrow(/NOT_EDITABLE/);
  });

  it('réactions : une par personne, remplaçable, retirable, vocabulaire fermé', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Bonne nouvelle !' },
    );
    const [m] = await threadOf(b.as, conversationId);
    await b.as.mutation(api.social.messages.reactToMessage, {
      messageId: m._id,
      emoji: '👍',
    });
    await b.as.mutation(api.social.messages.reactToMessage, {
      messageId: m._id,
      emoji: '❤️',
    });
    await a.as.mutation(api.social.messages.reactToMessage, {
      messageId: m._id,
      emoji: '😂',
    });
    expect((await threadOf(a.as, conversationId))[0].reactions).toEqual([
      { emoji: '❤️', mine: false },
      { emoji: '😂', mine: true },
    ]);
    await b.as.mutation(api.social.messages.reactToMessage, {
      messageId: m._id,
      emoji: null,
    });
    expect((await threadOf(b.as, conversationId))[0].reactions).toEqual([
      { emoji: '😂', mine: false },
    ]);
    await expect(
      b.as.mutation(api.social.messages.reactToMessage, {
        messageId: m._id,
        emoji: '💩',
      }),
    ).rejects.toThrow(/INVALID_REACTION/);

    await a.as.mutation(api.social.messages.block, { userId: b.id });
    await expect(
      b.as.mutation(api.social.messages.reactToMessage, {
        messageId: m._id,
        emoji: '👍',
      }),
    ).rejects.toThrow(/BLOCKED/);
  });

  it('fil paginé : du plus récent au plus ancien, page par page', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'm1' },
    );
    for (const body of ['m2', 'm3', 'm4', 'm5']) {
      await a.as.mutation(api.social.messages.sendMessage, {
        conversationId,
        body,
      });
    }
    const first = await b.as.query(api.social.messages.listMessages, {
      conversationId,
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((m) => m.body)).toEqual(['m5', 'm4']);
    expect(first.isDone).toBe(false);
    const second = await b.as.query(api.social.messages.listMessages, {
      conversationId,
      paginationOpts: { numItems: 3, cursor: first.continueCursor },
    });
    expect(second.page.map((m) => m.body)).toEqual(['m3', 'm2', 'm1']);
  });
});

describe('Suivi — compteurs, visibilité, fil d’activité', () => {
  it('suivre / ne plus suivre tient les compteurs des deux côtés', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    expect(
      (await a.as.query(api.social.profiles.getMine, {}))?.followingCount,
    ).toBe(1);
    expect(
      (await b.as.query(api.social.profiles.getMine, {}))?.followerCount,
    ).toBe(1);
    const net = await b.as.query(api.social.follows.myNetwork, {});
    expect(net?.followers.items.map((i) => i.displayName)).toEqual(['Awa']);
    await a.as.mutation(api.social.follows.unfollow, { userId: b.id });
    expect(
      (await b.as.query(api.social.profiles.getMine, {}))?.followerCount,
    ).toBe(0);
  });

  it('on ne suit pas un profil privé (même refus qu’un profil inexistant)', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob', { visibility: 'private' });
    await expect(
      a.as.mutation(api.social.follows.follow, { userId: b.id }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it('le fil ne montre que les contenus PUBLIÉS des personnes suivies', async () => {
    const t = convexTest(schema, modules);
    await tribuneAPosteriori(t);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    const published = await b.as.mutation(api.tribune.createPost, {
      theme: 'transitions',
      format: 'court',
      lang: 'fr',
      title: 'Billet publié',
      body: 'Une contribution courte mais valable.',
    });
    const removed = await b.as.mutation(api.tribune.createPost, {
      theme: 'transitions',
      format: 'court',
      lang: 'fr',
      title: 'Billet retiré',
      body: 'Une contribution courte mais valable.',
    });
    await t.run((ctx) => ctx.db.patch(removed, { status: 'removed' }));
    await t.run((ctx) =>
      ctx.db.insert('publications', {
        title: 'Dépôt en attente',
        slug: 'depot-en-attente',
        type: 'note',
        theme: 'participation',
        region: 'afrique',
        languages: ['fr'],
        access: 'open',
        authors: [{ name: 'Bob' }],
        year: 2026,
        publishedAt: Date.now(),
        abstract: 'Résumé',
        keypoints: [],
        body: [],
        doi: '10.0/x',
        downloads: 0,
        citations: 0,
        status: 'pending',
        authorUserId: b.id,
        createdAt: Date.now(),
      }),
    );
    const feed = await a.as.query(api.social.follows.activityFeed, {});
    expect(feed.map((i) => i.title)).toEqual(['Billet publié']);
    expect(feed[0].href).toBe(`/tribune/${published}`);

    // B goes private: their activity leaves the feed.
    await b.as.mutation(api.social.profiles.saveProfile, {
      displayName: 'Bob',
      handle: '',
      bio: '',
      jobTitle: '',
      country: '',
      themes: [],
      languages: [],
      links: [],
      visibility: 'private',
      messagePolicy: 'members',
      mutedNotificationTypes: [],
      messageEmail: false,
    });
    expect(await a.as.query(api.social.follows.activityFeed, {})).toEqual([]);
  });

  it('suivre une organisation active', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const orgId = await t.run((ctx) =>
      ctx.db.insert('organizations', {
        name: 'Institut X',
        slug: 'institut-x',
        country: 'SN',
        region: 'afrique-ouest',
        languages: ['fr'],
        themes: ['gouvernance'],
        status: 'active',
        createdAt: 0,
      }),
    );
    await a.as.mutation(api.social.follows.setOrgFollow, {
      orgId,
      follow: true,
    });
    expect(
      await a.as.query(api.social.follows.myFollowedOrganizations, {}),
    ).toEqual([{ name: 'Institut X', slug: 'institut-x' }]);
    expect(
      await a.as.query(api.social.follows.orgFollowState, { orgId }),
    ).toEqual({ following: true, canFollow: true });
  });
});

describe('Compte — suppression et export', () => {
  it('deleteUserDataSocial efface profil, photo, suivis, conversations et tient les compteurs d’autrui', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    const c = await person(t, 'Chloe');
    const photo = await t.run((ctx) =>
      ctx.storage.store(new Blob(['x'], { type: 'image/png' })),
    );
    await t.run(async (ctx) => {
      const p = await ctx.db
        .query('memberProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', a.id))
        .unique();
      await ctx.db.patch(p!._id, { photoId: photo });
    });
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    await c.as.mutation(api.social.follows.follow, { userId: a.id });
    await c.as.mutation(api.social.messages.block, { userId: a.id });
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Bonjour' },
    );
    await b.as.mutation(api.social.messages.setTyping, {
      conversationId,
      typing: true,
    });

    let done = false;
    for (let i = 0; i < 10 && !done; i++) {
      ({ done } = await t.mutation(
        internal.social.account.deleteUserDataSocialStep,
        { userId: a.id },
      ));
    }
    expect(done).toBe(true);

    const leftovers = await t.run(async (ctx) => ({
      profile: await ctx.db
        .query('memberProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', a.id))
        .unique(),
      photo: await ctx.db.system.get('_storage', photo),
      conversation: await ctx.db.get(conversationId),
      messages: await ctx.db
        .query('directMessages')
        .withIndex('by_conversation', (q) =>
          q.eq('conversationId', conversationId),
        )
        .collect(),
      follows: (await ctx.db.query('follows').collect()).filter(
        (f) => f.followerId === a.id || f.followeeId === a.id,
      ),
      blocks: (await ctx.db.query('blocks').collect()).filter(
        (x) => x.blockedId === a.id || x.blockerId === a.id,
      ),
      typing: await ctx.db.query('conversationTyping').collect(),
    }));
    expect(leftovers).toEqual({
      profile: null,
      photo: null,
      conversation: null,
      messages: [],
      follows: [],
      blocks: [],
      typing: [],
    });
    expect(
      (await b.as.query(api.social.profiles.getMine, {}))?.followerCount,
    ).toBe(0);
    expect(
      (await c.as.query(api.social.profiles.getMine, {}))?.followingCount,
    ).toBe(0);
    expect(await b.as.query(api.social.messages.listConversations, {})).toEqual(
      [],
    );
  });

  it('exportUserDataSocial rend le profil, les suivis et SA copie des conversations', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'Awa');
    const b = await person(t, 'Bob');
    await a.as.mutation(api.social.follows.follow, { userId: b.id });
    const conversationId = await a.as.mutation(
      api.social.messages.startConversation,
      { userId: b.id, body: 'Aller' },
    );
    await b.as.mutation(api.social.messages.sendMessage, {
      conversationId,
      body: 'Retour',
    });
    const data = await t.query(
      internal.social.account.exportUserDataSocialQuery,
      { userId: a.id },
    );
    expect(data.profile?.displayName).toBe('Awa');
    expect(data.following.map((f) => f.displayName)).toEqual(['Bob']);
    expect(data.conversations).toEqual([
      {
        with: 'Bob',
        messages: [
          expect.objectContaining({ fromMe: true, body: 'Aller' }),
          expect.objectContaining({ fromMe: false, body: 'Retour' }),
        ],
      },
    ]);
    // Same thing via the screen, for oneself only.
    const mine = await a.as.query(api.social.profiles.exportMine, {});
    expect(mine?.conversations).toHaveLength(1);
    expect(await t.query(api.social.profiles.exportMine, {})).toBeNull();
  });
});
