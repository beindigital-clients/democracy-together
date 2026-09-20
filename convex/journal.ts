import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';

// Journal d'activité & export (F-67) — back-office. La table `auditLog` est
// peuplée par recordAudit (cf. convex/lib/audit.ts) sur chaque action sensible.
// Lecture RÉSERVÉE aux administrateurs (données sensibles : qui a fait quoi).

const auditRowValidator = v.object({
  action: v.string(),
  createdAt: v.number(),
  targetId: v.union(v.string(), v.null()),
  // L'ACTEUR sort désormais avec son identifiant (issue #49) : c'est lui que
  // l'écran renvoie en argument pour filtrer « tout ce que cette personne a
  // fait ». Le nom seul ne suffirait pas — deux comptes peuvent le partager,
  // et un compte peut n'avoir que son adresse.
  actorId: v.union(v.id('users'), v.null()),
  actorName: v.union(v.string(), v.null()),
  actorEmail: v.union(v.string(), v.null()),
});

// Plafond DUR de la taille de page. `limit` n'en avait aucun (issue #8) : un
// appelant demandait `limit: 1e6` et la query relisait le journal entier — la
// table qui grossit le plus vite du produit, puisqu'une ligne y est écrite à
// chaque action sensible.
const AUDIT_PAGE_MAX = 100;

// CHERCHABLE ET FILTRABLE PAR ACTEUR (issue #49).
//
// Le journal n'avait aucun moyen de retrouver une entrée : sur une table dont
// la nature est de ne faire que croître, « tout, du plus récent au plus
// ancien » est le seul angle disponible. Deux entrées désormais, toutes deux
// par index :
//
//   `search` — index plein texte sur l'action. Le slug pointé y est découpé,
//     donc « publication » remonte la famille entière et « reviewed » toutes
//     les décisions. C'est aussi ce qui tient le rôle du filtre par action de
//     l'issue : la liste des actions DISTINCTES d'un journal ne s'obtient pas
//     sans le parcourir — soit exactement la lecture que #8 a retirée.
//   `actorId` — l'index `by_actor`, ou `filterFields` quand une recherche est
//     en cours. L'écran le fournit en cliquant l'acteur d'une ligne : les
//     acteurs ne sont pas tous du staff (`publication.submitted` est écrite
//     par le membre déposant), donc un menu déroulant du staff en manquerait
//     une partie, et énumérer les acteurs présents relèverait du même scan.
//
// ORDRE. Sans recherche, la liste reste chronologique décroissante (y compris
// filtrée par acteur : `by_actor` puis `.order('desc')`). AVEC une recherche,
// l'ordre est celui de la pertinence — c'est celui d'un index plein texte
// Convex, et chaque ligne porte sa date.
export const listAuditLog = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    actorId: v.optional(v.id('users')),
  },
  returns: paginatedValidator(auditRowValidator),
  handler: async (ctx, { paginationOpts, search, actorId }) => {
    await requireNetworkRole(ctx, 'admin');
    const opts = clampPageSize(paginationOpts, AUDIT_PAGE_MAX);
    const term = normalizeSearchTerm(search);

    const result = term
      ? await ctx.db
          .query('auditLog')
          .withSearchIndex('search_action', (q) => {
            const q2 = q.search('action', term);
            return actorId ? q2.eq('actorId', actorId) : q2;
          })
          .paginate(opts)
      : actorId
        ? await ctx.db
            .query('auditLog')
            .withIndex('by_actor', (q) => q.eq('actorId', actorId))
            .order('desc')
            .paginate(opts)
        : await ctx.db.query('auditLog').order('desc').paginate(opts);

    // L'acteur était résolu ligne par ligne : un aller-retour par entrée, alors
    // qu'une poignée de comptes du back-office signe l'essentiel du journal.
    // On dédoublonne d'abord, puis on lit chaque acteur UNE fois.
    const actorIds = [
      ...new Set(
        result.page
          .map((e) => e.actorId)
          .filter((id): id is Id<'users'> => id !== undefined),
      ),
    ];
    const actors = new Map<Id<'users'>, Doc<'users'>>();
    await Promise.all(
      actorIds.map(async (id) => {
        // null si le compte a disparu : l'entrée reste lisible, sans acteur.
        const actor = await ctx.db.get(id);
        if (actor) actors.set(id, actor);
      }),
    );

    return {
      ...result,
      page: result.page.map((e) => {
        const actor = e.actorId ? actors.get(e.actorId) : undefined;
        return {
          action: e.action,
          createdAt: e.createdAt,
          targetId: e.targetId ?? null,
          actorId: e.actorId ?? null,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
        };
      }),
    };
  },
});
