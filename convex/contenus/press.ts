import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator } from '../lib/locales';
import { auditContent, requireEditor } from '../lib/contenus/access';
import { cleanText, localizedText, pickText } from '../lib/contenus/i18n';
import { CONTENT_MAX, requireHttpUrl } from '../lib/contenus/validate';
import { isValidDate } from '../lib/contenus/time';
import { publishStatus } from '../lib/tables/contenus';

// PRESS REVIEW (F-16) — "they talk about us": an article, the outlet that
// published it, its date, its language and its link.
//
// The /presse media kit (presentation, key facts, resources) remains
// hard-coded editorial content: it is not a list that grows. The press
// review, on the other hand, grows with each publication — hence the table. The hard-coded catalog
// contained none: the migration has nothing to carry over here, and the section
// only displays from the first published article.
//
// The TITLE is not translated: it is the article's, in the language of its
// publication (`lang`), which the page sets in the link's `lang` attribute.

const PRESS_MAX = 300;

export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      outlet: v.string(),
      publishedOn: v.string(),
      lang: localeValidator,
      url: v.string(),
      excerpt: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { locale }) => {
    const rows = await ctx.db
      .query('contentPress')
      .withIndex('by_status_and_publishedOn', (q) =>
        q.eq('status', 'published'),
      )
      .order('desc')
      .take(PRESS_MAX);
    return rows.map((p) => ({
      id: p._id,
      title: p.title,
      outlet: p.outlet,
      publishedOn: p.publishedOn,
      lang: p.lang,
      url: p.url,
      excerpt: pickText(p.excerpt, locale) || null,
    }));
  },
});

const editableFields = {
  title: v.string(),
  outlet: v.string(),
  publishedOn: v.string(),
  lang: localeValidator,
  url: v.string(),
  excerpt: localizedText,
};

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('contentPress'),
      status: publishStatus,
      ...editableFields,
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentPress').take(PRESS_MAX);
    return rows
      .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
      .map((p) => ({
        _id: p._id,
        status: p.status,
        title: p.title,
        outlet: p.outlet,
        publishedOn: p.publishedOn,
        lang: p.lang,
        url: p.url,
        excerpt: p.excerpt ?? {},
        updatedAt: p.updatedAt,
      }));
  },
});

export const save = mutation({
  args: { id: v.optional(v.id('contentPress')), ...editableFields },
  returns: v.id('contentPress'),
  handler: async (ctx, { id, ...input }) => {
    const user = await requireEditor(ctx);
    const title = input.title.trim();
    const outlet = input.outlet.trim();
    if (!title || title.length > CONTENT_MAX.title)
      throw new Error('TITLE_REQUIRED');
    if (!outlet || outlet.length > CONTENT_MAX.title)
      throw new Error('OUTLET_REQUIRED');
    if (!isValidDate(input.publishedOn)) throw new Error('INVALID_DATE');
    const fields = {
      title,
      outlet,
      publishedOn: input.publishedOn,
      lang: input.lang,
      url: requireHttpUrl(input.url),
      excerpt: cleanText(input.excerpt, CONTENT_MAX.short),
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    if (id) {
      const current = await ctx.db.get(id);
      if (!current) throw new Error('NOT_FOUND');
      await ctx.db.replace(id, { ...fields, status: current.status });
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'press', id);
      return id;
    }
    const newId = await ctx.db.insert('contentPress', {
      ...fields,
      status: 'draft',
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'press', newId);
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id('contentPress'), status: publishStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const user = await requireEditor(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new Error('NOT_FOUND');
    if (p.status === status) return null;
    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    await auditContent(
      ctx,
      user._id,
      status === 'published'
        ? AUDIT.CONTENT_PUBLISHED
        : AUDIT.CONTENT_UNPUBLISHED,
      'press',
      id,
    );
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('contentPress') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new Error('NOT_FOUND');
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.CONTENT_DELETED, 'press', id);
    return null;
  },
});
