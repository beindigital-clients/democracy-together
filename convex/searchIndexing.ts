import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { countryTerms } from './lib/directory';
import {
  organizationSearchText,
  publicationSearchText,
  tribuneSearchText,
  yearOf,
} from './lib/searchText';

// MIGRATION: FILLING THE SEARCH HAYSTACKS (diffusion workstream).
//
// Documents written BEFORE the `search_text` indexes were added do not carry
// `searchText`: the index ignores them, and the global search does not find
// them. This migration recomputes each document's haystack, table by
// table, in pages — a mutation only reads a bounded number of documents, the
// rest is rescheduled.
//
// IDEMPOTENT: it RECOMPUTES, it does not just fill the gaps.
// Re-running it after changing a haystack function (one more field
// in `publicationSearchText`, for example) updates all existing data. A
// document whose haystack is already correct is not rewritten.
//
// Run once after deployment (trusted context):
//   npx convex run searchIndexing:backfill '{}'
// or for a single table:
//   npx convex run searchIndexing:backfill '{"table":"publications"}'

const TABLES = ['publications', 'organizations', 'tribunePosts'] as const;
const tableValidator = v.union(...TABLES.map((t) => v.literal(t)));
const PAGE = 200;

export const backfill = internalMutation({
  args: {
    table: v.optional(tableValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
    // Moves on to the next table once this one is done (run without
    // `table`: all tables).
    chain: v.optional(v.boolean()),
  },
  returns: v.object({
    table: v.string(),
    updated: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const table = args.table ?? TABLES[0];
    const chain = args.chain ?? args.table === undefined;
    const cursor = args.cursor ?? null;
    let updated = 0;
    let page: { isDone: boolean; continueCursor: string };

    if (table === 'publications') {
      const r = await ctx.db
        .query('publications')
        .paginate({ numItems: PAGE, cursor });
      for (const p of r.page) {
        const searchText = publicationSearchText(p);
        const searchLang = p.languages[0];
        if (p.searchText !== searchText || p.searchLang !== searchLang) {
          await ctx.db.patch(p._id, { searchText, searchLang });
          updated++;
        }
      }
      page = r;
    } else if (table === 'organizations') {
      const r = await ctx.db
        .query('organizations')
        .paginate({ numItems: PAGE, cursor });
      for (const o of r.page) {
        const searchText = organizationSearchText(o, countryTerms);
        if (o.searchText !== searchText) {
          await ctx.db.patch(o._id, { searchText });
          updated++;
        }
      }
      page = r;
    } else {
      const r = await ctx.db
        .query('tribunePosts')
        .paginate({ numItems: PAGE, cursor });
      for (const p of r.page) {
        const searchText = tribuneSearchText(p);
        const searchYear = yearOf(p.createdAt);
        if (p.searchText !== searchText || p.searchYear !== searchYear) {
          await ctx.db.patch(p._id, { searchText, searchYear });
          updated++;
        }
      }
      page = r;
    }

    const { isDone, continueCursor } = page;
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.searchIndexing.backfill, {
        table,
        cursor: continueCursor,
        chain,
      });
    } else if (chain) {
      const next = TABLES[TABLES.indexOf(table) + 1];
      if (next) {
        await ctx.scheduler.runAfter(0, internal.searchIndexing.backfill, {
          table: next,
          cursor: null,
          chain,
        });
      }
    }
    return { table, updated, done: isDone };
  },
});
