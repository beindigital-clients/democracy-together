import { unstable_rethrow } from 'next/navigation';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@convex/_generated/api';

// An unavailable data source must not take down the page.
//
// The rule is set by TESTING.md § "Sources externes". It was not upheld at
// first — the five pages that call `fetchQuery` during server render let the
// exception bubble up, and responded 500 (audit F-02). Measured: `/fr/bibliotheque`, `/fr/experts`,
// `/fr/le-reseau`, `/fr/thematiques` and `/fr/tribune` went down together, and
// `sitemap.xml` offered six of these addresses for indexing.
//
// What this fallback is NOT: a way to hide an outage. The error is
// logged as is, and the visitor sees the empty state the page already
// knows how to render — the one they would get if the network had no members.
// What they gain: the rest of the site (header, navigation, footer, editorial
// pages) keeps working.

/**
 * Runs a query and returns `fallback` if it fails.
 *
 * The module's name says "convex" because that is the finding that gave
 * rise to it, but this function knows NOTHING about Convex: it takes a
 * thunk. Only the empty shapes exported below are Convex-specific.
 *
 * The argument is a FUNCTION, not a promise: a promise would already be
 * created — hence already running — when entering the `try`, and a synchronous
 * throw while setting up the query would escape the catch.
 */
export async function fetchOrFallback<T>(
  source: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    // Next signals via a THROW things that are not failures: `notFound()`,
    // `redirect()`, and above all bailing out of static rendering ("Dynamic server
    // usage"), which `fetchQuery` triggers on every generation. Swallowing them
    // would be the worst possible failure mode: the route would stop being
    // recognized as dynamic and Next would freeze the FALLBACK into the
    // pre-rendered HTML — a "temporarily unavailable" page served
    // permanently, with the backend in perfect health. `unstable_rethrow` rethrows these
    // signals and only returns control for a real error.
    unstable_rethrow(err);
    console.error(`[${source}] Convex indisponible :`, err);
    return fallback;
  }
}

type PublicationList = FunctionReturnType<
  typeof api.publications.listPublished
>;
type DirectoryList = FunctionReturnType<typeof api.organizations.listDirectory>;
type ExpertList = FunctionReturnType<typeof api.experts.listExperts>;
type TribunePostList = FunctionReturnType<typeof api.tribune.listPosts>;
type RelatedPublications = FunctionReturnType<
  typeof api.publications.relatedByTheme
>;

// The empty shapes are TYPED by each query's actual return type
// (`FunctionReturnType`): the day a facet is added on the Convex side, this
// file stops compiling instead of serving an incomplete object to the page.
export const EMPTY_PUBLICATION_LIST: PublicationList = {
  items: [],
  facets: { themes: [], types: [], regions: [], languages: [], access: [] },
  total: 0,
};

export const EMPTY_DIRECTORY_LIST: DirectoryList = {
  items: [],
  facets: { regions: [], themes: [], countries: [], languages: [] },
  total: 0,
};

export const EMPTY_EXPERT_LIST: ExpertList = [];

export const EMPTY_TRIBUNE_POSTS: TribunePostList = [];

export const EMPTY_RELATED_PUBLICATIONS: RelatedPublications = [];
