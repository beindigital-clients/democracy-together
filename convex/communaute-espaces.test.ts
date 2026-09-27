// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import { ConvexError } from 'convex/values';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { WORKSPACE_FILE_LIMITS } from './lib/communaute';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// ESPACES COLLABORATIFS — fichiers, invitations, rôles (F-24, chantier
// communauté). Chaque règle est vérifiée par son REFUS autant que par son
// succès : un non-membre n'obtient ni liste, ni URL ; un lecteur ne dépose
// rien ; une invitation échue ne s'accepte pas.

type T = ReturnType<typeof convexTest>;

async function member(t: T, email: string, name?: string) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const WS = {
  title: 'Observatoire des budgets locaux',
  theme: 'gouvernance-numerique',
  description: 'Un espace pour partager nos relevés et nos analyses.',
};

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n% test\n1 0 obj\n');
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);

async function store(t: T, bytes: Uint8Array, type = 'application/pdf') {
  return await t.run((ctx) =>
    ctx.storage.store(new Blob([bytes as BlobPart], { type })),
  );
}

function code(err: unknown): unknown {
  return err instanceof ConvexError ? err.data : String(err);
}

async function expectCode(p: Promise<unknown>, expected: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught, `attendu : refus ${expected}`).not.toBeNull();
  expect(code(caught)).toBe(expected);
}

async function setup() {
  const t = convexTest(schema, modules);
  const anim = await member(t, 'anim@test.org', 'Animatrice');
  const contrib = await member(t, 'contrib@test.org', 'Contributeur');
  const reader = await member(t, 'lecteur@test.org', 'Lectrice');
  const outsider = await member(t, 'dehors@test.org', 'Extérieur');
  const wsId = await anim.as.mutation(api.workspaces.createWorkspace, WS);
  // contributeur : il rejoint l'espace ouvert ; lectrice : invitée en lecteur.
  await contrib.as.mutation(api.workspaces.joinWorkspace, {
    workspaceId: wsId,
  });
  await anim.as.mutation(api.workspaces.inviteMember, {
    workspaceId: wsId,
    email: 'lecteur@test.org',
    role: 'lecteur',
  });
  const [inv] = await reader.as.query(api.workspaces.myInvitations, {});
  await reader.as.mutation(api.workspaces.respondInvitation, {
    invitationId: inv._id,
    accept: true,
  });
  return { t, anim, contrib, reader, outsider, wsId };
}

async function upload(
  as: T,
  t: T,
  wsId: Id<'workspaces'>,
  name = 'releves.pdf',
  bytes = PDF_BYTES,
  fileId?: Id<'workspaceFiles'>,
) {
  const storageId = await store(t, bytes);
  return await as.action(api.workspaceFiles.attachFile, {
    workspaceId: wsId,
    storageId,
    name,
    ...(fileId ? { fileId } : {}),
  });
}

