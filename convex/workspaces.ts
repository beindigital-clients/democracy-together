import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';

// Espaces de travail collaboratifs (F-24, incrément 1). Lecture réservée aux
// membres du réseau (membre+) ; l'écriture de notes est réservée aux membres DE
// L'ESPACE (workspaceMembers). `theme` = un des 5 axes du réseau (miroir de
// PUB_THEMES, src/lib/publications.ts — garder synchrone).
const THEMES = [
  'gouvernance-numerique',
  'participation',
  'anti-corruption',
  'transitions',
  'crises',
];

function memberName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// Appartenance (espace, utilisateur) — unicité via l'index composite.
async function membershipOf(
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

// --- Écriture (membre réseau et au-dessus) ----------------------------------
export const createWorkspace = mutation({
  args: {
    title: v.string(),
    theme: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const title = args.title.trim();
    const theme = args.theme.trim();
    const description = args.description.trim();
    if (!THEMES.includes(theme)) throw new Error('INVALID_THEME');
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
    });
    // Le créateur devient automatiquement membre (owner) de l'espace.
    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId: user._id,
      userName: memberName(user),
      role: 'owner',
      joinedAt: now,
    });
    return workspaceId;
  },
});

export const joinWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (existing) return { joined: true }; // déjà membre : idempotent

    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId: user._id,
      userName: memberName(user),
      role: 'member',
      joinedAt: Date.now(),
    });
    await ctx.db.patch(workspaceId, {
      memberCount: workspace.memberCount + 1,
    });
    return { joined: true };
  },
});

export const leaveWorkspace = mutation({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');
    // L'owner ne peut pas quitter son propre espace (incrément 1).
    if (workspace.ownerUserId === user._id)
      throw new Error('OWNER_CANNOT_LEAVE');

    const existing = await membershipOf(ctx, workspaceId, user._id);
    if (!existing) return { joined: false }; // pas membre : idempotent

    await ctx.db.delete(existing._id);
    if (workspace.memberCount > 0) {
      await ctx.db.patch(workspaceId, {
        memberCount: workspace.memberCount - 1,
      });
    }
    return { joined: false };
  },
});

export const addNote = mutation({
  args: { workspaceId: v.id('workspaces'), body: v.string() },
  handler: async (ctx, { workspaceId, body }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const text = body.trim();
    if (text.length < 2 || text.length > 4000) throw new Error('INVALID_NOTE');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND');

    // Écriture réservée aux membres DE L'ESPACE (pas seulement membres réseau).
    const membership = await membershipOf(ctx, workspaceId, user._id);
    if (!membership) throw new Error('NOT_A_MEMBER');

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

// --- Lecture (membre réseau et au-dessus) -----------------------------------
export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspaces = await ctx.db.query('workspaces').collect();

    // Espaces dont l'utilisateur courant est membre (drapeau `mine`). L'index
    // composite porte (workspaceId, userId) : on résout l'appartenance espace
    // par espace (le nombre d'espaces reste modeste pour cet incrément).
    const myMemberships = new Set<string>();
    for (const w of workspaces) {
      const m = await membershipOf(ctx, w._id, user._id);
      if (m) myMemberships.add(w._id);
    }

    return workspaces
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((w) => ({
        _id: w._id,
        title: w.title,
        theme: w.theme,
        description: w.description,
        memberCount: w.memberCount,
        createdAt: w.createdAt,
        mine: myMemberships.has(w._id),
      }));
  },
});

export const getWorkspace = query({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, { workspaceId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) return null;

    const members = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect();
    const notes = await ctx.db
      .query('workspaceNotes')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect();

    const isMember = members.some((m) => m.userId === user._id);

    return {
      _id: workspace._id,
      title: workspace.title,
      theme: workspace.theme,
      description: workspace.description,
      ownerName: workspace.ownerName,
      memberCount: workspace.memberCount,
      createdAt: workspace.createdAt,
      isMember,
      isOwner: workspace.ownerUserId === user._id,
      members: members
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          _id: m._id,
          userName: m.userName,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
      notes: notes
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((n) => ({
          _id: n._id,
          authorName: n.authorName,
          body: n.body,
          createdAt: n.createdAt,
        })),
    };
  },
});
