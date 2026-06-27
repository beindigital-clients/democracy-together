import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

// robots.txt (F-07) : indexation des pages publiques, exclusion des zones
// privées (back-office, espace membre, tunnels d'auth), du Studio Sanity et de
// l'API. Pointe le sitemap.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Segments privés / non indexables, déclinés par locale (localePrefix 'always').
const PRIVATE = [
  'admin',
  'espace-membre',
  'espaces',
  'connexion',
  'connexion-otp',
  'inscription',
  'mot-de-passe-oublie',
];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/studio',
    '/api/',
    ...routing.locales.flatMap((l) => PRIVATE.map((p) => `/${l}/${p}`)),
  ];
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
