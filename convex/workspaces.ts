import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { roleRank } from './lib/roles';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { isNetworkTheme } from './lib/themes';
import { isEmail } from './lib/validation';
import { normalizeEmail } from './lib/onboarding';
import { notify } from './lib/notify';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import {
  INVITATION_TTL_MS,
  WORKSPACE_FILE_LIMITS,
  effectiveVisibility,
  effectiveWorkspaceRole,
  invitationStatusValidator,
  workspaceRoleAtLeast,
  workspaceRoleValidator,
  workspaceVisibilityValidator,
  type WorkspaceRole,
} from './lib/communaute';

// Espaces de travail collaboratifs (F-24). Lecture de la fiche (titre,
// description, participants) réservée aux membres du réseau (membre+) ; les
// NOTES et les FICHIERS — lecture comme écriture — sont réservés aux membres
// DE L'ESPACE (workspaceMembers). `theme` = un des 5 axes du réseau (miroir de
// PUB_THEMES, src/lib/publications.ts — garder synchrone).
//
// Chantier communauté : trois rôles dans un espace (animateur / contributeur /
// lecteur, cf. convex/lib/communaute.ts), des espaces PRIVÉS sur invitation,
// les invitations expirantes, le retrait d'un membre. Les fichiers partagés
// vivent dans convex/workspaceFiles.ts.

// Nom affiché d'un membre dans un espace (animateur, participant, auteur de
// note). Les comptes créés par invitation ou par approbation d'adhésion n'ont
// pas de `name` — seulement une adresse : tous s'affichaient « Membre », donc
// indiscernables entre eux (mesuré le 27/09, membre A-11). Repli sur la partie
// locale de l'adresse, qui identifie sans exposer le domaine complet ; le
// libellé générique ne reste que pour un compte sans nom NI adresse.
export function memberName(user: Doc<'users'>): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split('@')[0]?.trim();
  return local || 'Membre';
}

// Appartenance (espace, utilisateur) — unicité via l'index composite.
export async function membershipOf(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
): Promise<Doc<'workspaceMembers'> | null> {
  return await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspace_and_user', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();
}

// Rôle de l'utilisateur dans l'espace, ou null s'il n'en est pas membre.
export async function workspaceRoleOf(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
): Promise<WorkspaceRole | null> {
  const m = await membershipOf(ctx, workspaceId, userId);
  return m ? effectiveWorkspaceRole(m.role) : null;
}

// Garde commune : membre du réseau, espace existant, rôle minimal DANS
// l'espace. C'est ici, et nulle part ailleurs, que se décide qui lit et qui
// écrit — l'interface ne masque que ce que le serveur refuserait.
export async function requireWorkspaceRole(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  min: WorkspaceRole,
): Promise<{
  user: Doc<'users'>;
  workspace: Doc<'workspaces'>;
  role: WorkspaceRole;
}> {
  const user = await requireNetworkRole(ctx, 'membre');
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new ConvexError('NOT_FOUND');
  const role = await workspaceRoleOf(ctx, workspaceId, user._id);
  if (!role) throw new ConvexError('NOT_A_MEMBER');
  if (!workspaceRoleAtLeast(role, min)) {
    throw new ConvexError(min === 'animateur' ? 'NOT_ANIMATOR' : 'READ_ONLY');
  }
  return { user, workspace, role };
}

const MEMBERS_MAX = 500;

async function membersOf(ctx: QueryCtx, workspaceId: Id<'workspaces'>) {
  return await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
    .take(MEMBERS_MAX);
}

// Nombre d'animateurs d'un espace. Un espace sans animateur ne se gère plus :
// ni invitation, ni retrait, ni suppression de fichier d'autrui. D'où la
// garde qui empêche le DERNIER animateur de partir ou d'être rétrogradé.
async function animatorCount(ctx: QueryCtx, workspaceId: Id<'workspaces'>) {
  const members = await membersOf(ctx, workspaceId);
  return members.filter((m) => effectiveWorkspaceRole(m.role) === 'animateur')
    .length;
}

