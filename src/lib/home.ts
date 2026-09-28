import { client } from '@dt-sanity/lib/client';
import { homePageQuery } from '@dt-sanity/lib/queries';
import { homeFallback, type HomeContent } from '@/lib/home-content';
import type { Locale } from '@/i18n/routing';

// Home page (F-10) on the Sanity side: one `homePage` document per language, edited
// by the team (F-62). Cached public read (CDN client). Fallback **per
// section** to the local content: if a section is missing in Sanity (or if
// Sanity is unavailable), the local version is rendered — the page never breaks.
export async function getHomeContent(locale: Locale): Promise<HomeContent> {
  const fb = homeFallback(locale);
  let doc: Partial<HomeContent> | null;
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
