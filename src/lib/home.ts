import { client } from '@dt-sanity/lib/client';
import { homePageQuery } from '@dt-sanity/lib/queries';
import { homeFallback, type HomeContent } from '@/lib/home-content';

// Page d'accueil (F-10) côté Sanity : un document `homePage` par langue, édité
// par l'équipe (F-62). Lecture publique cachée (client CDN). Fallback **par
// section** sur le contenu local : si une section manque côté Sanity (ou si
// Sanity est indisponible), on rend la version locale — la page ne casse jamais.
export async function getHomeContent(
  locale: 'fr' | 'en',
): Promise<HomeContent> {
  const fb = homeFallback(locale);
  let doc: Partial<HomeContent> | null = null;
  try {
    doc = await client.fetch<Partial<HomeContent> | null>(homePageQuery, {
      language: locale,
    });
  } catch {
    return fb;
  }
  if (!doc) return fb;
  return {
    hero: doc.hero ?? fb.hero,
    mission: doc.mission ?? fb.mission,
    analyses: doc.analyses ?? fb.analyses,
    barometre: doc.barometre ?? fb.barometre,
    axes: doc.axes ?? fb.axes,
    events: doc.events ?? fb.events,
    youth: doc.youth ?? fb.youth,
    join: doc.join ?? fb.join,
    newsletter: doc.newsletter ?? fb.newsletter,
  };
}
