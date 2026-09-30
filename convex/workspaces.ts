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

// Collaborative workspaces (F-24). Reading the entry (title,
// description, participants) is reserved for network members (member+); the
// NOTES and FILES — read and write — are reserved for members
// OF THE WORKSPACE (workspaceMembers). `theme` = one of the network's 5 axes (mirror of
// PUB_THEMES, src/lib/publications.ts — keep in sync).
//
// Community workstream: three roles in a workspace (facilitator / contributor /
// reader, cf. convex/lib/communaute.ts), PRIVATE invitation-only workspaces,
// expiring invitations, removal of a member. Shared files
// live in convex/workspaceFiles.ts.

// Display name of a member in a workspace (facilitator, participant, note
// author). Accounts created by invitation or by membership approval have
// no `name` — only an address: they were all displayed as "Membre", hence
// indistinguishable from each other (measured on 27/09, member A-11). Fallback to the
// local part of the address, which identifies without exposing the full domain; the
// generic label remains only for an account with neither name NOR address.
export function memberName(user: Doc<'users'>): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split('@')[0]?.trim();
  return local || 'Membre';
}

// Membership (workspace, user) — uniqueness via the composite index.
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

// The user's role in the workspace, or null if they are not a member.
export async function workspaceRoleOf(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
): Promise<WorkspaceRole | null> {
  const m = await membershipOf(ctx, workspaceId, userId);
  return m ? effectiveWorkspaceRole(m.role) : null;
}

// Shared guard: network member, existing workspace, minimum role WITHIN
// the workspace. It is here, and nowhere else, that who reads and who
// writes is decided — the interface only hides what the server would refuse.
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

// Number of facilitators in a workspace. A workspace without a facilitator can no longer be managed:
// no invitation, no removal, no deletion of someone else's file. Hence the
// guard that prevents the LAST facilitator from leaving or being demoted.
async function animatorCount(ctx: QueryCtx, workspaceId: Id<'workspaces'>) {
  const members = await membersOf(ctx, workspaceId);
  return members.filter((m) => effectiveWorkspaceRole(m.role) === 'animateur')
    .length;
}

// Pending invitation (expired or not) for an address in a workspace.
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

// Does the user have a PENDING invitation for this workspace? (via their
// account or via their address). Used to let an invitee read the entry of a
// private workspace to decide whether to accept — the entry, not the notes or the
// files.
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

// --- Writing (network member and above) ----------------------------------
export const createWorkspace = mutation({
  args: {
    title: v.string(),
    theme: v.string(),
    description: v.string(),
    // Optional: a call from increment 1 (without the field) creates an
    // open workspace, as before.
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
    // The creator automatically becomes the workspace's facilitator.
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

// Join an OPEN workspace (contributor). A private workspace can only be joined
// through an accepted invitation.
export const joinWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (existing) return { joined: true }; // already a member: idempotent

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

// Leave the workspace. The LAST facilitator cannot: they must first
// hand facilitation over to another member (otherwise the workspace can no longer be managed).
export const leaveWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (!existing) return { joined: false }; // not a member: idempotent

    if (
      effectiveWorkspaceRole(existing.role) === 'animateur' &&
      (await animatorCount(ctx, workspaceId)) <= 1
    ) {
      throw new ConvexError('LAST_ANIMATOR');
    }

    await ctx.db.delete(existing._id);
    await ctx.db.patch(workspaceId, {
      memberCount: Math.max(0, workspace.memberCount - 1),
      // The "lead" facilitator displayed on the entry leaves: the title passes
      // to the oldest remaining facilitator.
      ...(workspace.ownerUserId === user._id
        ? await nextOwner(ctx, workspaceId, user._id)
        : {}),
    });
    return { joined: false };
  },
});

// The oldest remaining facilitator (excluding `excluded`), for the entry.
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

    // Writing reserved for members OF THE WORKSPACE, and among them for those who
    // write: a reader reads the thread, they post nothing there.
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

// Workspace visibility (facilitator). Making a workspace private removes
// no one: it is FUTURE entries that go through invitation.
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

