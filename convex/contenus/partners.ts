import { v } from 'convex/values';
import { mutation, query, type QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator } from '../lib/locales';
import {
  auditContent,
  publicMedia,
  publicMediaValidator,
  requireEditor,
} from '../lib/contenus/access';
import {
  cleanText,
  hasAnyLocale,
  localizedText,
  missingLocales,
  pickText,
} from '../lib/contenus/i18n';
import {
  CONTENT_MAX,
  isContentSlug,
  requireHttpUrl,
} from '../lib/contenus/validate';
import { publishStatus } from '../lib/tables/contenus';

// PARTNERS (F-14) — logo taken from the media library, link, display order.
//
// The hard-coded catalog described partnership CATEGORIES (what each
// type of partner brings and receives), without naming any organization or
// inventing a logo. The table carries over these five categories as-is
// (migration) and also accommodates named partners: a record carries a
// name, and can carry a logo, a link and the four category texts.

const PARTNERS_MAX = 200;

const publicPartnerValidator = v.object({
  slug: v.string(),
  name: v.string(),
  kicker: v.union(v.string(), v.null()),
  summary: v.union(v.string(), v.null()),
  gives: v.union(v.string(), v.null()),
  gets: v.union(v.string(), v.null()),
  url: v.union(v.string(), v.null()),
  logo: v.union(publicMediaValidator, v.null()),
});

export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(publicPartnerValidator),
  handler: async (ctx, { locale }) => {
    const rows = await ctx.db
      .query('contentPartners')
      .withIndex('by_status_and_order', (q) => q.eq('status', 'published'))
      .take(PARTNERS_MAX);
    return await Promise.all(
      rows.map(async (p) => ({
        slug: p.slug,
        name: pickText(p.name, locale),
        kicker: pickText(p.kicker, locale) || null,
        summary: pickText(p.summary, locale) || null,
        gives: pickText(p.gives, locale) || null,
        gets: pickText(p.gets, locale) || null,
        url: p.url ?? null,
        logo: await publicMedia(ctx, p.logoMediaId, locale),
      })),
    );
  },
});

// --- Editing (editor rank) -------------------------------------------------------

const editableFields = {
  name: localizedText,
  kicker: localizedText,
  summary: localizedText,
  gives: localizedText,
  gets: localizedText,
  logoMediaId: v.optional(v.id('contentMedia')),
  url: v.optional(v.string()),
};

export const adminList = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      _id: v.id('contentPartners'),
      slug: v.string(),
      name: v.string(),
      status: publishStatus,
      order: v.number(),
      hasLogo: v.boolean(),
      missing: v.array(localeValidator),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentPartners').take(PARTNERS_MAX);
    return rows
      .sort((a, b) => a.order - b.order)
      .map((p) => ({
        _id: p._id,
        slug: p.slug,
        name: pickText(p.name, locale) || p.slug,
        status: p.status,
        order: p.order,
        hasLogo: Boolean(p.logoMediaId),
        missing: missingLocales(p.name),
        updatedAt: p.updatedAt,
      }));
  },
});

export const adminGet = query({
  args: { id: v.id('contentPartners') },
  returns: v.union(
    v.object({
      _id: v.id('contentPartners'),
      slug: v.string(),
      status: publishStatus,
      ...editableFields,
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await requireEditor(ctx);
    const p = await ctx.db.get(id);
    if (!p) return null;
    return {
      _id: p._id,
      slug: p.slug,
      status: p.status,
      name: p.name,
      kicker: p.kicker ?? {},
      summary: p.summary ?? {},
      gives: p.gives ?? {},
      gets: p.gets ?? {},
      logoMediaId: p.logoMediaId,
      url: p.url,
    };
  },
});

async function findBySlug(
  ctx: QueryCtx,
  slug: string,
): Promise<Doc<'contentPartners'> | null> {
  return await ctx.db
    .query('contentPartners')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

export const save = mutation({
  args: {
    id: v.optional(v.id('contentPartners')),
    slug: v.optional(v.string()),
    ...editableFields,
  },
  returns: v.id('contentPartners'),
  handler: async (ctx, { id, slug, ...input }) => {
    const user = await requireEditor(ctx);
    const name = cleanText(input.name, CONTENT_MAX.title);
    if (!hasAnyLocale(name)) throw new Error('TITLE_REQUIRED');
    if (input.logoMediaId) {
      const logo = await ctx.db.get(input.logoMediaId);
      // A logo is an IMAGE: a PDF from the media library cannot be displayed.
      if (!logo || logo.kind !== 'image') throw new Error('INVALID_MEDIA');
    }
    const fields = {
      name,
      kicker: cleanText(input.kicker, CONTENT_MAX.title),
      summary: cleanText(input.summary, CONTENT_MAX.body),
      gives: cleanText(input.gives, CONTENT_MAX.body),
      gets: cleanText(input.gets, CONTENT_MAX.body),
      logoMediaId: input.logoMediaId,
      url: input.url?.trim() ? requireHttpUrl(input.url) : undefined,
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
        order: current.order,
      });
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'partner', id, {
        slug: current.slug,
      });
      return id;
    }
    const newSlug = (slug ?? '').trim();
    if (!isContentSlug(newSlug)) throw new Error('INVALID_SLUG');
    if (await findBySlug(ctx, newSlug)) throw new Error('SLUG_TAKEN');
    // New record at the end of the list.
    const all = await ctx.db.query('contentPartners').take(PARTNERS_MAX);
    const order = all.reduce((m, p) => Math.max(m, p.order), 0) + 1;
    const newId = await ctx.db.insert('contentPartners', {
      ...fields,
      slug: newSlug,
      status: 'draft',
      order,
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'partner', newId, {
      slug: newSlug,
    });
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id('contentPartners'), status: publishStatus },
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
      'partner',
      id,
      { slug: p.slug },
    );
    return null;
  },
});

/**
 * Move a record up or down one rank. Swaps the two `order` values: two
 * writes, in the same transaction — the order cannot end up
 * duplicated halfway through.
 */
export const move = mutation({
  args: {
    id: v.id('contentPartners'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const user = await requireEditor(ctx);
    const all = (await ctx.db.query('contentPartners').take(PARTNERS_MAX)).sort(
      (a, b) => a.order - b.order,
    );
    const i = all.findIndex((p) => p._id === id);
    if (i < 0) throw new Error('NOT_FOUND');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return null;
    const a = all[i];
    const b = all[j];
    // Equal orders (old data): we renumber before swapping.
    const orderA = a.order === b.order ? j : b.order;
    const orderB = a.order === b.order ? i : a.order;
    await ctx.db.patch(a._id, { order: orderA });
    await ctx.db.patch(b._id, { order: orderB });
    await auditContent(ctx, user._id, AUDIT.CONTENT_REORDERED, 'partner', id, {
      direction,
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('contentPartners') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new Error('NOT_FOUND');
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.CONTENT_DELETED, 'partner', id, {
      slug: p.slug,
    });
    return null;
  },
});
