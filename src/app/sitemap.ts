import type { MetadataRoute } from 'next';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { client } from '@dt-sanity/lib/client';
import { routing } from '@/i18n/routing';
import { loadAgenda, loadThemes } from '@/lib/contenus/load';
import { publicReportYears, REPORT_YEARS } from '@/lib/reports-content';

// Bilingual sitemap (F-07). Each logical page is listed once per locale
// (localePrefix 'always' -> /fr and /en), with hreflang alternates
// (fr/en/x-default) consistent with the canonicals set by the
// generateMetadata functions. The dynamic fetches (publications, members,
// news) are fault-tolerant: on failure, the sitemap shrinks to the static
// pages rather than returning an error.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

type ChangeFreq = MetadataRoute.Sitemap[number]['changeFrequency'];

function localized(
  path: string,
  lastModified?: Date,
  changeFrequency: ChangeFreq = 'weekly',
): MetadataRoute.Sitemap {
  const suffix = path ? `/${path}` : '';
  const languages: Record<string, string> = {
    'x-default': `${SITE}/${routing.defaultLocale}${suffix}`,
  };
  for (const l of routing.locales) languages[l] = `${SITE}/${l}${suffix}`;
  return routing.locales.map((l) => ({
    url: `${SITE}/${l}${suffix}`,
    lastModified,
    changeFrequency,
    alternates: { languages },
  }));
}

// Static public pages (private/auth zones are excluded here AND
// disallowed in robots.txt).
const STATIC_PATHS = [
  '',
  'a-propos',
  'le-reseau',
  'bibliotheque',
  'barometre',
  'thematiques',
  'experts',
  'rapports',
  'tribune',
  'evenements',
  'evenements/calendrier',
  'replays',
  'jeunes',
  'adhesion',
  'appels-a-projets',
  'boite-a-outils',
  'parcours',
  'actualites',
  'contact',
  'partenaires',
  'presse',
  'don',
  'newsletter',
  'mentions-legales',
  'confidentialite',
  'accessibilite',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const p of STATIC_PATHS) {
    entries.push(...localized(p, undefined, p === '' ? 'daily' : 'weekly'));
  }

  // Events (neutral slugs, shared across languages) — `contentEvents`
  // table, or hard-coded fallback catalogue: never a draft.
  const { items: events } = await loadAgenda(routing.defaultLocale);
  for (const e of events) entries.push(...localized(`evenements/${e.slug}`));

  // Thematic overviews (F-36) — stable slugs, same source rule.
  const { items: themes } = await loadThemes(routing.defaultLocale);
  for (const th of themes) {
    entries.push(...localized(`thematiques/${th.slug}`));
  }

  // Annual reports (F-41) — one URL per published year, shared across
  // languages: administered editions (Convex) and hard-coded editions the
  // database does not know. Database unreachable: the hard-coded years.
  let reportYears: number[] = [...REPORT_YEARS];
  try {
    reportYears = publicReportYears(
      await fetchQuery(api.annualReports.listPublic, { locale: 'fr' }),
    );
  } catch {
    /* Convex unreachable: we keep the hard-coded years. */
  }
  for (const year of reportYears) {
    entries.push(...localized(`rapports/${year}`, undefined, 'yearly'));
  }

  // Published publications (Convex).
  try {
    const { items } = await fetchQuery(api.publications.listPublished, {});
    for (const pub of items) {
      entries.push(
        ...localized(
          `bibliotheque/${pub.slug}`,
          pub.publishedAt ? new Date(pub.publishedAt) : undefined,
        ),
      );
    }
  } catch {
    /* Convex unreachable: we keep the static pages. */
  }

  // Published calls for projects and learning paths (F-60, F-57).
  try {
    const calls = await fetchQuery(api.projectCalls.listPublicCalls, {});
    for (const c of calls)
      entries.push(...localized(`appels-a-projets/${c.slug}`));
    const paths = await fetchQuery(api.toolbox.listPaths, {});
    for (const p of paths) entries.push(...localized(`parcours/${p.slug}`));
  } catch {
    /* same */
  }

  // Active member entries (Convex).
  try {
    const { items } = await fetchQuery(api.organizations.listDirectory, {});
    for (const org of items)
      entries.push(...localized(`le-reseau/${org.slug}`));
  } catch {
    /* same */
  }

  // PUBLIC profiles of people ("social" workstream). The query only returns
  // profiles whose visibility is "public": a members-only or private
  // profile has no business in an index.
  try {
    const people = await fetchQuery(api.social.profiles.listPublicHandles, {});
    for (const p of people) {
      entries.push(
        ...localized(`membres/${p.handle}`, new Date(p.updatedAt), 'monthly'),
      );
    }
  } catch {
    /* same */
  }

  // News (Sanity) — one URL per language based on the post's `language` field.
  try {
    const posts: { slug: string; language: string; _updatedAt?: string }[] =
      await client.fetch(
        `*[_type == "post" && defined(slug.current)]{ "slug": slug.current, language, _updatedAt }`,
      );
    for (const post of posts) {
      if (!post.slug) continue;
      if (!(routing.locales as readonly string[]).includes(post.language)) {
        continue;
      }
      entries.push({
        url: `${SITE}/${post.language}/actualites/${post.slug}`,
        lastModified: post._updatedAt ? new Date(post._updatedAt) : undefined,
        changeFrequency: 'monthly',
      });
    }
  } catch {
    /* Sanity unreachable: we keep the rest. */
  }

  return entries;
}
