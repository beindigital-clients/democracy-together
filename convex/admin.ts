import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireNetworkRole, effectiveRole } from './lib/rbac';

// Back-office (F-26 / F-61 / F-63) — toutes les lectures sont role-gated
// (défense en profondeur ; l'UI masque déjà ce que le rôle n'autorise pas).

// Tableau de bord d'administration (F-61) : compteurs clés.
export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const [applications, orgs, users, unhandledContacts, pendingPubs] =
      await Promise.all([
        ctx.db.query('membershipApplications').collect(),
        ctx.db.query('organizations').collect(),
        ctx.db.query('users').collect(),
        ctx.db
          .query('contactMessages')
          .withIndex('by_handled', (q) => q.eq('handled', false))
          .collect(),
        ctx.db
          .query('publications')
          .withIndex('by_status', (q) => q.eq('status', 'pending'))
          .collect(),
      ]);
    return {
      pendingApplications: applications.filter((a) => a.status === 'pending')
        .length,
      totalApplications: applications.length,
      activeMembers: orgs.filter((o) => o.status === 'active').length,
      totalUsers: users.length,
      unhandledContacts: unhandledContacts.length,
      pendingPublications: pendingPubs.length,
    };
  },
});

// File de modération des candidatures (F-26 / F-22), triée par date décroissante.
export const listApplications = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const apps = status
      ? await ctx.db
          .query('membershipApplications')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('membershipApplications').collect();
    return apps.sort((a, b) => b.submittedAt - a.submittedAt);
  },
});

// Gestion des utilisateurs & rôles (F-63) — administrateurs seulement.
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const users = await ctx.db.query('users').collect();
    return users
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: effectiveRole(u.role),
      }))
      .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
  },
});
