import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  trackTribuneCommentStatus,
  trackTribunePostStatus,
} from './lib/counters';
import { effectiveWorkspaceRole } from './lib/communaute';
import { normalizeEmail } from './lib/onboarding';
import { removeFileCascade } from './workspaceFiles';

// DONNÉES D'UN COMPTE — chantier communauté (espaces collaboratifs, Tribune,
// modération). Deux fonctions SIMPLES (pas des fonctions Convex) : la
// suppression de compte et l'export RGPD les appellent dans leur propre
// transaction, après avoir établi elles-mêmes qui parle. Elles ne lisent donc
// jamais `ctx.auth` : `userId` est une donnée qu'on leur confie, pas une
// identité qu'elles vérifient.
//
// Bornes : chaque lecture est plafonnée (un compte réel porte quelques
// dizaines de contenus). Au-delà, la fonction rend `complete: false` et
// l'appelant la rejoue dans une nouvelle transaction.

const BATCH = 500;

export type CommunauteDeletionReport = {
  complete: boolean;
  workspacesDeleted: number;
  workspacesTransferred: number;
  memberships: number;
  notes: number;
  fileVersions: number;
  invitations: number;
  posts: number;
  comments: number;
  reactions: number;
  reports: number;
};

// Supprime un ESPACE entier : notes, fichiers (et blobs), invitations,
// appartenances. Appelé quand son dernier membre disparaît.
async function deleteWorkspaceCascade(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
) {
  const notes = await ctx.db
    .query('workspaceNotes')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
    .take(BATCH);
  for (const n of notes) await ctx.db.delete(n._id);
  const files = await ctx.db
    .query('workspaceFiles')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
    .take(BATCH);
  for (const f of files) await removeFileCascade(ctx, f);
  for (const status of [
    'pending',
    'accepted',
    'declined',
    'revoked',
  ] as const) {
    const invs = await ctx.db
      .query('workspaceInvitations')
      .withIndex('by_workspace_and_status', (q) =>
        q.eq('workspaceId', workspaceId).eq('status', status),
      )
      .take(BATCH);
    for (const i of invs) await ctx.db.delete(i._id);
  }
  const members = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
    .take(BATCH);
  for (const m of members) await ctx.db.delete(m._id);
  await ctx.db.delete(workspaceId);
}

// Supprime un billet et tout ce qui s'y rattache (commentaires, réactions,
// signalements, historique, invitations à approfondir). Les contributions de
// fond d'AUTRES auteurs qui le prolongeaient restent en ligne : elles perdent
// leur lien, pas leur existence.
async function deletePostCascade(ctx: MutationCtx, post: Doc<'tribunePosts'>) {
  const comments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .take(BATCH);
  for (const c of comments) {
    if (c.status === 'published')
      await trackTribuneCommentStatus(ctx, c.status, null);
    await deleteTargetTrail(ctx, 'comment', c._id);
    await ctx.db.delete(c._id);
  }
  const reactions = await ctx.db
    .query('tribuneReactions')
    .withIndex('by_post_and_user', (q) => q.eq('postId', post._id))
    .take(BATCH);
  for (const r of reactions) await ctx.db.delete(r._id);
  const invites = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .take(BATCH);
  for (const i of invites) await ctx.db.delete(i._id);
  for (const status of [
    'pending',
    'published',
    'rejected',
    'removed',
  ] as const) {
    const children = await ctx.db
      .query('tribunePosts')
      .withIndex('by_parent_and_status', (q) =>
        q.eq('parentPostId', post._id).eq('status', status),
      )
      .take(BATCH);
    for (const child of children) {
      await ctx.db.patch(child._id, { parentPostId: undefined });
    }
  }
  await deleteTargetTrail(ctx, 'post', post._id);
  await trackTribunePostStatus(ctx, post.status, null);
  await ctx.db.delete(post._id);
}

// Signalements et historique d'un contenu supprimé : ils décrivaient un
// contenu qui n'existe plus.
async function deleteTargetTrail(
  ctx: MutationCtx,
  targetType: 'post' | 'comment',
  targetId: string,
) {
  const reports = await ctx.db
    .query('tribuneReports')
    .withIndex('by_target', (q) => q.eq('targetId', targetId))
    .take(BATCH);
  for (const r of reports) await ctx.db.delete(r._id);
  const events = await ctx.db
    .query('moderationEvents')
    .withIndex('by_target', (q) =>
      q.eq('targetType', targetType).eq('targetId', targetId),
    )
    .take(BATCH);
  for (const e of events) await ctx.db.delete(e._id);
}

