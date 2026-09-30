// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import frMessages from '../src/messages/fr.json';
import enMessages from '../src/messages/en.json';

const frWorkspaces = (frMessages as Record<string, unknown>).workspaces;
const enWorkspaces = (enMessages as Record<string, unknown>).workspaces;

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

const WS = {
  title: 'Gouvernance ouverte au Sahel',
  theme: 'gouvernance-numerique',
  description: 'Un espace pour coordonner nos travaux sur la transparence.',
};

describe('Espaces — création & gating (F-24)', () => {
  it('réserve la création aux membres réseau ; ajoute le créateur comme owner', async () => {
    const t = convexTest(schema, modules);

    // anonymous rejected
    await expect(
      t.mutation(api.workspaces.createWorkspace, WS),
    ).rejects.toThrow();

    // visitor (account without the "membre" role) rejected
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.workspaces.createWorkspace, WS),
    ).rejects.toThrow();

    const owner = await member(t, 'owner@test.org', 'Awa Diop');

    // validation: unknown theme / title too short / description too short
    await expect(
      owner.as.mutation(api.workspaces.createWorkspace, {
        ...WS,
        theme: 'inconnu',
      }),
    ).rejects.toThrow();
    await expect(
      owner.as.mutation(api.workspaces.createWorkspace, { ...WS, title: 'ab' }),
    ).rejects.toThrow();
    await expect(
      owner.as.mutation(api.workspaces.createWorkspace, {
        ...WS,
        description: 'court',
      }),
    ).rejects.toThrow();

    // success -> memberCount 1, owner added to workspaceMembers (role owner)
    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.memberCount).toBe(1);
    expect(doc?.ownerName).toBe('Awa Diop');

    const memberships = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', id))
        .collect(),
    );
    expect(memberships).toHaveLength(1);
    expect(memberships[0].userId).toBe(owner.id);
    expect(memberships[0].role).toBe('animateur');
  });
});

describe('Espaces — rejoindre / quitter (F-24)', () => {
  it('unicité, memberCount, owner ne peut pas quitter', async () => {
    const t = convexTest(schema, modules);
    const owner = await member(t, 'owner@test.org', 'Owner');
    const guest = await member(t, 'guest@test.org', 'Invité');

    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);

    // another member joins -> memberCount 2, a single membership
    await guest.as.mutation(api.workspaces.joinWorkspace, { workspaceId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.memberCount).toBe(2);

    // joining a 2nd time is idempotent (no duplicate, stable counter)
    await guest.as.mutation(api.workspaces.joinWorkspace, { workspaceId: id });
    const memberships = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', id))
        .collect(),
    );
    expect(memberships).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.get(id)))?.memberCount).toBe(2);

    // the owner cannot leave
    await expect(
      owner.as.mutation(api.workspaces.leaveWorkspace, { workspaceId: id }),
    ).rejects.toThrow();

    // the invitee leaves -> memberCount 1, membership removed
    await guest.as.mutation(api.workspaces.leaveWorkspace, { workspaceId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.memberCount).toBe(1);
    const after = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', id))
        .collect(),
    );
    expect(after).toHaveLength(1);
    expect(after[0].userId).toBe(owner.id);
  });
});

describe('Espaces — notes réservées aux membres de l’espace (F-24)', () => {
  it('un non-membre de l’espace ne peut pas écrire ; un membre oui', async () => {
    const t = convexTest(schema, modules);
    const owner = await member(t, 'owner@test.org', 'Owner');
    const outsider = await member(t, 'out@test.org', 'Extérieur');

    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);

    // a network member who is NOT a member of the workspace cannot post a note
    await expect(
      outsider.as.mutation(api.workspaces.addNote, {
        workspaceId: id,
        body: 'Je tente une note',
      }),
    ).rejects.toThrow();

    // body too short rejected (even for the owner)
    await expect(
      owner.as.mutation(api.workspaces.addNote, { workspaceId: id, body: 'a' }),
    ).rejects.toThrow();

    // the owner (member of the workspace) can post
    await owner.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Première note de cadrage.',
    });

    // a network member who joins the workspace can then post
    await outsider.as.mutation(api.workspaces.joinWorkspace, {
      workspaceId: id,
    });
    await outsider.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Je contribue maintenant.',
    });

    const detail = await owner.as.query(api.workspaces.getWorkspace, {
      workspaceId: id,
    });
    expect(detail?.notes).toHaveLength(2);
    // sorted by ascending date
    expect(detail?.notes[0].body).toBe('Première note de cadrage.');
    expect(detail?.notes[0].authorName).toBe('Owner');
    expect(detail?.notes[1].authorName).toBe('Extérieur');
    expect(detail?.isMember).toBe(true);
    expect(detail?.members).toHaveLength(2);
  });
});

