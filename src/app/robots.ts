import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

// robots.txt (F-07) : indexation des pages publiques, exclusion des zones
// privées (back-office, espace membre, tunnels d'auth), du Studio Sanity et de
// l'API. Pointe le sitemap.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Segments réellement PRIVÉS, déclinés par locale (localePrefix 'always').
//
// « Privé » et « non indexable » ne sont plus confondus (arbitrage client du
// 23/09). Les trois tunnels d'authentification — connexion, connexion-otp,
// mot-de-passe-oublie — portaient les DEUX protections, qui se neutralisaient :
// un moteur qui respecte le `Disallow` ne vient jamais lire le `noindex` posé
// dans la page, si bien que la seconde ceinture ne servait qu'à documenter une
// intention. Le `Disallow` est retiré, le `noindex` reste : le moteur passe, lit
// la consigne et l'applique. C'est la configuration la plus fiable des deux, et
// `tests/unit/seo-coherence.test.ts` interdit désormais de les recombiner.
//
// `inscription` reste ici : la page ne fait que rediriger vers /adhesion, elle
// ne porte aucune métadonnée et n'a rien à faire dans un index.
const PRIVATE = ['admin', 'espace-membre', 'espaces', 'inscription'];

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
