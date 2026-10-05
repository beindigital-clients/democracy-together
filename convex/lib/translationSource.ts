import type { QueryCtx } from '../_generated/server';
import { SITE_LOCALES, type SiteLocale } from './locales';
import { getCurrentUser, rank } from './rbac';
import {
  newsLocalesToTranslate,
  newsSource,
  type TranslatableFields,
  type TranslationSourceType,
} from './translation';

// READING THE CONTENT TO TRANSLATE — shared by the reading queries
// (convex/translation.ts) and the jobs that write translations
// (convex/translationJobs.ts).
//
// A single function for every content family, because a single shape covers
// them (cf. `TranslatableFields`). It ALSO returns the source language, which
// the tables do not store the same way: a Tribune post carries a single
// `lang`, a publication a LIST of languages whose first is the language it
// was written in, and a news article the first language its editors filled.

export type Source = {
  fields: TranslatableFields;
  sourceLocale: SiteLocale;
  /** Members-only content: so is its translation. */
  membersOnly: boolean;
  /** Languages this content is translated into. */
  targets: SiteLocale[];
};

function allBut(sourceLocale: SiteLocale): SiteLocale[] {
  return SITE_LOCALES.filter((l) => l !== sourceLocale);
}

/**
 * The PUBLISHED content behind a translation, or `null`.
 *
 * Content that is not live has nothing to translate and nothing to show:
 * a draft, a pending submission or a removed post all answer `null`.
 */
export async function readSource(
  ctx: QueryCtx,
  sourceType: TranslationSourceType,
  sourceId: string,
): Promise<Source | null> {
  // `normalizeId` BEFORE `db.get`, and this is not a stylistic precaution:
  // the one-argument overload of `db.get` does NOT check the table. With
  // `sourceType` supplied by the client, a restricted publication identifier
  // passed as a "post" loaded the publication document and then took a
  // branch that sets `membersOnly: false` HARD-CODED. `normalizeId` returns
  // `null` as soon as the identifier comes from another table: the client's
  // discriminant ceases to be an authority.
  if (sourceType === 'tribunePost') {
    const postId = ctx.db.normalizeId('tribunePosts', sourceId);
    if (!postId) return null;
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    const sourceLocale = post.lang ?? 'fr';
    return {
      // A post body is a single input field: we split it into
      // paragraphs on blank lines, as the page rendering does.
      // Translating a 4,000-character block as a single string gives the model
      // full latitude to recompose its structure.
      fields: { title: post.title, body: splitParagraphs(post.body) },
      sourceLocale,
      membersOnly: false,
      targets: allBut(sourceLocale),
    };
  }

  if (sourceType === 'news') {
    const newsId = ctx.db.normalizeId('contentNews', sourceId);
    if (!newsId) return null;
    const news = await ctx.db.get(newsId);
    if (!news || news.status !== 'published') return null;
    const source = newsSource(news);
    if (!source) return null;
    return {
      ...source,
      membersOnly: false,
      // Only the languages editors left empty: a hand-written language is
      // never replaced by a machine translation.
      targets: newsLocalesToTranslate(news, source.sourceLocale),
    };
  }

  const pubId = ctx.db.normalizeId('publications', sourceId);
  if (!pubId) return null;
  const pub = await ctx.db.get(pubId);
  if (!pub || pub.status !== 'published') return null;
  // `languages` is a list; the FIRST is the language it was written in. A
  // publication submitted without a language falls back to French, as
  // everywhere else in the repo.
  const sourceLocale = pub.languages[0] ?? 'fr';
  return {
    fields: {
      title: pub.title,
      abstract: pub.abstract,
      keypoints: pub.keypoints.length > 0 ? pub.keypoints : undefined,
      body: pub.body,
    },
    sourceLocale,
    membersOnly: pub.access === 'members',
    targets: allBut(sourceLocale),
  };
}

/**
 * Does the reader have at least the "member" rank?
 *
 * Same scale as `viewerIsMember` in `convex/publications.ts`, and this is
 * deliberate: the translation of a restricted publication is the full text of
 * that publication. Two different scales for the same data is a
 * back door that opens at the first divergence.
 */
export async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

/**
 * Splits free text into paragraphs.
 *
 * On blank lines, and on them only: a simple line break
 * inside a paragraph does not open a new one, which is already how
 * the Tribune renders posts.
 */
export function splitParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A text without a blank line remains one paragraph: returning an empty array
  // would make the output schema fail (`minItems: 0`), and would lose the text.
  return parts.length > 0 ? parts : [body.trim()].filter(Boolean);
}
