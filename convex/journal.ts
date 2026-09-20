import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';

// Journal d'activité & export (F-67) — back-office. La table `auditLog` est
// peuplée par recordAudit (cf. convex/lib/audit.ts) sur chaque action sensible.
// Lecture RÉSERVÉE aux administrateurs (données sensibles : qui a fait quoi).

const auditRowValidator = v.object({
  action: v.string(),
  createdAt: v.number(),
  targetId: v.union(v.string(), v.null()),
  actorName: v.union(v.string(), v.null()),
  actorEmail: v.union(v.string(), v.null()),
});

// Plafond DUR de la taille de page. `limit` n'en avait aucun (issue #8) : un
// appelant demandait `limit: 1e6` et la query relisait le journal entier — la
// table qui grossit le plus vite du produit, puisqu'une ligne y est écrite à
// chaque action sensible.
const AUDIT_PAGE_MAX = 100;

export const listAuditLog = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(auditRowValidator),
  handler: async (ctx, { paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');

    const result = await ctx.db
      .query('auditLog')
      .order('desc')
      .paginate(clampPageSize(paginationOpts, AUDIT_PAGE_MAX));

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
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
        };
      }),
    };
  },
});
