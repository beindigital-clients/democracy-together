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
  validateVideoUrl,
  videoEmbedUrl,
} from '../lib/contenus/validate';
import { isValidDate } from '../lib/contenus/time';
import { eventType, publishStatus, videoKind } from '../lib/tables/contenus';
import { NETWORK_THEMES } from '../lib/themes';

// REPLAYS (F-54) — rediffusions YouTube, Vimeo ou fichier vidéo.
//
// Un replay existe sans vidéo : c'est l'état honnête « enregistrement bientôt
// disponible » que le catalogue codé affichait pour chaque rediffusion. La
// vidéo s'ajoute ensuite, et son lien est validé CONTRE SA NATURE
// (`validateVideoUrl`) : la page publique n'intègre jamais une adresse
// arbitraire sous l'étiquette « YouTube ».

const REPLAYS_MAX = 500;
const REPLAY_THEMES: readonly string[] = ['vie-reseau', ...NETWORK_THEMES];

const publicReplayValidator = v.object({
  slug: v.string(),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  eventSlug: v.union(v.string(), v.null()),
  eventType: v.union(eventType, v.null()),
  videoKind: v.union(videoKind, v.null()),
  videoUrl: v.union(v.string(), v.null()),
  // Adresse d'intégration (lecteur YouTube « nocookie » ou Vimeo), calculée
  // côté serveur depuis un lien déjà validé.
  embedUrl: v.union(v.string(), v.null()),
  themes: v.array(v.string()),
  langs: v.array(localeValidator),
  recordedOn: v.string(),
  durationMin: v.union(v.number(), v.null()),
  poster: v.union(publicMediaValidator, v.null()),
});

export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(publicReplayValidator),
  handler: async (ctx, { locale }) => {
    const rows = await ctx.db
      .query('contentReplays')
      .withIndex('by_status_and_recordedOn', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(REPLAYS_MAX);
    return await Promise.all(
      rows.map(async (r) => ({
        slug: r.slug,
        title: pickText(r.title, locale),
        description: pickText(r.description, locale) || null,
        eventSlug: r.eventSlug ?? null,
        eventType: r.eventType ?? null,
        videoKind: r.videoKind ?? null,
        videoUrl: r.videoUrl ?? null,
        embedUrl:
          r.videoKind && r.videoUrl
            ? videoEmbedUrl(r.videoKind, r.videoUrl)
            : null,
        themes: r.themes,
        langs: r.langs,
        recordedOn: r.recordedOn,
        durationMin: r.durationMin ?? null,
        poster: await publicMedia(ctx, r.posterMediaId, locale),
      })),
    );
  },
});

// --- Édition (rang éditeur) ------------------------------------------------------

const editableFields = {
  title: localizedText,
  description: localizedText,
  eventId: v.optional(v.id('contentEvents')),
  eventType: v.optional(eventType),
  videoKind: v.optional(videoKind),
  videoUrl: v.optional(v.string()),
  themes: v.array(v.string()),
  langs: v.array(localeValidator),
  recordedOn: v.string(),
  durationMin: v.optional(v.number()),
  posterMediaId: v.optional(v.id('contentMedia')),
};

export const adminList = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      _id: v.id('contentReplays'),
      slug: v.string(),
      title: v.string(),
      status: publishStatus,
      recordedOn: v.string(),
      hasVideo: v.boolean(),
      missing: v.array(localeValidator),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentReplays').take(REPLAYS_MAX);
    return rows
      .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn))
      .map((r) => ({
        _id: r._id,
        slug: r.slug,
        title: pickText(r.title, locale) || r.slug,
        status: r.status,
        recordedOn: r.recordedOn,
        hasVideo: Boolean(r.videoUrl),
        missing: missingLocales(r.title),
        updatedAt: r.updatedAt,
      }));
  },
});