// Invitation en cours (non expirée ou non) pour une adresse dans un espace.
async function pendingInvitationFor(
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  email: string,
) {
  const rows = await ctx.db
    .query('workspaceInvitations')
    .withIndex('by_email_and_status', (q) =>
      q.eq('email', email).eq('status', 'pending'),
    )
    .take(100);
  return rows.find((r) => r.workspaceId === workspaceId) ?? null;
}

// L'utilisateur a-t-il une invitation EN ATTENTE pour cet espace ? (par son
// compte ou par son adresse). Sert à laisser un invité lire la fiche d'un
// espace privé pour décider d'accepter — la fiche, pas les notes ni les
// fichiers.
async function hasPendingInvitation(
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  user: Doc<'users'>,
) {
  const byUser = await ctx.db
    .query('workspaceInvitations')
    .withIndex('by_user_and_status', (q) =>
      q.eq('invitedUserId', user._id).eq('status', 'pending'),
    )
    .take(100);
  if (byUser.some((r) => r.workspaceId === workspaceId)) return true;
  if (!user.email) return false;
  return (
    (await pendingInvitationFor(
      ctx,
      workspaceId,
      normalizeEmail(user.email),
    )) !== null
  );
}

// --- Écriture (membre réseau et au-dessus) ----------------------------------
export const createWorkspace = mutation({
  args: {
    title: v.string(),
    theme: v.string(),
    description: v.string(),
    // Optionnel : un appel de l'incrément 1 (sans le champ) crée un espace
    // ouvert, comme avant.
    visibility: v.optional(workspaceVisibilityValidator),
  },
  returns: v.id('workspaces'),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const title = args.title.trim();
    const theme = args.theme.trim();
    const description = args.description.trim();
    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
    if (description.length < 10 || description.length > 4000) {
      throw new Error('INVALID_DESCRIPTION');
    }

    await enforceRateLimit(ctx, {
      key: `workspaceCreate:${user._id}`,
      ...RATE_LIMITS.workspaceCreate,
    });

    const now = Date.now();
    const workspaceId = await ctx.db.insert('workspaces', {
      title,
      theme,
      description,
      ownerUserId: user._id,
      ownerName: memberName(user),
      memberCount: 1,
      createdAt: now,
      visibility: args.visibility ?? 'open',
      storageBytes: 0,
      fileCount: 0,
    });
    // Le créateur devient automatiquement animateur de l'espace.
    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId: user._id,
      userName: memberName(user),
      role: 'animateur',
      joinedAt: now,
    });
    return workspaceId;
  },
});

// Rejoindre un espace OUVERT (contributeur). Un espace privé ne se rejoint
// que par une invitation acceptée.
export const joinWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (existing) return { joined: true }; // déjà membre : idempotent

    if (effectiveVisibility(workspace.visibility) === 'private') {
      throw new ConvexError('INVITATION_REQUIRED');
    }

    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId: user._id,
      userName: memberName(user),
      role: 'contributeur',
      joinedAt: Date.now(),
    });
    await ctx.db.patch(workspaceId, {
      memberCount: workspace.memberCount + 1,
    });
    return { joined: true };
  },
});

// Quitter l'espace. Le DERNIER animateur ne le peut pas : il doit d'abord
// confier l'animation à un autre membre (sans quoi l'espace ne se gère plus).
export const leaveWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (!existing) return { joined: false }; // pas membre : idempotent

    if (
      effectiveWorkspaceRole(existing.role) === 'animateur' &&
      (await animatorCount(ctx, workspaceId)) <= 1
    ) {
      throw new ConvexError('LAST_ANIMATOR');
    }

    await ctx.db.delete(existing._id);
    await ctx.db.patch(workspaceId, {
      memberCount: Math.max(0, workspace.memberCount - 1),
      // L'animateur « titulaire » affiché sur la fiche part : le titre passe
      // au plus ancien animateur restant.
      ...(workspace.ownerUserId === user._id
        ? await nextOwner(ctx, workspaceId, user._id)
        : {}),
    });
    return { joined: false };
  },
});

