import { v, type Validator } from 'convex/values';
import type { PaginationOptions } from 'convex/server';

// Pagination des listes du back-office (issue #8).
//
// `paginationOpts.numItems` vient du CLIENT : sans plafond serveur, un appelant
// demande 100 000 lignes et la query redevient exactement le scan de table
// qu'elle remplace. On le borne ici, une fois, pour toutes les listes.
export const PAGE_SIZE_MAX = 100;
export const PAGE_SIZE_DEFAULT = 50;

export function clampPageSize(
  opts: PaginationOptions,
  max: number = PAGE_SIZE_MAX,
): PaginationOptions {
  const asked = Number.isFinite(opts.numItems)
    ? Math.floor(opts.numItems)
    : PAGE_SIZE_DEFAULT;
  return { ...opts, numItems: Math.min(Math.max(asked, 1), max) };
}

// Validateur de retour d'une query paginée : la forme de `PaginationResult`,
// paramétrée par celle d'une ligne de page. Déclarer ce qui sort reste la règle
// du dépôt (cf. publications.listPublished) — y compris sur une liste paginée.
export function paginatedValidator<
  T extends Validator<unknown, 'required', string>,
>(item: T) {
  return v.object({
    page: v.array(item),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal('SplitRecommended'),
        v.literal('SplitRequired'),
        v.null(),
      ),
    ),
  });
}
