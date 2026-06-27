import { groq } from 'next-sanity';

// Projections explicites + paramètres ($) — jamais d'interpolation directe.

export const postsQuery = groq`*[_type == "post" && defined(slug.current) && language == $language]
  | order(publishedAt desc) {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    "coverUrl": coverImage.asset->url
  }`;

// Les 3 dernières actualités (section accueil, F-10).
export const latestPostsQuery = groq`*[_type == "post" && defined(slug.current) && language == $language]
  | order(publishedAt desc)[0...3] {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt
  }`;

export const postBySlugQuery = groq`*[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    language,
    excerpt,
    publishedAt,
    body,
    "coverUrl": coverImage.asset->url,
    seo
  }`;

export const pageBySlugQuery = groq`*[_type == "page" && slug.current == $slug && language == $language][0] {
    _id,
    title,
    body,
    seo
  }`;

// Page À propos (F-11/F-12) — projection explicite vers la forme AboutContent
// (on retire les _key/_type des tableaux). Un document par langue.
export const aboutPageQuery = groq`*[_type == "aboutPage" && language == $language][0]{
  hero{ eyebrow, title, lead },
  vision{ eyebrow, statement, attribution },
  mission{ eyebrow, axes[]{ n, title, body } },
  founders{ eyebrow, title, intro, people[]{ name, role, bio } },
  governance{
    eyebrow, title, intro,
    hubs[]{ city, scope, body },
    framework{ title, body },
    committees{ title, items[]{ n, name, body } }
  },
  funding{ eyebrow, title, intro, sources[]{ name, body }, note },
  lineage{ eyebrow, title, intro, refs[]{ name, body } },
  timeline{ eyebrow, title, intro, steps[]{ date, title, body } },
  cta{ title, body, primary, secondary }
}`;

// Page d'accueil (F-10) — projection explicite vers la forme HomeContent (on
// retire les _key des tableaux). Un document par langue.
export const homePageQuery = groq`*[_type == "homePage" && language == $language][0]{
  hero{ eyebrow, title, lead, ctaPrimary, ctaSecondary, visualLabel, visualCaption, creds[]{ label, value } },
  mission{ title, cta, cells[]{ ix, title, body }, barometer{ label, title, body } },
  analyses{ title, cta, featured{ tag, title, body, chips }, items[]{ tag, title, body } },
  barometre{ eyebrow, title, body, countries[]{ name, score }, legend, note, mapLabel, links },
  axes{ title, items[]{ n, title, body } },
  events{ title, cta, featured{ tag, title, body, action }, items[]{ date, kind, title, meta } },
  youth{ eyebrow, title, body, cta, steps[]{ n, title, body } },
  join{ title, body, plans[]{ label, title, features, cta } },
  newsletter{ title, body, cta, placeholder }
}`;

export const publicationsQuery = groq`*[_type == "publication" && defined(slug.current) && language == $language]
  | order(publishedAt desc) {
    _id,
    title,
    "slug": slug.current,
    type,
    organization,
    region,
    themes,
    publishedAt,
    doi,
    accessLevel
  }`;