// Le plus ancien animateur restant (hors `excluded`), pour la fiche.
async function nextOwner(
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  excluded: Id<'users'>,
): Promise<Partial<Pick<Doc<'workspaces'>, 'ownerUserId' | 'ownerName'>>> {
  const members = (await membersOf(ctx, workspaceId))
    .filter(
      (m) =>
        m.userId !== excluded && effectiveWorkspaceRole(m.role) === 'animateur',
    )
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const next = members[0];
  return next ? { ownerUserId: next.userId, ownerName: next.userName } : {};
}

export const addNote = mutation({
  args: { workspaceId: v.id('workspaces'), body: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { workspaceId, body }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const text = body.trim();
    if (text.length < 2 || text.length > 4000) throw new Error('INVALID_NOTE');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    // Écriture réservée aux membres DE L'ESPACE, et parmi eux à ceux qui
    // écrivent : un lecteur lit le fil, il n'y dépose rien.
    const membership = await membershipOf(ctx, workspaceId, user._id);
    if (!membership) throw new Error('NOT_A_MEMBER');
    if (
      !workspaceRoleAtLeast(
        effectiveWorkspaceRole(membership.role),
        'contributeur',
      )
    ) {
      throw new ConvexError('READ_ONLY');
    }

    await enforceRateLimit(ctx, {
      key: `workspaceNote:${user._id}`,
      ...RATE_LIMITS.workspaceNote,
    });

    await ctx.db.insert('workspaceNotes', {
      workspaceId,
      authorUserId: user._id,
      authorName: memberName(user),
      body: text,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// Visibilité de l'espace (animateur). Passer un espace en privé ne retire
// personne : ce sont les FUTURES entrées qui passent par invitation.
export const setVisibility = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    visibility: workspaceVisibilityValidator,
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, visibility }) => {
    await requireWorkspaceRole(ctx, workspaceId, 'animateur');
    await ctx.db.patch(workspaceId, { visibility });
    return null;
  },
});

// --- Invitations -------------------------------------------------------------

// Inviter un membre du réseau, par son ADRESSE ou depuis la liste des
// personnes avec qui l'on partage déjà un espace (`userId`).
//
// PAS D'ORACLE D'EXISTENCE. La réponse est la même, que l'adresse
// corresponde à un compte ou non : sans cette précaution, le formulaire
// d'invitation deviendrait un moyen de tester qui est inscrit sur la
// plateforme. L'invitation est rattachée au compte s'il existe (et il est
// notifié) ; sinon elle attend, et vaudra si ce compte naît et devient membre
// avant l'échéance.
export const inviteMember = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    email: v.optional(v.string()),
    userId: v.optional(v.id('users')),
    role: workspaceRoleValidator,
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const { user, workspace } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      'animateur',
    );

    let email: string;
    let invitee: Doc<'users'> | null;
    if (args.userId) {
      // Depuis la liste : seule une personne de `inviteCandidates` peut être
      // désignée ainsi. Un identifiant quelconque ne sert pas à découvrir
      // l'adresse d'un compte.
      invitee = await ctx.db.get(args.userId);
      if (
        !invitee?.email ||
        !(await sharesWorkspace(ctx, user._id, invitee._id))
      ) {
        throw new ConvexError('INVALID_INVITEE');
      }
      email = normalizeEmail(invitee.email);
    } else {
      const raw = args.email ?? '';
      if (!isEmail(raw)) throw new ConvexError('INVALID_EMAIL');
      email = normalizeEmail(raw);
      invitee = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first();
    }
    if (user.email && normalizeEmail(user.email) === email) {
      throw new ConvexError('INVALID_INVITEE');
    }

    await enforceRateLimit(ctx, {
      key: `workspaceInvite:${user._id}`,
      ...RATE_LIMITS.workspaceInvite,
    });

    // Déjà membre : rien à faire, et la même réponse (l'animateur voit la
    // liste des membres, il n'apprend rien ici).
    if (invitee && (await membershipOf(ctx, workspace._id, invitee._id))) {
      return { ok: true };
    }

    const now = Date.now();
    // Seul un compte MEMBRE DU RÉSEAU est rattaché et notifié : un visiteur
    // ne peut pas entrer dans un espace, l'inviter reviendrait à lui envoyer
    // une porte qu'il ne peut pas franchir.
    const invitedUserId =
      invitee && roleRank(invitee.role) >= roleRank('membre')
        ? invitee._id
        : undefined;

    const existing = await pendingInvitationFor(ctx, workspace._id, email);
    if (existing) {
      // Réinviter renouvelle l'échéance et met le rôle à jour : idempotent.
      await ctx.db.patch(existing._id, {
        role: args.role,
        expiresAt: now + INVITATION_TTL_MS,
        ...(invitedUserId ? { invitedUserId } : {}),
      });
    } else {
      await ctx.db.insert('workspaceInvitations', {
        workspaceId: workspace._id,
        email,
        ...(invitedUserId ? { invitedUserId } : {}),
        role: args.role,
        invitedBy: user._id,
        invitedByName: memberName(user),
        status: 'pending',
        expiresAt: now + INVITATION_TTL_MS,
        createdAt: now,
      });
    }

    if (invitedUserId && !existing) {
      await notify(ctx, {
        userId: invitedUserId,
        type: 'workspace_invitation',
        titleKey: 'workspaceInvitation',
        params: { title: workspace.title, name: memberName(user) },
        link: '/espaces',
      });
    }
    return { ok: true };
  },
});