export const adminGet = query({
  args: { id: v.id('contentReplays') },
  returns: v.union(
    v.object({
      _id: v.id('contentReplays'),
      slug: v.string(),
      status: publishStatus,
      ...editableFields,
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await requireEditor(ctx);
    const r = await ctx.db.get(id);
    if (!r) return null;
    return {
      _id: r._id,
      slug: r.slug,
      status: r.status,
      title: r.title,
      description: r.description ?? {},
      eventId: r.eventId,
      eventType: r.eventType,
      videoKind: r.videoKind,
      videoUrl: r.videoUrl,
      themes: r.themes,
      langs: r.langs,
      recordedOn: r.recordedOn,
      durationMin: r.durationMin,
      posterMediaId: r.posterMediaId,
    };
  },
});

async function findBySlug(
  ctx: QueryCtx,
  slug: string,
): Promise<Doc<'contentReplays'> | null> {
  return await ctx.db
    .query('contentReplays')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

export const save = mutation({
  args: {
    id: v.optional(v.id('contentReplays')),
    slug: v.optional(v.string()),
    ...editableFields,
  },
  returns: v.id('contentReplays'),
  handler: async (ctx, { id, slug, ...input }) => {
    const user = await requireEditor(ctx);
    const title = cleanText(input.title, CONTENT_MAX.title);
    if (!hasAnyLocale(title)) throw new Error('TITLE_REQUIRED');
    const description = cleanText(input.description, CONTENT_MAX.body);
    if (!isValidDate(input.recordedOn)) throw new Error('INVALID_DATE');
    const themes = [...new Set(input.themes)];
    if (themes.length === 0 || themes.some((t) => !REPLAY_THEMES.includes(t)))
      throw new Error('INVALID_THEMES');
    const langs = [...new Set(input.langs)];
    if (langs.length === 0) throw new Error('INVALID_LANGUAGES');
    // Vidéo : la nature ET le lien, ou ni l'un ni l'autre.
    const rawUrl = input.videoUrl?.trim();
    let videoUrl: string | undefined;
    if (rawUrl) {
      if (!input.videoKind) throw new Error('INVALID_VIDEO_URL');
      videoUrl = validateVideoUrl(input.videoKind, rawUrl);
    }
    if (
      input.durationMin !== undefined &&
      (!Number.isInteger(input.durationMin) ||
        input.durationMin < 1 ||
        input.durationMin > 24 * 60)
    ) {
      throw new Error('INVALID_DURATION');
    }
    let eventSlug: string | undefined;
    let eventType = input.eventType;
    if (input.eventId) {
      const ev = await ctx.db.get(input.eventId);
      if (!ev) throw new Error('NOT_FOUND');
      eventSlug = ev.slug;
      eventType = eventType ?? ev.type;
    }
    if (input.posterMediaId && !(await ctx.db.get(input.posterMediaId)))
      throw new Error('NOT_FOUND');

    const fields = {
      title,
      description,
      eventId: input.eventId,
      eventSlug,
      eventType,
      videoKind: videoUrl ? input.videoKind : undefined,
      videoUrl,
      themes,
      langs,
      recordedOn: input.recordedOn,
      durationMin: input.durationMin,
      posterMediaId: input.posterMediaId,
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
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'replay', id, {
        slug: current.slug,
      });
      return id;
    }
    const newSlug = (slug ?? '').trim();
    if (!isContentSlug(newSlug)) throw new Error('INVALID_SLUG');
    if (await findBySlug(ctx, newSlug)) throw new Error('SLUG_TAKEN');
    const newId = await ctx.db.insert('contentReplays', {
      ...fields,
      slug: newSlug,
      status: 'draft',
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'replay', newId, {
      slug: newSlug,
    });
    return newId;
  },
});

export const setStatus = mutation({
  args: { id: v.id('contentReplays'), status: publishStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const user = await requireEditor(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error('NOT_FOUND');
    if (r.status === status) return null;
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
      'replay',
      id,
      { slug: r.slug },
    );
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('contentReplays') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new Error('NOT_FOUND');
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.CONTENT_DELETED, 'replay', id, {
      slug: r.slug,
    });
    return null;
  },
});
