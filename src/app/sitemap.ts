import type { MetadataRoute } from 'next';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { client } from '@dt-sanity/lib/client';
import { routing } from '@/i18n/routing';
import { EVENTS } from '@/lib/events-content';
import { THEME_SLUGS } from '@/lib/themes-content';
import { REPORT_YEARS } from '@/lib/reports-content';

// Sitemap bilingue (F-07). Chaque page logique est listée une fois par locale
// (localePrefix 'always' -> /fr et /en), avec les alternates hreflang
// (fr/en/x-default) cohérents avec les canonicals posés par les
// generateMetadata. Les fetchs dynamiques (publications, membres, actualités)
// sont tolérants aux pannes : en cas d'échec, le sitemap se réduit aux pages
// statiques plutôt que de renvoyer une erreur.
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

// Pages publiques statiques (les zones privées/auth sont exclues ici ET
// interdites dans robots.txt).
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
  'jeunes',
  'adhesion',
  'appels-a-projets',
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

  // Événements (slugs neutres, partagés fr/en).
  for (const e of EVENTS) entries.push(...localized(`evenements/${e.slug}`));

  // Synthèses thématiques (F-36) — 5 axes, slugs neutres partagés fr/en.
  for (const slug of THEME_SLUGS) {
    entries.push(...localized(`thematiques/${slug}`));
  }

  // Rapports annuels (F-41) — une URL par année, partagée fr/en.
  for (const year of REPORT_YEARS) {
    entries.push(...localized(`rapports/${year}`, undefined, 'yearly'));
  }

  // Publications publiées (Convex).
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
    /* Convex injoignable : on garde les pages statiques. */
  }

  // Fiches membres actives (Convex).
  try {
    const { items } = await fetchQuery(api.organizations.listDirectory, {});
    for (const org of items) entries.push(...localized(`le-reseau/${org.slug}`));
  } catch {
    /* idem */
  }

  // Actualités (Sanity) — une URL par langue selon le champ `language` du post.
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
    /* Sanity injoignable : on garde le reste. */
  }

  return entries;
}