// Deux comptes partagent-ils au moins un espace ?
async function sharesWorkspace(
  ctx: QueryCtx,
  a: Id<'users'>,
  b: Id<'users'>,
): Promise<boolean> {
  const mine = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user', (q) => q.eq('userId', a))
    .take(MY_MEMBERSHIPS_MAX);
  for (const m of mine) {
    if (await membershipOf(ctx, m.workspaceId, b)) return true;
  }
  return false;
}

// « Inviter depuis une liste » : les membres du réseau avec qui l'animateur
// partage DÉJÀ un espace, et qui ne sont pas dans celui-ci. La liste ne
// dévoile donc personne que l'animateur ne voit déjà dans ses espaces — un
// annuaire des personnes du réseau est un autre chantier (profils).
const CANDIDATES_MAX = 50;

export const inviteCandidates = query({
  args: { workspaceId: v.id('workspaces') },
  returns: v.array(v.object({ userId: v.id('users'), name: v.string() })),
  handler: async (ctx, { workspaceId }) => {
    const { user } = await requireWorkspaceRole(ctx, workspaceId, 'animateur');
    const here = new Set<string>(
      (await membersOf(ctx, workspaceId)).map((m) => m.userId),
    );
    const mine = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(MY_MEMBERSHIPS_MAX);
    const out = new Map<Id<'users'>, string>();
    for (const m of mine) {
      if (m.workspaceId === workspaceId) continue;
      for (const other of await membersOf(ctx, m.workspaceId)) {
        if (here.has(other.userId) || out.has(other.userId)) continue;
        out.set(other.userId, other.userName);
        if (out.size >= CANDIDATES_MAX) break;
      }
      if (out.size >= CANDIDATES_MAX) break;
    }
    return [...out]
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Invitations adressées à l'utilisateur courant (par son compte ou son
// adresse), en attente. `expiresAt` est rendu tel quel : c'est l'écran qui dit
// « expirée » (une query ne lit pas l'horloge), et c'est `respondInvitation`
// qui refuse.
const invitationForMeValidator = v.object({
  _id: v.id('workspaceInvitations'),
  workspaceId: v.id('workspaces'),
  workspaceTitle: v.string(),
  role: workspaceRoleValidator,
  invitedByName: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
});

export const myInvitations = query({
  args: {},
  returns: v.array(invitationForMeValidator),
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const rows = await invitationsForUser(ctx, user);
    const out = [];
    for (const r of rows) {
      const ws = await ctx.db.get(r.workspaceId);
      if (!ws) continue;
      out.push({
        _id: r._id,
        workspaceId: r.workspaceId,
        workspaceTitle: ws.title,
        role: r.role,
        invitedByName: r.invitedByName,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

async function invitationsForUser(ctx: QueryCtx, user: Doc<'users'>) {
  const byUser = await ctx.db
    .query('workspaceInvitations')
    .withIndex('by_user_and_status', (q) =>
      q.eq('invitedUserId', user._id).eq('status', 'pending'),
    )
    .take(100);
  const byEmail = user.email
    ? await ctx.db
        .query('workspaceInvitations')
        .withIndex('by_email_and_status', (q) =>
          q.eq('email', normalizeEmail(user.email!)).eq('status', 'pending'),
        )
        .take(100)
    : [];
  const seen = new Set<string>();
  return [...byUser, ...byEmail].filter((r) => {
    if (seen.has(r._id)) return false;
    seen.add(r._id);
    return true;
  });
}

// Accepter ou refuser. Une invitation ÉCHUE est refusée : l'animateur doit en
// émettre une nouvelle (ce qui renouvelle l'échéance).
export const respondInvitation = mutation({
  args: { invitationId: v.id('workspaceInvitations'), accept: v.boolean() },
  returns: v.object({ workspaceId: v.id('workspaces') }),
  handler: async (ctx, { invitationId, accept }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const inv = await ctx.db.get(invitationId);
    const mine =
      inv &&
      (inv.invitedUserId === user._id ||
        (user.email !== undefined && normalizeEmail(user.email) === inv.email));
    if (!inv || !mine) throw new ConvexError('NOT_FOUND');
    if (inv.status !== 'pending') throw new ConvexError('INVITATION_CLOSED');
    const now = Date.now();
    if (now >= inv.expiresAt) throw new ConvexError('INVITATION_EXPIRED');
    const workspace = await ctx.db.get(inv.workspaceId);
    if (!workspace) throw new ConvexError('NOT_FOUND');

    await ctx.db.patch(inv._id, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: now,
      invitedUserId: user._id,
    });

    if (accept && !(await membershipOf(ctx, workspace._id, user._id))) {
      await ctx.db.insert('workspaceMembers', {
        workspaceId: workspace._id,
        userId: user._id,
        userName: memberName(user),
        role: inv.role,
        joinedAt: now,
      });
      await ctx.db.patch(workspace._id, {
        memberCount: workspace.memberCount + 1,
      });
    }

    await notify(ctx, {
      userId: inv.invitedBy,
      type: accept
        ? 'workspace_invitation_accepted'
        : 'workspace_invitation_declined',
      titleKey: accept
        ? 'workspaceInvitationAccepted'
        : 'workspaceInvitationDeclined',
      params: { title: workspace.title, name: memberName(user) },
      link: `/espaces/${workspace._id}`,
    });
    return { workspaceId: workspace._id };
  },
});

export const revokeInvitation = mutation({
  args: { invitationId: v.id('workspaceInvitations') },
  returns: v.null(),
  handler: async (ctx, { invitationId }) => {
    const inv = await ctx.db.get(invitationId);
    if (!inv) throw new ConvexError('NOT_FOUND');
    await requireWorkspaceRole(ctx, inv.workspaceId, 'animateur');
    if (inv.status === 'pending') {
      await ctx.db.patch(inv._id, {
        status: 'revoked',
        respondedAt: Date.now(),
      });
    }
    return null;
  },
});

// --- Membres : rôle et retrait (animateur) ----------------------------------

export const setMemberRole = mutation({
  args: { memberId: v.id('workspaceMembers'), role: workspaceRoleValidator },
  returns: v.null(),
  handler: async (ctx, { memberId, role }) => {
    const target = await ctx.db.get(memberId);
    if (!target) throw new ConvexError('NOT_FOUND');
    const { workspace } = await requireWorkspaceRole(
      ctx,
      target.workspaceId,
      'animateur',
    );
    const current = effectiveWorkspaceRole(target.role);
    if (current === role) return null;
    if (
      current === 'animateur' &&
      (await animatorCount(ctx, workspace._id)) <= 1
    ) {
      throw new ConvexError('LAST_ANIMATOR');
    }
    await ctx.db.patch(memberId, { role });
    await notify(ctx, {
      userId: target.userId,
      type: 'workspace_role_changed',
      titleKey: 'workspaceRoleChanged',
      params: { title: workspace.title },
      link: `/espaces/${workspace._id}`,
    });
    return null;
  },
});

// Retirer un membre (animateur). Journalisé : c'est une action sur autrui.
// On ne se retire pas soi-même par ici (c'est « quitter »), et l'on ne retire
// pas le dernier animateur.
export const removeMember = mutation({
  args: { memberId: v.id('workspaceMembers') },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const target = await ctx.db.get(memberId);
    if (!target) throw new ConvexError('NOT_FOUND');
    const { user, workspace } = await requireWorkspaceRole(
      ctx,
      target.workspaceId,
      'animateur',
    );
    if (target.userId === user._id) throw new ConvexError('USE_LEAVE');
    if (
      effectiveWorkspaceRole(target.role) === 'animateur' &&
      (await animatorCount(ctx, workspace._id)) <= 1
    ) {
      throw new ConvexError('LAST_ANIMATOR');
    }
    await ctx.db.delete(memberId);
    await ctx.db.patch(workspace._id, {
      memberCount: Math.max(0, workspace.memberCount - 1),
      ...(workspace.ownerUserId === target.userId
        ? await nextOwner(ctx, workspace._id, target.userId)
        : {}),
    });
    await notify(ctx, {
      userId: target.userId,
      type: 'workspace_removed',
      titleKey: 'workspaceRemoved',
      params: { title: workspace.title },
      link: '/espaces',
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.WORKSPACE_MEMBER_REMOVED,
      targetId: workspace._id,
      metadata: { removedUserId: target.userId },
    });
    return null;
  },
});

// --- Lecture (membre réseau et au-dessus) -----------------------------------

// Bornes de lecture de la liste : les espaces les plus récents, et les
// appartenances de l'utilisateur courant. Aucune des deux n'était bornée.
const WORKSPACES_MAX = 100;
const MY_MEMBERSHIPS_MAX = 500;

export const listWorkspaces = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('workspaces'),
      title: v.string(),
      theme: v.string(),
      description: v.string(),
      memberCount: v.number(),
      createdAt: v.number(),
      mine: v.boolean(),
      visibility: workspaceVisibilityValidator,
    }),
  ),
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspaces = await ctx.db
      .query('workspaces')
      .order('desc')
      .take(WORKSPACES_MAX);

    // Espaces dont l'utilisateur courant est membre (drapeau `mine`).
    //
    // L'appartenance était résolue ESPACE PAR ESPACE via l'index composite
    // (workspaceId, userId) : un aller-retour par ligne affichée, alors qu'un
    // membre n'appartient qu'à une poignée d'espaces. L'index `by_user` lit ses
    // appartenances en UNE requête, d'où le drapeau se déduit sans relire la
    // base (issue #8).
    const myMemberships = new Set<string>(
      (
        await ctx.db
          .query('workspaceMembers')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .take(MY_MEMBERSHIPS_MAX)
      ).map((m) => m.workspaceId),
    );

    return (
      workspaces
        // Un espace PRIVÉ n'apparaît qu'à ses membres. Ses invités le voient
        // dans « Mes invitations », pas dans la liste.
        .filter(
          (w) =>
            effectiveVisibility(w.visibility) === 'open' ||
            myMemberships.has(w._id),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((w) => ({
          _id: w._id,
          title: w.title,
          theme: w.theme,
          description: w.description,
          memberCount: w.memberCount,
          createdAt: w.createdAt,
          mine: myMemberships.has(w._id),
          visibility: effectiveVisibility(w.visibility),
        }))
    );
  },
});

const workspaceDetailValidator = v.object({
  _id: v.id('workspaces'),
  title: v.string(),
  theme: v.string(),
  description: v.string(),
  ownerName: v.string(),
  memberCount: v.number(),
  createdAt: v.number(),
  visibility: workspaceVisibilityValidator,
  isMember: v.boolean(),
  isOwner: v.boolean(),
  myRole: v.union(workspaceRoleValidator, v.null()),
  // Seul animateur restant : l'écran explique pourquoi « quitter » est
  // indisponible au lieu de laisser le serveur refuser.
  isLastAnimator: v.boolean(),
  storageBytes: v.number(),
  quotaBytes: v.number(),
  members: v.array(
    v.object({
      _id: v.id('workspaceMembers'),
      userName: v.string(),
      role: workspaceRoleValidator,
      joinedAt: v.number(),
      isSelf: v.boolean(),
    }),
  ),
  notes: v.array(
    v.object({
      _id: v.id('workspaceNotes'),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }),
  ),
  // Invitations en cours — pour les animateurs seulement (vide sinon).
  invitations: v.array(
    v.object({
      _id: v.id('workspaceInvitations'),
      email: v.string(),
      role: workspaceRoleValidator,
      status: invitationStatusValidator,
      expiresAt: v.number(),
      createdAt: v.number(),
    }),
  ),
});

export const getWorkspace = query({
  // `v.string()` et non `v.id('workspaces')` : l'identifiant vient de l'URL
  // (/espaces/<id>), donc de n'importe qui. Avec `v.id`, `/espaces/zzz` ou un
  // identifiant d'une AUTRE table faisaient lever la validation d'arguments
  // avant le handler, et la page tombait sur « Une erreur est survenue » là où
  // un identifiant inconnu doit dire « introuvable » (mesuré le 27/09).
  args: { workspaceId: v.string() },
  returns: v.union(workspaceDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspaceId = ctx.db.normalizeId('workspaces', args.workspaceId);
    if (!workspaceId) return null;
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return null;

    const members = await membersOf(ctx, workspaceId);
    const mine = members.find((m) => m.userId === user._id);
    const myRole = mine ? effectiveWorkspaceRole(mine.role) : null;
    const isMember = myRole !== null;
    const visibility = effectiveVisibility(workspace.visibility);

    // ESPACE PRIVÉ : n'existe, pour un non-membre, que s'il y est invité — et
    // alors seulement sa fiche (titre, description, participants) pour
    // décider d'accepter. Sinon « introuvable », comme un identifiant inconnu :
    // un espace privé ne se laisse pas découvrir par son adresse.
    if (
      visibility === 'private' &&
      !isMember &&
      !(await hasPendingInvitation(ctx, workspaceId, user))
    ) {
      return null;
    }

    // LES NOTES NE SORTENT QUE POUR LES MEMBRES DE L'ESPACE. Tout membre du
    // réseau lisait le fil complet d'un espace qu'il n'avait pas rejoint
    // (mesuré le 27/09, membre A-6 / R-11) : l'écriture était réservée aux
    // membres de l'espace, pas la lecture. Titre, description et participants
    // restent visibles — c'est ce qu'il faut pour décider de rejoindre ; le
    // fil, lui, ne se lit qu'une fois dedans. Un tableau vide plutôt qu'un
    // refus : la page dit « rejoignez l'espace pour lire les notes ».
    const notes = isMember
      ? await ctx.db
          .query('workspaceNotes')
          .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
          .order('desc')
          .take(500)
      : [];

    const invitations =
      myRole === 'animateur'
        ? await ctx.db
            .query('workspaceInvitations')
            .withIndex('by_workspace_and_status', (q) =>
              q.eq('workspaceId', workspaceId).eq('status', 'pending'),
            )
            .take(200)
        : [];

    const animators = members.filter(
      (m) => effectiveWorkspaceRole(m.role) === 'animateur',
    ).length;

    return {
      _id: workspace._id,
      title: workspace.title,
      theme: workspace.theme,
      description: workspace.description,
      ownerName: workspace.ownerName,
      memberCount: workspace.memberCount,
      createdAt: workspace.createdAt,
      visibility,
      isMember,
      isOwner: workspace.ownerUserId === user._id,
      myRole,
      isLastAnimator: myRole === 'animateur' && animators <= 1,
      storageBytes: workspace.storageBytes ?? 0,
      quotaBytes: WORKSPACE_FILE_LIMITS.quotaBytes,
      members: members
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          _id: m._id,
          userName: m.userName,
          role: effectiveWorkspaceRole(m.role),
          joinedAt: m.joinedAt,
          isSelf: m.userId === user._id,
        })),
      notes: notes
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((n) => ({
          _id: n._id,
          authorName: n.authorName,
          body: n.body,
          createdAt: n.createdAt,
        })),
      invitations: invitations
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((i) => ({
          _id: i._id,
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        })),
    };
  },
});
