import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';

// Journal d'activité & export (F-67) — back-office. La table `auditLog` est
// peuplée par recordAudit (cf. convex/lib/audit.ts) sur chaque action sensible.
// Lecture RÉSERVÉE aux administrateurs (données sensibles : qui a fait quoi).
// L'acteur est résolu à la lecture via ctx.db.get(actorId) — null si le compte
// a disparu (ou si l'entrée n'a pas d'acteur, ex. action système).
export const listAuditLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireNetworkRole(ctx, 'admin');

    const max = limit ?? 200;
    const entries = await ctx.db
      .query('auditLog')
      .order('desc')
      .take(max);

    return await Promise.all(
      entries.map(async (e) => {
        const actor = e.actorId ? await ctx.db.get(e.actorId) : null;
        return {
          action: e.action,
          createdAt: e.createdAt,
          targetId: e.targetId ?? null,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
        };
      }),
    );
  },
});