describe('Espaces — notes posted in the same millisecond (F-24)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Two members can post in the same millisecond, so `createdAt` alone does
  // not order the thread. Ties used to come back newest first.
  it('keeps posting order when notes share the same createdAt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 30, 10, 0, 0));
    const t = convexTest(schema, modules);
    const owner = await member(t, 'owner@test.org', 'Owner');
    const other = await member(t, 'other@test.org', 'Other');
    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);
    await other.as.mutation(api.workspaces.joinWorkspace, { workspaceId: id });

    for (const [author, body] of [
      [owner, 'First note.'],
      [other, 'Second note.'],
      [owner, 'Third note.'],
    ] as const) {
      await author.as.mutation(api.workspaces.addNote, {
        workspaceId: id,
        body,
      });
    }

    const detail = await owner.as.query(api.workspaces.getWorkspace, {
      workspaceId: id,
    });
    // The frozen clock really produced a tie.
    expect(new Set(detail?.notes.map((n) => n.createdAt)).size).toBe(1);
    expect(detail?.notes.map((n) => n.body)).toEqual([
      'First note.',
      'Second note.',
      'Third note.',
    ]);
  });
});

describe('Espaces — les notes ne se lisent qu’une fois dedans (R-11)', () => {
  // Any network member could read the full thread of a workspace they had not
  // joined: the read had only the role guard, only the write
  // checked membership (measured on 27/09, member A-6). The entry — title,
  // description, participants — remains readable in order to decide whether to join.
  it('un membre réseau étranger à l’espace voit la fiche, pas les notes', async () => {
    const t = convexTest(schema, modules);
    const owner = await member(t, 'owner@test.org', 'Owner');
    const outsider = await member(t, 'out@test.org', 'Extérieur');
    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);
    await owner.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Note réservée aux membres de l’espace.',
    });

    // NON-VACUITY: the note does exist in the database.
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('workspaceNotes')
          .withIndex('by_workspace', (q) => q.eq('workspaceId', id))
          .collect(),
      ),
    ).toHaveLength(1);

    const vue = await outsider.as.query(api.workspaces.getWorkspace, {
      workspaceId: id,
    });
    expect(vue?.title).toBe(WS.title);
    expect(vue?.description).toBe(WS.description);
    expect(vue?.members).toHaveLength(1);
    expect(vue?.isMember).toBe(false);
    expect(vue?.notes).toEqual([]);

    // Once the workspace is joined, the thread can be read.
    await outsider.as.mutation(api.workspaces.joinWorkspace, {
      workspaceId: id,
    });
    const dedans = await outsider.as.query(api.workspaces.getWorkspace, {
      workspaceId: id,
    });
    expect(dedans?.isMember).toBe(true);
    expect(dedans?.notes).toHaveLength(1);
    expect(dedans?.notes[0].body).toBe(
      'Note réservée aux membres de l’espace.',
    );
  });
});

