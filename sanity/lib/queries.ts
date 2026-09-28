import { groq } from 'next-sanity';

// Explicit projections + parameters ($) — never direct interpolation.

export const postsQuery = groq`*[_type == "post" && defined(slug.current) && language == $language]
  | order(publishedAt desc) {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    "coverUrl": coverImage.asset->url
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

// About page (F-11/F-12) — explicit projection to the AboutContent shape
// (we strip the _key/_type from arrays). One document per language.
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

// Home page (F-10) — explicit projection to the HomeContent shape (we
// strip the _key from arrays). One document per language.
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
