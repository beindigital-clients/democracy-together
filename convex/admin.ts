import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import { requireNetworkRole, effectiveRole } from './lib/rbac';
import { COUNTER, readCounters } from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';
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

// File de modération des candidatures (F-26 / F-22), la plus récente d'abord.
//
// PAGINÉE + CHERCHABLE (issues #8 et #49). C'était la dernière liste du
// back-office à charger sa table entière puis à la trier en mémoire ; y poser
// une recherche sans la paginer d'abord aurait aggravé exactement ce que #8
// corrige ailleurs. Le tri décroissant vient maintenant de l'index : une
// candidature est insérée avec `submittedAt = Date.now()`, donc l'ordre de
// création EST l'ordre de dépôt — plus besoin d'un `sort` sur la table lue.
const applicationValidator = v.object({
  _id: v.id('membershipApplications'),
  type: v.union(v.literal('organisation'), v.literal('individu')),
  organizationName: v.string(),
  contactEmail: v.string(),
  country: v.string(),
  message: v.union(v.string(), v.null()),
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
  ),
  reviewNotes: v.union(v.string(), v.null()),
  submittedAt: v.number(),
});

export const listApplications = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedValidator(applicationValidator),
  handler: async (ctx, { status, search, paginationOpts }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);

    // Recherche : index plein texte sur le nom d'organisation, avec le statut
    // porté par `filterFields` — donc UNE lecture d'index, filtre compris.
    // Sans recherche : l'index par statut (ou la table en ordre décroissant),
    // exactement comme avant.
    const result = term
      ? await ctx.db
          .query('membershipApplications')
          .withSearchIndex('search_organizationName', (q) => {
            const q2 = q.search('organizationName', term);
            return status ? q2.eq('status', status) : q2;
          })
          .paginate(opts)
      : status
        ? await ctx.db
            .query('membershipApplications')
            .withIndex('by_status', (q) => q.eq('status', status))
            .order('desc')
            .paginate(opts)
        : await ctx.db
            .query('membershipApplications')
            .order('desc')
            .paginate(opts);

    return {
      ...result,
      page: result.page.map((a) => ({
        _id: a._id,
        type: a.type,
        organizationName: a.organizationName,
        contactEmail: a.contactEmail,
        country: a.country,
        message: a.message ?? null,
        status: a.status,
        reviewNotes: a.reviewNotes ?? null,
        submittedAt: a.submittedAt,
      })),
    };
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

// CHERCHABLE ET FILTRABLE (issue #49) — les deux par index, jamais en mémoire.
//
// Trois chemins, un seul index lu à chaque fois :
//   recherche (+ rôle) -> `search_email`, le rôle porté par `filterFields` ;
//   rôle seul          -> `by_role` ;
//   ni l'un ni l'autre -> `email`, qui porte le tri alphabétique.
//
// NUANCE SUR LE FILTRE PAR RÔLE, et elle est assumée : il porte sur le rôle
// STOCKÉ. Les comptes créés avant la PR #4 n'ont pas de colonne `role` ; ils
// sont indexés sous `undefined`, qui précède toute valeur — donc hors de la
// plage `role = 'visiteur'`, alors que la liste les AFFICHE « Visiteur »
// (effectiveRole, issue #27). Réunir les deux demanderait de lire deux plages
// d'index en une seule page paginée, ce que Convex ne sait pas faire : le
// choix est donc de ne filtrer que ce qu'un index tranche exactement, et de
// laisser ces comptes visibles dans la liste non filtrée (et par la recherche
// sur leur adresse, qui ne passe pas par `role`). Pinné par un test.
export const listUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    role: v.optional(networkRole),
  },
  returns: paginatedValidator(adminUserValidator),
  handler: async (ctx, { paginationOpts, search, role }) => {
    await requireNetworkRole(ctx, 'admin');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);

    const result = term
      ? await ctx.db
          .query('users')
          .withSearchIndex('search_email', (q) => {
            const q2 = q.search('email', term);
            return role ? q2.eq('role', role) : q2;
          })
          .paginate(opts)
      : role
        ? await ctx.db
            .query('users')
            .withIndex('by_role', (q) => q.eq('role', role))
            .paginate(opts)
        : await ctx.db.query('users').withIndex('email').paginate(opts);

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