describe('Espaces — nom affiché d’un compte sans `name` (A-11)', () => {
  // Invited accounts have only an address: they were all displayed as
  // "Membre", indistinguishable from each other (measured on 27/09). Fallback to the
  // local part of the address; the name, when it exists, keeps priority.
  it('replie sur la partie locale de l’e-mail pour l’animateur, les membres et les notes', async () => {
    const t = convexTest(schema, modules);
    const sansNom = await member(t, 'awa.diop@institut-sahel.org');
    const avecNom = await member(t, 'b@test.org', 'Bakary Koné');

    const id = await sansNom.as.mutation(api.workspaces.createWorkspace, WS);
    await avecNom.as.mutation(api.workspaces.joinWorkspace, {
      workspaceId: id,
    });
    await sansNom.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Première note.',
    });

    const detail = await sansNom.as.query(api.workspaces.getWorkspace, {
      workspaceId: id,
    });
    expect(detail?.ownerName).toBe('awa.diop');
    expect(detail?.members.map((m) => m.userName)).toEqual([
      'awa.diop',
      'Bakary Koné',
    ]);
    expect(detail?.notes[0].authorName).toBe('awa.diop');
    // The generic label no longer appears as soon as an address exists.
    expect(JSON.stringify(detail)).not.toContain('"Membre"');
  });
});

describe('Espaces — identifiant venu de l’URL (F-24)', () => {
  // The /espaces/<id> identifier comes from anyone. With `v.id`, a
  // `zzz` or the identifier of ANOTHER table made argument validation
  // throw before the handler, and the page fell on "Une erreur est
  // survenue" instead of "introuvable" (measured on 27/09).
  it('un identifiant malformé ou étranger rend null, sans lever', async () => {
    const t = convexTest(schema, modules);
    const m = await member(t, 'm@dt.test', 'M');
    expect(
      await m.as.query(api.workspaces.getWorkspace, { workspaceId: 'zzz' }),
    ).toBeNull();
    // WELL-FORMED identifier, but from another table
    expect(
      await m.as.query(api.workspaces.getWorkspace, { workspaceId: m.id }),
    ).toBeNull();
  });

  it('un visiteur reste refusé (la garde de rôle ne bouge pas)', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@dt.test' }),
    );
    const v = t.withIdentity({ subject: `${id}|s` });
    await expect(
      v.query(api.workspaces.getWorkspace, { workspaceId: 'zzz' }),
    ).rejects.toThrow(/rôle « membre » requis/);
    await expect(v.query(api.workspaces.listWorkspaces, {})).rejects.toThrow(
      /rôle « membre » requis/,
    );
  });
});

describe('Espaces — listWorkspaces.mine (F-24)', () => {
  it('mine reflète l’appartenance de l’utilisateur courant', async () => {
    const t = convexTest(schema, modules);
    const a = await member(t, 'a@test.org', 'A');
    const b = await member(t, 'b@test.org', 'B');

    const wsA = await a.as.mutation(api.workspaces.createWorkspace, WS);
    await b.as.mutation(api.workspaces.createWorkspace, {
      ...WS,
      title: 'Autre espace de B',
      theme: 'participation',
    });

    // for A: their workspace has mine=true, B's mine=false
    const listForA = await a.as.query(api.workspaces.listWorkspaces, {});
    expect(listForA).toHaveLength(2);
    const mineA = listForA.find((w) => w._id === wsA);
    expect(mineA?.mine).toBe(true);
    expect(listForA.filter((w) => w.mine)).toHaveLength(1);

    // A joins B's workspace -> two workspaces with mine=true
    const wsB = listForA.find((w) => w._id !== wsA)!;
    await a.as.mutation(api.workspaces.joinWorkspace, { workspaceId: wsB._id });
    const after = await a.as.query(api.workspaces.listWorkspaces, {});
    expect(after.filter((w) => w.mine)).toHaveLength(2);

    // a visitor (not a network member) cannot list
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v2@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .query(api.workspaces.listWorkspaces, {}),
    ).rejects.toThrow();
  });
});

describe('Espaces — contenu éditorial (terme banni)', () => {
  it('n’emploie jamais « démocratie libérale » / « liberal democracy »', () => {
    const blob = JSON.stringify([frWorkspaces, enWorkspaces]);
    expect(blob).not.toMatch(/d[ée]mocratie\s+lib[ée]rale/i);
    expect(blob).not.toMatch(/liberal\s+democracy/i);
  });
});
