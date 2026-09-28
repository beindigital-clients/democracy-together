import { client } from '@dt-sanity/lib/client';
import { aboutPageQuery } from '@dt-sanity/lib/queries';
import { aboutFallback, type AboutContent } from '@/lib/about-content';
import type { Locale } from '@/i18n/routing';

// About page (F-11/F-12) on the Sanity side: one `aboutPage` document per language,
// edited by the team (F-62). Cached public read (CDN client). Fallback
// **per section** to the local content: if a section is missing in Sanity (or
// if Sanity is unavailable), the local version is rendered — the page never
// breaks and SSR stays fast.
export async function getAboutContent(locale: Locale): Promise<AboutContent> {
  const fb = aboutFallback(locale);
  let doc: Partial<AboutContent> | null;
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
