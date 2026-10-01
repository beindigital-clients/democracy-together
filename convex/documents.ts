import { v } from 'convex/values';
import { query } from './_generated/server';
import { SITE_LOCALES, locale, type SiteLocale } from './lib/locales';
import { viewerIsMember } from './lib/translationSource';

// THE ATTACHED PDF OF A PUBLICATION, IN EVERY LANGUAGE — what readers see.
//
// The file is translated when the publication goes live, keeping its design
// (convex/documentJobs.ts). This module serves the result: for each site
// language, the original or its translation, with its state.
//
// Until 2026-10-01 this module rebuilt the PDF as an HTML page, translated on
// a reader's request. That view is gone with reader-triggered translation;
// its two tables remain declared (schema.ts) until their rows are cleared.
//
// ACCESS IS THE PUBLICATION'S. A members-only publication gives a visitor no
// file at all — not the original, not a translation: each is its full text.

const fileStatus = v.union(
  v.literal('original'),
  v.literal('ready'),
  v.literal('pending'),
  v.literal('failed'),
  v.literal('missing'),
);

/**
 * The PDF of a publication in each site language.
 *
 * `url` is set for the original and for ready translations. A translation
 * made from a file the publication no longer carries counts as `missing`.
 * `null` when the publication is not published, has no file, or is
 * members-only and the reader is not a member.
 */
export const getDocumentFiles = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      sourceLocale: locale,
      files: v.array(
        v.object({
          locale,
          status: fileStatus,
          url: v.optional(v.string()),
          pages: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { slug }) => {
    if (slug.length > 200) return null;
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published' || !pub.fileId) return null;
    if (pub.access === 'members' && !(await viewerIsMember(ctx))) return null;

    const sourceLocale = pub.languages[0] ?? 'fr';
    const rows = await ctx.db
      .query('documentTranslations')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', pub._id),
      )
      // Five languages at most, minus the original.
      .take(8);
    const byLocale = new Map(rows.map((r) => [r.targetLocale, r]));

    const files: {
      locale: SiteLocale;
      status: 'original' | 'ready' | 'pending' | 'failed' | 'missing';
      url?: string;
      pages?: number;
    }[] = [];
    for (const l of SITE_LOCALES) {
      if (l === sourceLocale) {
        const url = await ctx.storage.getUrl(pub.fileId);
        files.push({
          locale: l,
          status: 'original' as const,
          ...(url ? { url } : {}),
          ...(pub.pages ? { pages: pub.pages } : {}),
        });
        continue;
      }
      const row = byLocale.get(l);
      if (!row || row.fileId !== pub.fileId) {
        files.push({ locale: l, status: 'missing' as const });
        continue;
      }
      if (row.status !== 'ready' || !row.storageId) {
        files.push({ locale: l, status: row.status });
        continue;
      }
      const url = await ctx.storage.getUrl(row.storageId);
      files.push(
        url
          ? {
              locale: l,
              status: 'ready' as const,
              url,
              ...(row.pages ? { pages: row.pages } : {}),
            }
          : { locale: l, status: 'missing' as const },
      );
    }
    return { sourceLocale, files };
  },
});
