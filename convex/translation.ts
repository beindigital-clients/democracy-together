import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { SITE_LOCALES, locale } from './lib/locales';
import {
  sourceFingerprint,
  translatableFields,
  translationSourceType,
} from './lib/translation';
import {
  readSource,
  splitParagraphs,
  viewerIsMember,
} from './lib/translationSource';

// TRANSLATION OF PUBLISHED CONTENT — what readers see.
//
// Since 2026-10-01 content is translated ONCE, when it goes live, into every
// other site language (convex/translationJobs.ts). Readers no longer request
// anything: they pick the language they read in, and this module serves it.
//
// THREE RULES, enforced by the code and covered by the tests:
//
//  1. THE ORIGINAL NEVER DISAPPEARS. No write touches the source
//     document. A translation is a row alongside it, which the page can ignore —
//     and which it does ignore as soon as the text's fingerprint has changed.
//  2. NOTHING IS DISPLAYED AS TRANSLATED WITHOUT BEING SO. A language whose
//     translation is pending, failed or stale is served in the original, and
//     the page says which of the three it is.
//  3. A MEMBERS-ONLY PUBLICATION KEEPS ITS DOOR. Its translation is its full
//     text: a visitor gets nothing here, not even the list of languages.

export { splitParagraphs };

const versionStatus = v.union(
  v.literal('original'),
  v.literal('ready'),
  v.literal('pending'),
  v.literal('failed'),
  v.literal('missing'),
);

type VersionStatus = 'ready' | 'pending' | 'failed' | 'missing';

/**
 * State of one language's translation, judged against the CURRENT text.
 * A `ready` row describing an older text is as good as missing: the page
 * must not serve it, and saying "available" would be a lie.
 */
function statusOf(
  row: Doc<'contentTranslations'> | undefined,
  fingerprint: string,
): VersionStatus {
  if (!row) return 'missing';
  if (row.status === 'ready') {
    return row.sourceHash === fingerprint && row.fields ? 'ready' : 'missing';
  }
  return row.status;
}

/**
 * What a reader can read of a piece of content, and in which languages.
 *
 * - `versions`: every site language, with its state (`original` for the
 *   language it was written in). Feeds the "read in" links.
 * - `translation`: the text in `locale`, when an up-to-date translation
 *   exists; `null` otherwise, including when `locale` IS the original.
 *
 * `null` when the content is not published, or is members-only and the
 * reader is not a member.
 */
export const getReading = query({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    locale,
  },
  returns: v.union(
    v.null(),
    v.object({
      sourceLocale: locale,
      versions: v.array(v.object({ locale, status: versionStatus })),
      translation: v.union(
        v.null(),
        v.object({
          fields: translatableFields,
          model: v.optional(v.string()),
          updatedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return null;
    if (source.membersOnly && !(await viewerIsMember(ctx))) return null;

    const fingerprint = sourceFingerprint(source.fields);
    const rows = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source', (q) =>
        q.eq('sourceType', args.sourceType).eq('sourceId', args.sourceId),
      )
      // Five languages at most, minus the source language: the bound is
      // structural, not arbitrary.
      .take(8);
    const byLocale = new Map(rows.map((r) => [r.targetLocale, r]));

    const versions = SITE_LOCALES.map((l) => ({
      locale: l,
      status:
        l === source.sourceLocale
          ? ('original' as const)
          : statusOf(byLocale.get(l), fingerprint),
    }));

    const row = byLocale.get(args.locale);
    const translation =
      args.locale !== source.sourceLocale &&
      row?.fields &&
      statusOf(row, fingerprint) === 'ready'
        ? { fields: row.fields, model: row.model, updatedAt: row.updatedAt }
        : null;

    return { sourceLocale: source.sourceLocale, versions, translation };
  },
});