describe('Espaces — rôles dans l’espace', () => {
  it('le créateur anime, qui rejoint contribue, l’invité lecteur lit sans écrire', async () => {
    const { anim, contrib, reader, wsId } = await setup();
    const detail = await anim.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(detail?.members.map((m) => [m.userName, m.role]).sort()).toEqual([
      ['Animatrice', 'animateur'],
      ['Contributeur', 'contributeur'],
      ['Lectrice', 'lecteur'],
    ]);
    expect(detail?.myRole).toBe('animateur');

    await contrib.as.mutation(api.workspaces.addNote, {
      workspaceId: wsId,
      body: 'Note du contributeur.',
    });
    // Le lecteur lit le fil…
    const vue = await reader.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(vue?.notes.map((n) => n.body)).toEqual(['Note du contributeur.']);
    // …mais n'y écrit pas.
    await expectCode(
      reader.as.mutation(api.workspaces.addNote, {
        workspaceId: wsId,
        body: 'Je tente.',
      }),
      'READ_ONLY',
    );
  });

  it('un lecteur ne peut pas téléverser : ni URL d’envoi, ni rattachement', async () => {
    const { t, reader, wsId } = await setup();
    await expectCode(
      reader.as.mutation(api.workspaceFiles.generateUploadUrl, {
        workspaceId: wsId,
      }),
      'READ_ONLY',
    );
    await expectCode(upload(reader.as, t, wsId), 'READ_ONLY');
    // Le blob d'un appelant non autorisé n'est même pas effacé : un refus de
    // droits ne déclenche rien.
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(1);
  });

  it('seul un animateur invite, change un rôle ou retire un membre', async () => {
    const { contrib, reader, wsId, anim } = await setup();
    await expectCode(
      contrib.as.mutation(api.workspaces.inviteMember, {
        workspaceId: wsId,
        email: 'x@test.org',
        role: 'contributeur',
      }),
      'NOT_ANIMATOR',
    );
    const detail = await anim.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    const readerRow = detail!.members.find((m) => m.userName === 'Lectrice')!;
    await expectCode(
      contrib.as.mutation(api.workspaces.removeMember, {
        memberId: readerRow._id,
      }),
      'NOT_ANIMATOR',
    );
    await expectCode(
      contrib.as.mutation(api.workspaces.setMemberRole, {
        memberId: readerRow._id,
        role: 'animateur',
      }),
      'NOT_ANIMATOR',
    );
    // L'animatrice promeut la lectrice contributrice : elle peut écrire.
    await anim.as.mutation(api.workspaces.setMemberRole, {
      memberId: readerRow._id,
      role: 'contributeur',
    });
    await reader.as.mutation(api.workspaces.addNote, {
      workspaceId: wsId,
      body: 'Promue, j’écris.',
    });
  });

  it('retrait d’un membre : il sort, il est prévenu, l’acte est journalisé', async () => {
    const { t, anim, contrib, wsId } = await setup();
    const detail = await anim.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    const row = detail!.members.find((m) => m.userName === 'Contributeur')!;
    await anim.as.mutation(api.workspaces.removeMember, { memberId: row._id });

    const after = await anim.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(after?.members.map((m) => m.userName)).not.toContain('Contributeur');
    expect(after?.memberCount).toBe(2);
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', contrib.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain('workspaceRemoved');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('workspace.member_removed');
    // Retiré, il ne lit plus les notes.
    const vue = await contrib.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(vue?.isMember).toBe(false);
    expect(vue?.notes).toEqual([]);
  });

  it('le dernier animateur ne peut ni partir ni être rétrogradé ; un second le libère', async () => {
    const { anim, contrib, wsId } = await setup();
    await expectCode(
      anim.as.mutation(api.workspaces.leaveWorkspace, { workspaceId: wsId }),
      'LAST_ANIMATOR',
    );
    const detail = await anim.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(detail?.isLastAnimator).toBe(true);
    const self = detail!.members.find((m) => m.isSelf)!;
    await expectCode(
      anim.as.mutation(api.workspaces.setMemberRole, {
        memberId: self._id,
        role: 'lecteur',
      }),
      'LAST_ANIMATOR',
    );
    const c = detail!.members.find((m) => m.userName === 'Contributeur')!;
    await anim.as.mutation(api.workspaces.setMemberRole, {
      memberId: c._id,
      role: 'animateur',
    });
    await anim.as.mutation(api.workspaces.leaveWorkspace, {
      workspaceId: wsId,
    });
    const vue = await contrib.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    // La fiche passe au nouvel animateur.
    expect(vue?.ownerName).toBe('Contributeur');
    expect(vue?.isOwner).toBe(true);
  });
});

