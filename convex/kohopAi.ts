import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { KOHOP_AI_DAILY_CAP } from './lib/kohopSemantic';

// KOHOP — the daily ceiling on model calls made by the originality checks
// (embeddings and confirmations). Every call is reserved BEFORE it is made, in
// one transaction, so two checks running at once cannot both slip under the cap.
// A reservation refused is a visible failure of the check — never a quiet pass.

/** The UTC day of an instant, `YYYY-MM-DD`. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export const reserveCalls = internalMutation({
  args: { calls: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { calls }) => {
    const day = utcDay(Date.now());
    const row = await ctx.db
      .query('kohopAiUsage')
      .withIndex('by_day', (q) => q.eq('day', day))
      .unique();
    const used = row?.calls ?? 0;
    if (used + calls > KOHOP_AI_DAILY_CAP) return false;
    if (row) await ctx.db.patch(row._id, { calls: used + calls });
    else await ctx.db.insert('kohopAiUsage', { day, calls });
    return true;
  },
});
