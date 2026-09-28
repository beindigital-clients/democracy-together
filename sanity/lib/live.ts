import { defineLive } from 'next-sanity/live';
import { client } from './client';

// Cached reads revalidatable by tag (sanityFetch) + <SanityLive/>.
//
// NO CONSUMER TODAY, AND KEPT AS IS — decision deferred
// (issue #40). This module is not dead by accident: it is dead because the
// cache was never wired up, which is precisely the subject of #13 (static
// rendering and caching of editorial pages). Deleting it here would amount to
// rewriting it identically in #13. Settling it — wiring `sanityFetch` into the
// editorial pages, or removing this file — therefore belongs to #13.
export const { sanityFetch, SanityLive } = defineLive({ client });