export async function deleteUserDataCommunaute(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<CommunauteDeletionReport> {
  const report: CommunauteDeletionReport = {
    complete: true,
    workspacesDeleted: 0,
    workspacesTransferred: 0,
    memberships: 0,
    notes: 0,
    fileVersions: 0,
    invitations: 0,
    posts: 0,
    comments: 0,
    reactions: 0,
    reports: 0,
  };
  const user = await ctx.db.get(userId);
  const email = user?.email ? normalizeEmail(user.email) : null;

  // 1. ESPACES. L'appartenance part ; un espace dont l'utilisateur était le
  // dernier membre part avec elle ; un espace qui garde des membres passe à
  // un autre animateur (le plus ancien, ou à défaut le plus ancien membre,
  // promu) — un espace sans animateur ne se gère plus.
  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  for (const m of memberships) {
    const ws = await ctx.db.get(m.workspaceId);
    await ctx.db.delete(m._id);
    report.memberships++;
    if (!ws) continue;
    const rest = (
      await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
        .take(BATCH)
    ).sort((a, b) => a.joinedAt - b.joinedAt);
    if (rest.length === 0) {
      await deleteWorkspaceCascade(ctx, ws._id);
      report.workspacesDeleted++;
      continue;
    }
    const animators = rest.filter(
      (r) => effectiveWorkspaceRole(r.role) === 'animateur',
    );
    let heir = animators[0];
    if (!heir) {
      heir = rest[0];
      await ctx.db.patch(heir._id, { role: 'animateur' });
    }
    const patch: Partial<Doc<'workspaces'>> = {
      memberCount: Math.max(0, ws.memberCount - 1),
    };
    if (ws.ownerUserId === userId) {
      patch.ownerUserId = heir.userId;
      patch.ownerName = heir.userName;
      report.workspacesTransferred++;
    }
    await ctx.db.patch(ws._id, patch);
  }
  // Un espace dont il était « titulaire » sans y être membre (données
  // incohérentes) ne doit pas garder un identifiant orphelin.
  const owned = await ctx.db
    .query('workspaces')
    .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
    .take(BATCH);
  for (const ws of owned) {
    await deleteWorkspaceCascade(ctx, ws._id);
    report.workspacesDeleted++;
  }

  // 2. NOTES et VERSIONS de fichiers qu'il a déposées. Une version retirée
  // d'un fichier qui en garde d'autres laisse le fichier en place.
  const notes = await ctx.db
    .query('workspaceNotes')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  for (const n of notes) {
    await ctx.db.delete(n._id);
    report.notes++;
  }
  const versions = await ctx.db
    .query('workspaceFileVersions')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  for (const ver of versions) {
    const file = await ctx.db.get(ver.fileId);
    await ctx.storage.delete(ver.storageId);
    await ctx.db.delete(ver._id);
    report.fileVersions++;
    const ws = await ctx.db.get(ver.workspaceId);
    if (ws) {
      await ctx.db.patch(ws._id, {
        storageBytes: Math.max(0, (ws.storageBytes ?? 0) - ver.size),
      });
    }
    if (!file) continue;
    const remaining = await ctx.db
      .query('workspaceFileVersions')
      .withIndex('by_file_and_version', (q) => q.eq('fileId', file._id))
      .order('desc')
      .take(1);
    if (remaining.length === 0) {
      await ctx.db.delete(file._id);
      if (ws) {
        const fresh = await ctx.db.get(ws._id);
        if (fresh)
          await ctx.db.patch(ws._id, {
            fileCount: Math.max(0, (fresh.fileCount ?? 0) - 1),
          });
      }
    } else {
      const latest = remaining[0];
      await ctx.db.patch(file._id, {
        currentVersion: latest.version,
        versionCount: Math.max(1, file.versionCount - 1),
        totalBytes: Math.max(0, file.totalBytes - ver.size),
        latestSize: latest.size,
        latestContentType: latest.contentType,
      });
    }
  }

  // 3. INVITATIONS émises par lui, ou qui lui étaient adressées.
  const sent = await ctx.db
    .query('workspaceInvitations')
    .withIndex('by_inviter', (q) => q.eq('invitedBy', userId))
    .take(BATCH);
  const received = [
    ...(await ctx.db
      .query('workspaceInvitations')
      .withIndex('by_user_and_status', (q) => q.eq('invitedUserId', userId))
      .take(BATCH)),
    ...(email
      ? await ctx.db
          .query('workspaceInvitations')
          .withIndex('by_email_and_status', (q) => q.eq('email', email))
          .take(BATCH)
      : []),
  ];
  const seenInv = new Set<string>();
  for (const i of [...sent, ...received]) {
    if (seenInv.has(i._id)) continue;
    seenInv.add(i._id);
    await ctx.db.delete(i._id);
    report.invitations++;
  }
  const deepSent = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_inviter', (q) => q.eq('invitedBy', userId))
    .take(BATCH);
  const deepReceived = [
    ...(await ctx.db
      .query('tribuneDeepeningInvites')
      .withIndex('by_user', (q) => q.eq('invitedUserId', userId))
      .take(BATCH)),
    ...(email
      ? await ctx.db
          .query('tribuneDeepeningInvites')
          .withIndex('by_email', (q) => q.eq('email', email))
          .take(BATCH)
      : []),
  ];
  for (const i of [...deepSent, ...deepReceived]) {
    if (seenInv.has(i._id)) continue;
    seenInv.add(i._id);
    await ctx.db.delete(i._id);
    report.invitations++;
  }

  // 4. TRIBUNE : ses billets (et ce qui s'y rattache), ses commentaires, ses
  // réactions, ses signalements.
  const posts = await ctx.db
    .query('tribunePosts')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  for (const p of posts) {
    await deletePostCascade(ctx, p);
    report.posts++;
  }
  const comments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  for (const c of comments) {
    if (c.status === 'published') {
      await trackTribuneCommentStatus(ctx, c.status, null);
      const post = await ctx.db.get(c.postId);
      if (post && post.commentCount > 0) {
        await ctx.db.patch(post._id, { commentCount: post.commentCount - 1 });
      }
    }
    await deleteTargetTrail(ctx, 'comment', c._id);
    await ctx.db.delete(c._id);
    report.comments++;
  }
  const reactions = await ctx.db
    .query('tribuneReactions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  for (const r of reactions) {
    await ctx.db.delete(r._id);
    report.reactions++;
  }
  const reports = await ctx.db
    .query('tribuneReports')
    .withIndex('by_reporter', (q) => q.eq('reporterUserId', userId))
    .take(BATCH);
  for (const r of reports) {
    await ctx.db.delete(r._id);
    report.reports++;
  }

  // 5. HISTORIQUE DE MODÉRATION : les actes qu'il a posés sur les contenus
  // d'AUTRES restent — la décision a eu lieu — mais ne le nomment plus.
  const acts = await ctx.db
    .query('moderationEvents')
    .withIndex('by_actor', (q) => q.eq('actorId', userId))
    .take(BATCH);
  for (const e of acts) await ctx.db.patch(e._id, { actorId: undefined });

  report.complete = [
    memberships,
    notes,
    versions,
    sent,
    posts,
    comments,
    reactions,
    reports,
    acts,
  ].every((batch) => batch.length < BATCH);
  return report;
}

// EXPORT (droit d'accès, RGPD art. 15) — ce que le chantier communauté
// conserve de ce compte, sous une forme lisible. Pas de `storageId` ni d'URL :
// l'export décrit les fichiers, il ne les rouvre pas.
export async function exportUserDataCommunaute(
  ctx: QueryCtx,
  userId: Id<'users'>,
) {
  const memberships = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  const workspaces = [];
  for (const m of memberships) {
    const ws = await ctx.db.get(m.workspaceId);
    workspaces.push({
      title: ws?.title ?? null,
      role: effectiveWorkspaceRole(m.role),
      joinedAt: m.joinedAt,
    });
  }
  const notes = await ctx.db
    .query('workspaceNotes')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  const files = await ctx.db
    .query('workspaceFileVersions')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  const fileNames = new Map<string, string>();
  for (const f of files) {
    if (!fileNames.has(f.fileId)) {
      fileNames.set(f.fileId, (await ctx.db.get(f.fileId))?.name ?? '');
    }
  }
  const invitationsSent = await ctx.db
    .query('workspaceInvitations')
    .withIndex('by_inviter', (q) => q.eq('invitedBy', userId))
    .take(BATCH);
  const posts = await ctx.db
    .query('tribunePosts')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  const comments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  const reactions = await ctx.db
    .query('tribuneReactions')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  const reports = await ctx.db
    .query('tribuneReports')
    .withIndex('by_reporter', (q) => q.eq('reporterUserId', userId))
    .take(BATCH);
  const deepeningInvites = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_inviter', (q) => q.eq('invitedBy', userId))
    .take(BATCH);

  return {
    workspaces,
    workspaceNotes: notes.map((n) => ({
      body: n.body,
      createdAt: n.createdAt,
    })),
    workspaceFiles: files.map((f) => ({
      name: fileNames.get(f.fileId) ?? '',
      version: f.version,
      size: f.size,
      contentType: f.contentType,
      createdAt: f.createdAt,
    })),
    workspaceInvitationsSent: invitationsSent.map((i) => ({
      email: i.email,
      role: i.role,
      status: i.status,
      createdAt: i.createdAt,
    })),
    tribunePosts: posts.map((p) => ({
      title: p.title,
      body: p.body,
      format: p.format,
      theme: p.theme,
      status: p.status,
      rejectionReason: p.rejectionReason ?? null,
      createdAt: p.createdAt,
    })),
    tribuneComments: comments.map((c) => ({
      body: c.body,
      status: c.status,
      createdAt: c.createdAt,
    })),
    tribuneReactions: reactions.map((r) => ({
      postId: r.postId,
      createdAt: r.createdAt,
    })),
    tribuneReports: reports.map((r) => ({
      targetType: r.targetType,
      reason: r.reason ?? null,
      createdAt: r.createdAt,
    })),
    tribuneDeepeningInvitesSent: deepeningInvites.map((i) => ({
      email: i.email,
      status: i.status,
      createdAt: i.createdAt,
    })),
  };
}