// Invite a network member, by their ADDRESS or from the list of
// people with whom one already shares a workspace (`userId`).
//
// NO EXISTENCE ORACLE. The response is the same whether or not the address
// matches an account: without this precaution, the invitation
// form would become a way to test who is registered on the
// platform. The invitation is attached to the account if it exists (and it is
// notified); otherwise it waits, and will apply if that account is created and becomes a member
// before the deadline.
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
      // From the list: only a person from `inviteCandidates` can be
      // designated this way. An arbitrary identifier cannot be used to discover
      // an account's address.
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

    // Already a member: nothing to do, and the same response (the facilitator sees the
    // member list, they learn nothing here).
    if (invitee && (await membershipOf(ctx, workspace._id, invitee._id))) {
      return { ok: true };
    }

    const now = Date.now();
    // Only a NETWORK MEMBER account is attached and notified: a visitor
    // cannot enter a workspace, inviting them would amount to sending them
    // a door they cannot walk through.
    const invitedUserId =
      invitee && roleRank(invitee.role) >= roleRank('membre')
        ? invitee._id
        : undefined;

    const existing = await pendingInvitationFor(ctx, workspace._id, email);
    if (existing) {
      // Re-inviting renews the deadline and updates the role: idempotent.
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

// Do two accounts share at least one workspace?
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

// "Invite from a list": the network members with whom the facilitator
// ALREADY shares a workspace, and who are not in this one. The list therefore
// reveals no one the facilitator does not already see in their workspaces — a
// directory of the network's people is another workstream (profiles).
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

// Invitations addressed to the current user (via their account or their
// address), pending. `expiresAt` is returned as is: it is the screen that says
// "expirée" (a query does not read the clock), and it is `respondInvitation`
// that refuses.
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

// Accept or decline. An EXPIRED invitation is refused: the facilitator must
// issue a new one (which renews the deadline).
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

// --- Members: role and removal (facilitator) ----------------------------------

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

// Remove a member (facilitator). Logged: it is an action on someone else.
// One does not remove oneself through here (that is "quitter"), and one does not remove
// the last facilitator.
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

// --- Reading (network member and above) -----------------------------------

// Read bounds for the list: the most recent workspaces, and the
// current user's memberships. Neither was bounded.
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

    // Workspaces of which the current user is a member (`mine` flag).
    //
    // Membership was resolved WORKSPACE BY WORKSPACE via the composite index
    // (workspaceId, userId): one round trip per displayed row, whereas a
    // member belongs to only a handful of workspaces. The `by_user` index reads their
    // memberships in ONE query, from which the flag is derived without re-reading the
    // database (issue #8).
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
        // A PRIVATE workspace appears only to its members. Its invitees see it
        // in "Mes invitations", not in the list.
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
  // Only remaining facilitator: the screen explains why "quitter" is
  // unavailable instead of letting the server refuse.
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
  // Pending invitations — for facilitators only (empty otherwise).
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
  // `v.string()` and not `v.id('workspaces')`: the identifier comes from the URL
  // (/espaces/<id>), hence from anyone. With `v.id`, `/espaces/zzz` or an
  // identifier from ANOTHER table made argument validation throw
  // before the handler, and the page fell on "Une erreur est survenue" where
  // an unknown identifier must say "introuvable" (measured on 27/09).
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

    // PRIVATE WORKSPACE: exists, for a non-member, only if they are invited to it — and
    // then only its entry (title, description, participants) to
    // decide whether to accept. Otherwise "introuvable", like an unknown identifier:
    // a private workspace cannot be discovered through its address.
    if (
      visibility === 'private' &&
      !isMember &&
      !(await hasPendingInvitation(ctx, workspaceId, user))
    ) {
      return null;
    }

    // NOTES ARE RETURNED ONLY TO MEMBERS OF THE WORKSPACE. Any network
    // member could read the full thread of a workspace they had not joined
    // (measured on 27/09, member A-6 / R-11): writing was reserved for
    // workspace members, reading was not. Title, description and participants
    // remain visible — that is what is needed to decide whether to join; the
    // thread, however, can only be read once inside. An empty array rather than a
    // refusal: the page says "rejoignez l'espace pour lire les notes".
    //
    // The 500 most recent notes, reversed below to read oldest first. The
    // index breaks `createdAt` ties on `_creationTime`; a JS sort on
    // `createdAt` alone put notes posted in the same millisecond newest first.
    const notes = isMember
      ? await ctx.db
          .query('workspaceNotes')
          .withIndex('by_workspace_and_createdAt', (q) =>
            q.eq('workspaceId', workspaceId),
          )
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
      notes: notes.reverse().map((n) => ({
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
