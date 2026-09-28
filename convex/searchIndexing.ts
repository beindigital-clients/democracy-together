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

// MIGRATION : REMPLISSAGE DES MEULES DE RECHERCHE (chantier diffusion).
//
// Les documents écrits AVANT l'ajout des index `search_text` ne portent pas
// de `searchText` : l'index les ignore, et la recherche globale ne les trouve
// pas. Cette migration recalcule la meule de chaque document, table par
// table, par pages — une mutation ne lit qu'un nombre borné de documents, la
// suite est replanifiée.
//
// IDEMPOTENTE : elle RECALCULE, elle ne se contente pas de combler les trous.
// La relancer après avoir modifié une fonction de meule (un champ de plus
// dans `publicationSearchText`, par exemple) met tout l'existant à jour. Un
// document dont la meule est déjà juste n'est pas réécrit.
//
// Lancement, une fois après le déploiement (contexte de confiance) :
//   npx convex run searchIndexing:backfill '{}'
// ou pour une seule table :
//   npx convex run searchIndexing:backfill '{"table":"publications"}'

const TABLES = ['publications', 'organizations', 'tribunePosts'] as const;
const tableValidator = v.union(...TABLES.map((t) => v.literal(t)));
const PAGE = 200;

export const backfill = internalMutation({
  args: {
    table: v.optional(tableValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
    // Enchaîne sur la table suivante une fois celle-ci finie (lancement sans
    // `table` : toutes les tables).
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
