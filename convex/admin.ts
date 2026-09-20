import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import { requireNetworkRole, effectiveRole } from './lib/rbac';
import { COUNTER, readCounters } from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { networkRole } from './schema';

// Back-office (F-26 / F-61 / F-63) — toutes les lectures sont role-gated
// (défense en profondeur ; l'UI masque déjà ce que le rôle n'autorise pas).

// Tableau de bord d'administration (F-61) : compteurs clés.
//
// Ces six nombres étaient obtenus en CHARGEANT les tables correspondantes puis
// en lisant `.length` — `users` en entier à chaque affichage du tableau de
// bord. Ils viennent désormais de compteurs dénormalisés (convex/counters.ts),
// tenus dans la transaction qui écrit la donnée comptée : six lectures
// indexées d'une ligne chacune, quelle que soit la taille du réseau.
export const dashboardStats = query({
  args: {},
  returns: v.object({
    pendingApplications: v.number(),
    totalApplications: v.number(),
    activeMembers: v.number(),
    totalUsers: v.number(),
    unhandledContacts: v.number(),
    pendingPublications: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const c = await readCounters(ctx, [
      COUNTER.MEMBERSHIP_APPLICATIONS_PENDING,
      COUNTER.MEMBERSHIP_APPLICATIONS,
      COUNTER.ORGANIZATIONS_ACTIVE,
      COUNTER.USERS,
      COUNTER.CONTACT_MESSAGES_UNHANDLED,
      COUNTER.PUBLICATIONS_PENDING,
    ]);
    return {
      pendingApplications: c[COUNTER.MEMBERSHIP_APPLICATIONS_PENDING],
      totalApplications: c[COUNTER.MEMBERSHIP_APPLICATIONS],
      activeMembers: c[COUNTER.ORGANIZATIONS_ACTIVE],
      totalUsers: c[COUNTER.USERS],
      unhandledContacts: c[COUNTER.CONTACT_MESSAGES_UNHANDLED],
      pendingPublications: c[COUNTER.PUBLICATIONS_PENDING],
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
//
// PAGINÉE : la liste chargeait `users` en entier, puis triait par e-mail en
// mémoire. L'index `email` porte déjà cet ordre — la page sort donc triée de la
// base, sans lire une ligne de plus que ce qui s'affiche.
const adminUserValidator = v.object({
  _id: v.id('users'),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: networkRole,
});

export const listUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(adminUserValidator),
  handler: async (ctx, { paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');
    const result = await ctx.db
      .query('users')
      .withIndex('email')
      .paginate(clampPageSize(paginationOpts));
    return {
      ...result,
      page: result.page.map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: effectiveRole(u.role),
      })),
    };
  },
});
