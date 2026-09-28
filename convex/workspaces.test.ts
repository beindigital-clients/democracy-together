// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
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

    // anonyme refusé
    await expect(
      t.mutation(api.workspaces.createWorkspace, WS),
    ).rejects.toThrow();

    // visiteur (compte sans rôle « membre ») refusé
    const vId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${vId}|s` })
        .mutation(api.workspaces.createWorkspace, WS),
    ).rejects.toThrow();

    const owner = await member(t, 'owner@test.org', 'Awa Diop');

    // validation : thème inconnu / titre trop court / description trop courte
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

    // succès -> memberCount 1, owner ajouté dans workspaceMembers (role owner)
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

    // un autre membre rejoint -> memberCount 2, une seule appartenance
    await guest.as.mutation(api.workspaces.joinWorkspace, { workspaceId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.memberCount).toBe(2);

    // rejoindre une 2e fois est idempotent (pas de doublon, compteur stable)
    await guest.as.mutation(api.workspaces.joinWorkspace, { workspaceId: id });
    const memberships = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', id))
        .collect(),
    );
    expect(memberships).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.get(id)))?.memberCount).toBe(2);

    // l'owner ne peut pas quitter
    await expect(
      owner.as.mutation(api.workspaces.leaveWorkspace, { workspaceId: id }),
    ).rejects.toThrow();

    // l'invité quitte -> memberCount 1, appartenance retirée
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

    // un membre réseau NON membre de l'espace ne peut pas déposer de note
    await expect(
      outsider.as.mutation(api.workspaces.addNote, {
        workspaceId: id,
        body: 'Je tente une note',
      }),
    ).rejects.toThrow();

    // body trop court refusé (même pour l'owner)
    await expect(
      owner.as.mutation(api.workspaces.addNote, { workspaceId: id, body: 'a' }),
    ).rejects.toThrow();

    // l'owner (membre de l'espace) peut déposer
    await owner.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Première note de cadrage.',
    });

    // un membre réseau qui rejoint l'espace peut ensuite déposer
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
    // triées par date croissante
    expect(detail?.notes[0].body).toBe('Première note de cadrage.');
    expect(detail?.notes[0].authorName).toBe('Owner');
    expect(detail?.notes[1].authorName).toBe('Extérieur');
    expect(detail?.isMember).toBe(true);
    expect(detail?.members).toHaveLength(2);
  });
});

describe('Espaces — les notes ne se lisent qu’une fois dedans (R-11)', () => {
  // Tout membre du réseau lisait le fil complet d'un espace qu'il n'avait pas
  // rejoint : la lecture n'avait que la garde de rôle, seule l'écriture
  // vérifiait l'appartenance (mesuré le 27/09, membre A-6). La fiche — titre,
  // description, participants — reste lisible pour décider de rejoindre.
  it('un membre réseau étranger à l’espace voit la fiche, pas les notes', async () => {
    const t = convexTest(schema, modules);
    const owner = await member(t, 'owner@test.org', 'Owner');
    const outsider = await member(t, 'out@test.org', 'Extérieur');
    const id = await owner.as.mutation(api.workspaces.createWorkspace, WS);
    await owner.as.mutation(api.workspaces.addNote, {
      workspaceId: id,
      body: 'Note réservée aux membres de l’espace.',
    });

    // NON-VACUITÉ : la note existe bien en base.
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

    // Une fois l'espace rejoint, le fil se lit.
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
  // Les comptes invités n'ont qu'une adresse : ils s'affichaient tous
  // « Membre », indiscernables entre eux (mesuré le 27/09). Repli sur la
  // partie locale de l'adresse ; le nom, quand il existe, garde la priorité.
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
    // Le libellé générique n'apparaît plus dès qu'une adresse existe.
    expect(JSON.stringify(detail)).not.toContain('"Membre"');
  });
});

describe('Espaces — identifiant venu de l’URL (F-24)', () => {
  // L'identifiant de /espaces/<id> vient de n'importe qui. Avec `v.id`, un
  // `zzz` ou l'identifiant d'une AUTRE table faisaient lever la validation
  // d'arguments avant le handler, et la page tombait sur « Une erreur est
  // survenue » au lieu d'« introuvable » (mesuré le 27/09).
  it('un identifiant malformé ou étranger rend null, sans lever', async () => {
    const t = convexTest(schema, modules);
    const m = await member(t, 'm@dt.test', 'M');
    expect(
      await m.as.query(api.workspaces.getWorkspace, { workspaceId: 'zzz' }),
    ).toBeNull();
    // identifiant BIEN FORMÉ, mais d'une autre table
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

    // pour A : son espace a mine=true, celui de B mine=false
    const listForA = await a.as.query(api.workspaces.listWorkspaces, {});
    expect(listForA).toHaveLength(2);
    const mineA = listForA.find((w) => w._id === wsA);
    expect(mineA?.mine).toBe(true);
    expect(listForA.filter((w) => w.mine)).toHaveLength(1);

    // A rejoint l'espace de B -> deux espaces avec mine=true
    const wsB = listForA.find((w) => w._id !== wsA)!;
    await a.as.mutation(api.workspaces.joinWorkspace, { workspaceId: wsB._id });
    const after = await a.as.query(api.workspaces.listWorkspaces, {});
    expect(after.filter((w) => w.mine)).toHaveLength(2);

    // un visiteur (non membre réseau) ne peut pas lister
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
