import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator } from '../lib/locales';
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
} from '../lib/contenus/i18n';
import { CONTENT_MAX, isContentSlug } from '../lib/contenus/validate';
import { publishStatus } from '../lib/tables/contenus';

// THÉMATIQUES (F-36) — slug STABLE, titres et synthèses traduits, ordre.
//
// Le slug d'une thématique est une clé de jointure autant qu'une adresse : les
// publications, la Tribune et les appels à projets sont rangés par axe
// (`NETWORK_THEMES`), et le baromètre y rattache ses sous-dimensions. Il n'est
// donc JAMAIS modifiable ; seuls les textes, l'ordre et la publication le sont.

const THEMES_MAX = 50;

const publicThemeValidator = v.object({
  slug: v.string(),
  title: v.string(),
  lead: v.string(),
  stance: v.array(v.string()),
  questions: v.array(v.string()),
  dimension: v.union(v.string(), v.null()),
});

function toPublic(
  t: Doc<'contentThemes'>,
  loc: Parameters<typeof pickText>[1],
) {
  return {
    slug: t.slug,
    title: pickText(t.title, loc),
    lead: pickText(t.lead, loc),
    stance: pickList(t.stance, loc),
    questions: pickList(t.questions, loc),
    dimension: t.dimension ?? null,
  };
}

export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(publicThemeValidator),
  handler: async (ctx, { locale }) => {
    const rows = await ctx.db
      .query('contentThemes')
      .withIndex('by_status_and_order', (q) => q.eq('status', 'published'))
      .take(THEMES_MAX);
    return rows.map((t) => toPublic(t, locale));
  },
});

export const getPublic = query({
  args: { slug: v.string(), locale: localeValidator },
  returns: v.union(publicThemeValidator, v.null()),
  handler: async (ctx, { slug, locale }) => {
    const t = await findBySlug(ctx, slug);
    return t && t.status === 'published' ? toPublic(t, locale) : null;
  },
});

async function findBySlug(ctx: QueryCtx, slug: string) {
  if (slug.length > 100) return null;
  return await ctx.db
    .query('contentThemes')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

const editableFields = {
  title: localizedText,
  lead: localizedText,
  stance: localizedList,
  questions: localizedList,
  dimension: v.optional(v.string()),
};

export const adminList = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      _id: v.id('contentThemes'),
      slug: v.string(),
      title: v.string(),
      status: publishStatus,
      order: v.number(),
      missing: v.array(localeValidator),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentThemes').take(THEMES_MAX);
    return rows
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        _id: t._id,
        slug: t.slug,
        title: pickText(t.title, locale) || t.slug,
        status: t.status,
        order: t.order,
        // Une langue « manque » dès que le titre OU la synthèse y manque.
        missing: [
          ...new Set([...missingLocales(t.title), ...missingLocales(t.lead)]),
        ],
        updatedAt: t.updatedAt,
      }));
  },
});

export const adminGet = query({
  args: { id: v.id('contentThemes') },
  returns: v.union(
    v.object({
      _id: v.id('contentThemes'),
      slug: v.string(),
      status: publishStatus,
      ...editableFields,
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await requireEditor(ctx);
    const t = await ctx.db.get(id);
    if (!t) return null;
    return {
      _id: t._id,
      slug: t.slug,
      status: t.status,
      title: t.title,
      lead: t.lead,
      stance: t.stance ?? {},
      questions: t.questions ?? {},
      dimension: t.dimension,
    };
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id('contentThemes')),
    slug: v.optional(v.string()),
    ...editableFields,
  },
  returns: v.id('contentThemes'),
  handler: async (ctx, { id, slug, ...input }) => {
    const user = await requireEditor(ctx);
    const title = cleanText(input.title, CONTENT_MAX.title);
    if (!hasAnyLocale(title)) throw new Error('TITLE_REQUIRED');
    const dimension = input.dimension?.trim() || undefined;
    if (dimension && dimension.length > 20) throw new Error('TEXT_TOO_LONG');
    const fields = {
      title,
      lead: cleanText(input.lead, CONTENT_MAX.body),
      stance: cleanList(input.stance, CONTENT_MAX.listItems, CONTENT_MAX.body),
      questions: cleanList(
        input.questions,
        CONTENT_MAX.listItems,
        CONTENT_MAX.short,
      ),
      dimension,
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
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'theme', id, {
        slug: current.slug,
      });
      return id;
    }
    const newSlug = (slug ?? '').trim();
    if (!isContentSlug(newSlug)) throw new Error('INVALID_SLUG');
    if (await findBySlug(ctx, newSlug)) throw new Error('SLUG_TAKEN');
    const all = await ctx.db.query('contentThemes').take(THEMES_MAX);
    const order = all.reduce((m, t) => Math.max(m, t.order), 0) + 1;
    const newId = await ctx.db.insert('contentThemes', {
      ...fields,
      slug: newSlug,
      status: 'draft',
      order,
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'theme', newId, {
      slug: newSlug,
    });
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id('contentThemes'), status: publishStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const user = await requireEditor(ctx);
    const t = await ctx.db.get(id);
    if (!t) throw new Error('NOT_FOUND');
    if (t.status === status) return null;
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
      'theme',
      id,
      { slug: t.slug },
    );
    return null;
  },
});

export const move = mutation({
  args: {
    id: v.id('contentThemes'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const user = await requireEditor(ctx);
    const all = (await ctx.db.query('contentThemes').take(THEMES_MAX)).sort(
      (a, b) => a.order - b.order,
    );
    const i = all.findIndex((t) => t._id === id);
    if (i < 0) throw new Error('NOT_FOUND');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return null;
    const a = all[i];
    const b = all[j];
    const orderA = a.order === b.order ? j : b.order;
    const orderB = a.order === b.order ? i : a.order;
    await ctx.db.patch(a._id, { order: orderA });
    await ctx.db.patch(b._id, { order: orderB });
    await auditContent(ctx, user._id, AUDIT.CONTENT_REORDERED, 'theme', id, {
      direction,
    });
    return null;
  },
});
