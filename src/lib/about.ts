import { client } from '@dt-sanity/lib/client';
import { aboutPageQuery } from '@dt-sanity/lib/queries';
import { aboutFallback, type AboutContent } from '@/lib/about-content';

// Page À propos (F-11/F-12) côté Sanity : un document `aboutPage` par langue,
// édité par l'équipe (F-62). Lecture publique cachée (client CDN). Fallback
// **par section** sur le contenu local : si une section manque côté Sanity (ou
// si Sanity est indisponible), on rend la version locale — la page ne casse
// jamais et le SSR reste rapide.
export async function getAboutContent(
  locale: 'fr' | 'en',
): Promise<AboutContent> {
  const fb = aboutFallback(locale);
  let doc: Partial<AboutContent> | null = null;
  try {
    doc = await client.fetch<Partial<AboutContent> | null>(aboutPageQuery, {
      language: locale,
    });
  } catch {
    return fb; // Sanity injoignable -> repli local complet.
  }
  if (!doc) return fb;
  return {
    hero: doc.hero ?? fb.hero,
    vision: doc.vision ?? fb.vision,
    mission: doc.mission ?? fb.mission,
    founders: doc.founders ?? fb.founders,
    governance: doc.governance ?? fb.governance,
    funding: doc.funding ?? fb.funding,
    lineage: doc.lineage ?? fb.lineage,
    timeline: doc.timeline ?? fb.timeline,
    cta: doc.cta ?? fb.cta,
  };
}