describe('Espaces — privés et invitations', () => {
  it('un espace privé est invisible hors de ses membres, et ne se rejoint pas', async () => {
    const t = convexTest(schema, modules);
    const anim = await member(t, 'anim@test.org', 'Animatrice');
    const other = await member(t, 'autre@test.org', 'Autre');
    const wsId = await anim.as.mutation(api.workspaces.createWorkspace, {
      ...WS,
      visibility: 'private',
    });
    expect(
      (await other.as.query(api.workspaces.listWorkspaces, {})).map(
        (w) => w._id,
      ),
    ).not.toContain(wsId);
    expect(
      await other.as.query(api.workspaces.getWorkspace, { workspaceId: wsId }),
    ).toBeNull();
    await expectCode(
      other.as.mutation(api.workspaces.joinWorkspace, { workspaceId: wsId }),
      'INVITATION_REQUIRED',
    );
    // Ses membres, eux, le voient.
    const mine = await anim.as.query(api.workspaces.listWorkspaces, {});
    expect(mine.find((w) => w._id === wsId)?.visibility).toBe('private');
  });

  it('l’invité voit la fiche (pas les notes), accepte, et entre avec le rôle prévu', async () => {
    const t = convexTest(schema, modules);
    const anim = await member(t, 'anim@test.org', 'Animatrice');
    const invitee = await member(t, 'Invitee@Test.org', 'Invitée');
    const wsId = await anim.as.mutation(api.workspaces.createWorkspace, {
      ...WS,
      visibility: 'private',
    });
    await anim.as.mutation(api.workspaces.addNote, {
      workspaceId: wsId,
      body: 'Note interne.',
    });
    // Adresse saisie avec une autre casse : normalisée.
    await anim.as.mutation(api.workspaces.inviteMember, {
      workspaceId: wsId,
      email: ' invitee@TEST.org ',
      role: 'contributeur',
    });
    const fiche = await invitee.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(fiche?.title).toBe(WS.title);
    expect(fiche?.notes).toEqual([]);
    expect(fiche?.isMember).toBe(false);

    const invs = await invitee.as.query(api.workspaces.myInvitations, {});
    expect(invs).toHaveLength(1);
    expect(invs[0].role).toBe('contributeur');
    expect(invs[0].workspaceTitle).toBe(WS.title);
    await invitee.as.mutation(api.workspaces.respondInvitation, {
      invitationId: invs[0]._id,
      accept: true,
    });
    const dedans = await invitee.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(dedans?.myRole).toBe('contributeur');
    expect(dedans?.notes.map((n) => n.body)).toEqual(['Note interne.']);
    // L'invitation est close ; l'animatrice est prévenue.
    expect(await invitee.as.query(api.workspaces.myInvitations, {})).toEqual(
      [],
    );
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', anim.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain(
      'workspaceInvitationAccepted',
    );
  });

  it('une invitation expirée est refusée, et ne fait entrer personne', async () => {
    const t = convexTest(schema, modules);
    const anim = await member(t, 'anim@test.org', 'Animatrice');
    const invitee = await member(t, 'late@test.org', 'Retardataire');
    const wsId = await anim.as.mutation(api.workspaces.createWorkspace, {
      ...WS,
      visibility: 'private',
    });
    await anim.as.mutation(api.workspaces.inviteMember, {
      workspaceId: wsId,
      email: 'late@test.org',
      role: 'contributeur',
    });
    const [inv] = await invitee.as.query(api.workspaces.myInvitations, {});
    await t.run((ctx) => ctx.db.patch(inv._id, { expiresAt: Date.now() - 1 }));
    await expectCode(
      invitee.as.mutation(api.workspaces.respondInvitation, {
        invitationId: inv._id,
        accept: true,
      }),
      'INVITATION_EXPIRED',
    );
    const members = await t.run((ctx) =>
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', wsId))
        .collect(),
    );
    expect(members).toHaveLength(1);
  });

  it('inviter ne révèle pas qui est inscrit ; seul un membre existant est notifié', async () => {
    const t = convexTest(schema, modules);
    const anim = await member(t, 'anim@test.org', 'Animatrice');
    const known = await member(t, 'connu@test.org', 'Connu');
    const wsId = await anim.as.mutation(api.workspaces.createWorkspace, WS);
    const a = await anim.as.mutation(api.workspaces.inviteMember, {
      workspaceId: wsId,
      email: 'connu@test.org',
      role: 'lecteur',
    });
    const b = await anim.as.mutation(api.workspaces.inviteMember, {
      workspaceId: wsId,
      email: 'inconnu@test.org',
      role: 'lecteur',
    });
    expect(a).toEqual(b);
    const notifs = await t.run((ctx) =>
      ctx.db.query('notifications').collect(),
    );
    expect(notifs.map((n) => [n.userId, n.titleKey])).toEqual([
      [known.id, 'workspaceInvitation'],
    ]);
  });

  it('on ne répond pas à l’invitation d’un autre', async () => {
    const t = convexTest(schema, modules);
    const anim = await member(t, 'anim@test.org', 'Animatrice');
    const invitee = await member(t, 'invitee@test.org');
    const thief = await member(t, 'thief@test.org');
    const wsId = await anim.as.mutation(api.workspaces.createWorkspace, WS);
    await anim.as.mutation(api.workspaces.inviteMember, {
      workspaceId: wsId,
      email: 'invitee@test.org',
      role: 'animateur',
    });
    const [inv] = await invitee.as.query(api.workspaces.myInvitations, {});
    await expectCode(
      thief.as.mutation(api.workspaces.respondInvitation, {
        invitationId: inv._id,
        accept: true,
      }),
      'NOT_FOUND',
    );
  });
});

