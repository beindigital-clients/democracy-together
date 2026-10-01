import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

// robots.txt (F-07): indexing of public pages, exclusion of private zones
// (back office, member area, auth funnels) and the API. Points to the
// sitemap.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Truly PRIVATE segments, one per locale (localePrefix 'always').
//
// "Private" and "not indexable" are no longer conflated (client decision of
// 23/09). The three authentication funnels — connexion, connexion-otp,
// mot-de-passe-oublie — carried BOTH protections, which cancelled each other
// out: a crawler that honours the `Disallow` never comes to read the
// `noindex` set in the page, so the second safeguard only served to document
// an intention. The `Disallow` is removed, the `noindex` stays: the crawler
// comes by, reads the directive and applies it. It is the more reliable of
// the two configurations, and `tests/unit/seo-coherence.test.ts` now forbids
// recombining them.
//
// `inscription` stays here: the page only redirects to /adhesion, it
// carries no metadata and has no business in an index.
const PRIVATE = ['admin', 'espace-membre', 'espaces', 'inscription'];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/api/',
    ...routing.locales.flatMap((l) => PRIVATE.map((p) => `/${l}/${p}`)),
  ];
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
