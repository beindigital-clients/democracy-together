import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator, type SiteLocale } from '../lib/locales';
import { auditContent, requireEditor } from '../lib/contenus/access';
import {
  cleanList,
  cleanText,
  hasAnyLocale,
  localizedList,
  localizedText,
  missingLocales,
  pickList,
  pickText,
  pickedLocale,
} from '../lib/contenus/i18n';
import { CONTENT_MAX, isContentSlug } from '../lib/contenus/validate';
import { isValidDate } from '../lib/contenus/time';
import { publishStatus } from '../lib/tables/contenus';
import {
  mergeNewsLocale,
  newsLocalesToTranslate,
  newsSource,
  sourceFingerprint,
  type TranslatableFields,
} from '../lib/translation';
import { enqueueTranslations } from '../translationJobs';

// NEWS (F-15) — the network's articles, written in the back office.
//
// One article = one document carrying its five languages, under ONE slug:
// switching the language of an article page keeps the reader on that
// article. The slug is a public address, so it is never modified after
// creation; the date, the texts and publication are.
//
// The body is a list of paragraphs, entered as text separated by blank lines
// — the same input as a theme's positions. No markup: what an editor types
// is what the page shows, with nothing to sanitize on the way out.

const NEWS_MAX = 200;
// The five languages of an article share Convex's 1 MB per document: the
// body is bounded per language as a whole, not only per paragraph.
const BODY_PARAGRAPHS_MAX = 40;
const BODY_TOTAL_MAX = 20_000;

const publicNewsValidator = v.object({
  slug: v.string(),
  title: v.string(),
  excerpt: v.string(),
  publishedOn: v.string(),
  // Language actually served (the requested one, or its fallback), for the
  // page's `lang` attribute.
  lang: localeValidator,
  // Set when part of the text is a MACHINE translation from this language:
  // the page says so, as it does for publications.
  machineFrom: v.optional(localeValidator),
});

const publicArticleValidator = publicNewsValidator.extend({
  body: v.array(v.string()),
});

// MACHINE TRANSLATIONS FILL THE GAPS, NEVER MORE. Languages the editors
// left empty are translated when the article is published
// (convex/translationJobs.ts); a reader in such a language gets that
// translation instead of the French fallback. A field written by hand
// always wins, and a translation of an older text is ignored.
async function machineTranslation(
  ctx: QueryCtx,
  n: Doc<'contentNews'>,
  loc: SiteLocale,
): Promise<{ fields: TranslatableFields; from: SiteLocale } | null> {
  const source = newsSource(n);
  if (!source || !newsLocalesToTranslate(n, source.sourceLocale).includes(loc))
    return null;
  const row = await ctx.db
    .query('contentTranslations')
    .withIndex('by_source_and_target', (q) =>
      q.eq('sourceType', 'news').eq('sourceId', n._id).eq('targetLocale', loc),
    )
    .unique();
  if (
    !row ||
    row.status !== 'ready' ||
    !row.fields ||
    row.sourceHash !== sourceFingerprint(source.fields)
  )
    return null;
  return { fields: row.fields, from: source.sourceLocale };
}

async function toPublicArticle(
  ctx: QueryCtx,
  n: Doc<'contentNews'>,
  loc: SiteLocale,
) {
  const machine = await machineTranslation(ctx, n, loc);
  const merged = mergeNewsLocale(n, loc, machine?.fields ?? null, {
    title: pickText(n.title, loc),
    excerpt: pickText(n.excerpt, loc),
    body: pickList(n.body, loc),
    lang: pickedLocale(n.title, loc),
  });
  return {
    slug: n.slug,
    title: merged.title,
    excerpt: merged.excerpt,
    publishedOn: n.publishedOn,
    lang: merged.lang,
    ...(merged.machine && machine ? { machineFrom: machine.from } : {}),
    body: merged.body,
  };
}

// A list card: the article without its body (the list validator refuses
// extra fields).
async function toPublic(ctx: QueryCtx, n: Doc<'contentNews'>, loc: SiteLocale) {
  const a = await toPublicArticle(ctx, n, loc);
  return {
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    publishedOn: a.publishedOn,
    lang: a.lang,
    ...(a.machineFrom ? { machineFrom: a.machineFrom } : {}),
  };
}

export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(publicNewsValidator),
  handler: async (ctx, { locale }) => {
    const rows = await ctx.db
      .query('contentNews')
      .withIndex('by_status_and_publishedOn', (q) =>
        q.eq('status', 'published'),
      )
      .order('desc')
      .take(NEWS_MAX);
    return await Promise.all(rows.map((n) => toPublic(ctx, n, locale)));
  },
});