describe('Espaces — fichiers partagés', () => {
  it('dépôt, versions successives avec auteur et date, lecture par un lecteur', async () => {
    const { t, anim, contrib, reader, wsId } = await setup();
    const first = await upload(contrib.as, t, wsId);
    expect(first.version).toBe(1);
    const second = await upload(
      anim.as,
      t,
      wsId,
      'ignoré.pdf',
      PDF_BYTES,
      first.fileId,
    );
    expect(second).toEqual({ fileId: first.fileId, version: 2 });

    const files = await reader.as.query(api.workspaceFiles.listFiles, {
      workspaceId: wsId,
    });
    expect(files).toHaveLength(1);
    // Le NOM est celui du fichier logique ; les versions gardent leur auteur.
    expect(files[0].name).toBe('releves.pdf');
    expect(files[0].currentVersion).toBe(2);
    expect(files[0].versions.map((v) => [v.version, v.authorName])).toEqual([
      [2, 'Animatrice'],
      [1, 'Contributeur'],
    ]);
    expect(files[0].versions[0].contentType).toBe('application/pdf');
    expect(files[0].canDelete).toBe(false);
    // Aucune URL ni identifiant de stockage dans la liste.
    expect(JSON.stringify(files)).not.toMatch(/storage|https?:/i);

    const url = await reader.as.query(api.workspaceFiles.fileVersionUrl, {
      versionId: files[0].versions[1]._id,
    });
    expect(typeof url).toBe('string');

    const ws = await t.run((ctx) => ctx.db.get(wsId));
    expect(ws?.storageBytes).toBe(PDF_BYTES.length * 2);
    expect(ws?.fileCount).toBe(1);
  });

  it('un non-membre n’obtient ni la liste, ni une URL, ni le droit de déposer', async () => {
    const { t, contrib, outsider, wsId } = await setup();
    await upload(contrib.as, t, wsId);
    const files = await contrib.as.query(api.workspaceFiles.listFiles, {
      workspaceId: wsId,
    });
    await expectCode(
      outsider.as.query(api.workspaceFiles.listFiles, { workspaceId: wsId }),
      'NOT_A_MEMBER',
    );
    await expectCode(
      outsider.as.query(api.workspaceFiles.fileVersionUrl, {
        versionId: files[0].versions[0]._id,
      }),
      'NOT_A_MEMBER',
    );
    await expectCode(
      outsider.as.mutation(api.workspaceFiles.generateUploadUrl, {
        workspaceId: wsId,
      }),
      'NOT_A_MEMBER',
    );
    // Anonyme : refusé aussi.
    await expect(
      t.query(api.workspaceFiles.fileVersionUrl, {
        versionId: files[0].versions[0]._id,
      }),
    ).rejects.toThrow();
    // Et un non-membre ne lit pas non plus les notes (R-11, inchangé).
    const vue = await outsider.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(vue?.notes).toEqual([]);
  });

  it('le contenu est vérifié : extension hors liste, octets qui mentent', async () => {
    const { t, contrib, wsId } = await setup();
    await expectCode(
      upload(contrib.as, t, wsId, 'outil.exe', PDF_BYTES),
      'FILE_TYPE_NOT_ALLOWED',
    );
    // Une image PNG renommée en .pdf : la signature ne correspond pas.
    await expectCode(
      upload(contrib.as, t, wsId, 'faux.pdf', PNG_BYTES),
      'FILE_CONTENT_MISMATCH',
    );
    // Les blobs refusés ne restent pas dans le stockage.
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(0);
    // Le vrai PNG passe, sous son extension.
    const ok = await upload(contrib.as, t, wsId, 'carte.png', PNG_BYTES);
    expect(ok.version).toBe(1);
  });

  it('quota par espace : un dépôt qui le dépasse est refusé', async () => {
    const { t, contrib, wsId } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(wsId, {
        storageBytes: WORKSPACE_FILE_LIMITS.quotaBytes - 2,
      }),
    );
    await expectCode(upload(contrib.as, t, wsId), 'QUOTA_EXCEEDED');
  });

  it('un blob déjà rattaché ne sert pas une seconde fois (ni ailleurs)', async () => {
    const { t, anim, contrib, wsId } = await setup();
    const storageId = await store(t, PDF_BYTES);
    await contrib.as.action(api.workspaceFiles.attachFile, {
      workspaceId: wsId,
      storageId,
      name: 'a.pdf',
    });
    const other = await anim.as.mutation(api.workspaces.createWorkspace, {
      ...WS,
      title: 'Un autre espace',
    });
    await expectCode(
      anim.as.action(api.workspaceFiles.attachFile, {
        workspaceId: other,
        storageId,
        name: 'vol.pdf',
      }),
      'INVALID_FILE',
    );
    // Le blob du premier espace est intact.
    expect(
      await t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null),
    ).toBe(true);
  });

  it('suppression : par son auteur ou un animateur, pas par un autre contributeur', async () => {
    const { t, anim, contrib, reader, wsId } = await setup();
    const { fileId } = await upload(contrib.as, t, wsId);
    await expectCode(
      reader.as.mutation(api.workspaceFiles.deleteFile, { fileId }),
      'FORBIDDEN',
    );
    await anim.as.mutation(api.workspaceFiles.deleteFile, { fileId });
    expect(
      await contrib.as.query(api.workspaceFiles.listFiles, {
        workspaceId: wsId,
      }),
    ).toEqual([]);
    const ws = await t.run((ctx) => ctx.db.get(wsId));
    expect(ws?.storageBytes).toBe(0);
    expect(ws?.fileCount).toBe(0);
    expect(
      await t.run((ctx) => ctx.db.system.query('_storage').collect()),
    ).toHaveLength(0);
    // Supprimer le fichier d'autrui est un acte journalisé.
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('workspace.file_deleted');

    // Son auteur supprime le sien sans passer par l'audit.
    const mine = await upload(contrib.as, t, wsId, 'mien.pdf');
    await contrib.as.mutation(api.workspaceFiles.deleteFile, {
      fileId: mine.fileId,
    });
  });

  it('les autres membres sont prévenus d’un nouveau fichier', async () => {
    const { t, contrib, anim, wsId } = await setup();
    await upload(contrib.as, t, wsId);
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', anim.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain('workspaceFileAdded');
  });
});
