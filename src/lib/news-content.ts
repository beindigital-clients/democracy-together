import type { Locale } from '@/i18n/routing';
// F-15 — News. The articles are written in the back office (`contentNews`,
// convex/contenus/news.ts). The three articles the network published before
// that live in `convex/lib/contenus/coded/news.ts`: the internal import
// copies them into the table, and the pages serve them as a FALLBACK while
// the table holds no published article ("contenus" workstream).
import { CODED_NEWS } from '@convex/lib/contenus/coded/news';

// Shape served by `api.contenus.news.listPublic` / `getPublic`, so that the
// pages render the table and the fallback alike.
export type NewsItem = {
  slug: string;
  title: string;
  excerpt: string;
  // Publication day, `YYYY-MM-DD`.
  publishedOn: string;
  // Language of the texts served, for the `lang` attribute.
  lang: Locale;
  // Part of the text is a MACHINE translation from this language (a
  // language the editors left empty, convex/contenus/news.ts).
  machineFrom?: Locale;
};

export type NewsArticle = NewsItem & { body: string[] };

function toItem(n: (typeof CODED_NEWS)[number], locale: Locale): NewsItem {
  return {
    slug: n.slug,
    title: n.text[locale].title,
    excerpt: n.text[locale].excerpt,
    publishedOn: n.publishedOn,
    lang: locale,
  };
}

/** The coded articles, newest first. */
export function codedNews(locale: Locale): NewsItem[] {
  return CODED_NEWS.map((n) => toItem(n, locale));
}

export function codedNewsArticle(
  slug: string,
  locale: Locale,
): NewsArticle | null {
  const n = CODED_NEWS.find((a) => a.slug === slug);
  return n ? { ...toItem(n, locale), body: n.text[locale].body } : null;
}