// `anyPublished` lets the page tell "this article does not exist" (the table
// is authoritative as soon as it holds one published article) from "the
// table is still empty" (the coded articles answer) in ONE read.
export const getPublic = query({
  args: { slug: v.string(), locale: localeValidator },
  returns: v.object({
    article: v.union(publicArticleValidator, v.null()),
    anyPublished: v.boolean(),
  }),
  handler: async (ctx, { slug, locale }) => {
    const n = await findBySlug(ctx, slug);
    if (n && n.status === 'published') {
      return {
        article: await toPublicArticle(ctx, n, locale),
        anyPublished: true,
      };
    }
    const first = await ctx.db
      .query('contentNews')
      .withIndex('by_status_and_publishedOn', (q) =>
        q.eq('status', 'published'),
      )
      .first();
    return { article: null, anyPublished: first !== null };
  },
});

async function findBySlug(ctx: QueryCtx, slug: string) {
  if (slug.length > 100) return null;
  return await ctx.db
    .query('contentNews')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

const editableFields = {
  title: localizedText,
  excerpt: localizedText,
  body: localizedList,
  publishedOn: v.string(),
};

export const adminList = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      _id: v.id('contentNews'),
      slug: v.string(),
      title: v.string(),
      publishedOn: v.string(),
      status: publishStatus,
      missing: v.array(localeValidator),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentNews').take(NEWS_MAX);
    return rows
      .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
      .map((n) => ({
        _id: n._id,
        slug: n.slug,
        title: pickText(n.title, locale) || n.slug,
        publishedOn: n.publishedOn,
        status: n.status,
        // A language is "missing" as soon as the title OR the body is.
        missing: [
          ...new Set([...missingLocales(n.title), ...missingLocales(n.body)]),
        ],
        updatedAt: n.updatedAt,
      }));
  },
});

export const adminGet = query({
  args: { id: v.id('contentNews') },
  returns: v.union(
    v.object({
      _id: v.id('contentNews'),
      slug: v.string(),
      status: publishStatus,
      ...editableFields,
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await requireEditor(ctx);
    const n = await ctx.db.get(id);
    if (!n) return null;
    return {
      _id: n._id,
      slug: n.slug,
      status: n.status,
      title: n.title,
      excerpt: n.excerpt ?? {},
      body: n.body ?? {},
      publishedOn: n.publishedOn,
    };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id('contentNews')),
    slug: v.optional(v.string()),
    ...editableFields,
  },
  returns: v.id('contentNews'),
  handler: async (ctx, { id, slug, ...input }) => {
    const user = await requireEditor(ctx);
    const title = cleanText(input.title, CONTENT_MAX.title);
    if (!hasAnyLocale(title)) throw new Error('TITLE_REQUIRED');
    if (!isValidDate(input.publishedOn)) throw new Error('INVALID_DATE');
    const body = cleanList(input.body, BODY_PARAGRAPHS_MAX, CONTENT_MAX.body);
    for (const paragraphs of Object.values(body)) {
      const total = paragraphs.reduce((n, p) => n + p.length, 0);
      if (total > BODY_TOTAL_MAX) throw new Error('TEXT_TOO_LONG');
    }
    const fields = {
      title,
      excerpt: cleanText(input.excerpt, CONTENT_MAX.short),
      body,
      publishedOn: input.publishedOn,
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    if (id) {
      const current = await ctx.db.get(id);
      if (!current) throw new Error('NOT_FOUND');
      await ctx.db.replace(id, {
        ...fields,
        slug: current.slug,
        status: current.status,
      });
      // An edit to a published article is public at once: so must be the
      // translations of the languages left empty.
      if (current.status === 'published')
        await enqueueTranslations(ctx, 'news', id);
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'news', id, {
        slug: current.slug,
      });
      return id;
    }
    const newSlug = (slug ?? '').trim();
    if (!isContentSlug(newSlug)) throw new Error('INVALID_SLUG');
    if (await findBySlug(ctx, newSlug)) throw new Error('SLUG_TAKEN');
    const newId = await ctx.db.insert('contentNews', {
      ...fields,
      slug: newSlug,
      status: 'draft',
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'news', newId, {
      slug: newSlug,
    });
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id('contentNews'), status: publishStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const user = await requireEditor(ctx);
    const n = await ctx.db.get(id);
    if (!n) throw new Error('NOT_FOUND');
    if (n.status === status) return null;
    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    if (status === 'published') await enqueueTranslations(ctx, 'news', id);
    await auditContent(
      ctx,
      user._id,
      status === 'published'
        ? AUDIT.CONTENT_PUBLISHED
        : AUDIT.CONTENT_UNPUBLISHED,
      'news',
      id,
      { slug: n.slug },
    );
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('contentNews') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const n = await ctx.db.get(id);
    if (!n) throw new Error('NOT_FOUND');
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.CONTENT_DELETED, 'news', id, {
      slug: n.slug,
    });
    return null;
  },
});
