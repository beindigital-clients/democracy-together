import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';

// DEV/TEST only (AUTH_DEV_OTP guard) — cleanup of content created by
// the E2E specs `contenus-*.spec.ts`.
//
// A dev deployment lives a long time: without cleanup, each run
// would add an event, a partner and a media item to the agenda and to the public
// pages, and the specs that read those pages would end up counting
// leftovers from past campaigns. Cleanup is BOUNDED to the `e2e-` prefix (slugs,
// file names): it cannot touch real content, which has no
// reason to carry it — and it is closed outside dev, like all the oracles.
const PREFIX = 'e2e-';

export const deleteE2eContent = internalMutation({
  // `stamp`: only remove what ONE run created (its timestamp is
  // in each slug, title and file name). Without it, the end-of-run cleanup
  // of one Playwright project erased the event that the SAME file, run in
  // parallel by the other project (desktop / mobile), was in the middle of testing
  // — measured in the 27/09 replay: "Page introuvable" for the member.
  args: { stamp: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ deleted: v.number() })),
  handler: async (ctx, { stamp }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const mine = (key: string) =>
      key.startsWith(PREFIX) && (!stamp || key.includes(stamp));
    let deleted = 0;

    for (const e of await ctx.db.query('contentEvents').take(1000)) {
      if (!mine(e.slug)) continue;
      for (const r of await ctx.db
        .query('eventRegistrations')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', e.slug))
        .take(500))
        await ctx.db.delete(r._id);
      for (const r of await ctx.db
        .query('eventReminders')
        .withIndex('by_event_and_email', (q) => q.eq('eventSlug', e.slug))
        .take(500))
        await ctx.db.delete(r._id);
      await ctx.db.delete(e._id);
      deleted += 1;
    }
    for (const table of [
      'contentReplays',
      'contentPartners',
      'contentThemes',
    ] as const) {
      for (const row of await ctx.db.query(table).take(1000)) {
        if (mine(row.slug)) {
          await ctx.db.delete(row._id);
          deleted += 1;
        }
      }
    }
    for (const p of await ctx.db.query('contentPress').take(1000)) {
      if (mine(p.title)) {
        await ctx.db.delete(p._id);
        deleted += 1;
      }
    }
    // Media last: the references above are gone.
    for (const m of await ctx.db.query('contentMedia').take(1000)) {
      if (mine(m.filename)) {
        await ctx.storage.delete(m.storageId);
        await ctx.db.delete(m._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});
