import { v } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator, SITE_LOCALES } from '../lib/locales';
import { enforceRateLimit, RATE_LIMITS } from '../lib/rateLimit';
import { auditContent, requireEditor } from '../lib/contenus/access';
import {
  cleanText,
  hasAnyLocale,
  localizedText,
  missingLocales,
  pickText,
  type LocalizedText,
} from '../lib/contenus/i18n';
import {
  cleanFilename,
  MEDIA_MAX_BYTES,
  sniffMedia,
} from '../lib/contenus/media';
import { mediaKind } from '../lib/tables/contenus';

// MEDIA LIBRARY (F-64) — images and PDFs reusable by other content.
//
// UPLOAD FLOW, in three steps:
//  1. `generateUploadUrl` (editor, rate-limited) returns an upload URL;
//  2. the browser sends the file to it, storage returns a `storageId`;
//  3. `finalizeUpload` (action) re-reads the ACTUAL file — size and first
//     bytes —, computes its dimensions, requires the alt text, then
//     records it. Any refused file is DELETED from storage: a failed
//     upload leaves no orphan.
//
// Alt text is MANDATORY (at least one language) and translatable:
// an image without an alternative is unreadable to a screen reader, and it is up to the
// media library to guarantee it once and for all rather than on each use.
//
// A media item IN USE (partner logo, event visual, replay
// thumbnail) cannot be deleted: the public page would display a broken image.
// Usage is read through the `by_*MediaId` indexes of the tables that reference it.

const ALT_MAX = 300;
const LIST_MAX = 100;
const SEARCH_MAX = 50;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireEditor(ctx);
    await enforceRateLimit(ctx, {
      key: `mediaUpload:${user._id}`,
      ...RATE_LIMITS.upload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

// Rank guard readable from an action (which has no `ctx.db`).
export const _editorId = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => (await requireEditor(ctx))._id,
});

export const _discard = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    // Never a file already recorded in the media library.
    const known = await ctx.db
      .query('contentMedia')
      .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
      .first();
    if (!known) await ctx.storage.delete(storageId);
    return null;
  },
});

function searchTextOf(filename: string, alt: LocalizedText): string {
  return [filename, ...SITE_LOCALES.map((l) => alt[l] ?? '')]
    .filter(Boolean)
    .join(' ');
}

export const _insert = internalMutation({
  args: {
    storageId: v.id('_storage'),
    kind: mediaKind,
    contentType: v.string(),
    size: v.number(),
    filename: v.string(),
    alt: localizedText,
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.id('contentMedia'),
  handler: async (ctx, args) => {
    // Rank re-checked HERE: this mutation writes, and the action calling it
    // might one day be called differently.
    const user = await requireEditor(ctx);
    const dup = await ctx.db
      .query('contentMedia')
      .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
      .first();
    if (dup) return dup._id;
    const id = await ctx.db.insert('contentMedia', {
      ...args,
      searchText: searchTextOf(args.filename, args.alt),
      uploadedBy: user._id,
      createdAt: Date.now(),
    });
    await auditContent(ctx, user._id, AUDIT.MEDIA_UPLOADED, 'media', id, {
      filename: args.filename,
      contentType: args.contentType,
      size: args.size,
    });
    return id;
  },
});

export const finalizeUpload = action({
  args: {
    storageId: v.id('_storage'),
    filename: v.string(),
    alt: localizedText,
  },
  returns: v.id('contentMedia'),
  handler: async (ctx, args): Promise<Id<'contentMedia'>> => {
    await ctx.runQuery(internal.contenus.media._editorId, {});
    const reject = async (code: string): Promise<never> => {
      await ctx.runMutation(internal.contenus.media._discard, {
        storageId: args.storageId,
      });
      throw new Error(code);
    };

    let alt: LocalizedText;
    try {
      alt = cleanText(args.alt, ALT_MAX);
    } catch {
      return await reject('TEXT_TOO_LONG');
    }
    if (!hasAnyLocale(alt)) return await reject('ALT_REQUIRED');

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error('NOT_FOUND');
    // The widest cap first: no point reading 200 MB only to
    // refuse them afterwards.
    if (blob.size > MEDIA_MAX_BYTES.pdf) return await reject('FILE_TOO_LARGE');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sniffed = sniffMedia(bytes);
    if (!sniffed) return await reject('INVALID_FILE');
    if (blob.size > MEDIA_MAX_BYTES[sniffed.kind])
      return await reject('FILE_TOO_LARGE');

    return await ctx.runMutation(internal.contenus.media._insert, {
      storageId: args.storageId,
      kind: sniffed.kind,
      contentType: sniffed.contentType,
      size: blob.size,
      filename: cleanFilename(args.filename),
      alt,
      width: sniffed.width,
      height: sniffed.height,
    });
  },
});

// --- Usage: who references this media item? --------------------------------------

const usageValidator = v.object({
  kind: v.union(v.literal('event'), v.literal('partner'), v.literal('replay')),
  slug: v.string(),
});

export async function mediaUsage(ctx: QueryCtx, id: Id<'contentMedia'>) {
  const out: { kind: 'event' | 'partner' | 'replay'; slug: string }[] = [];
  for (const e of await ctx.db
    .query('contentEvents')
    .withIndex('by_imageMediaId', (q) => q.eq('imageMediaId', id))
    .take(20))
    out.push({ kind: 'event', slug: e.slug });
  for (const p of await ctx.db
    .query('contentPartners')
    .withIndex('by_logoMediaId', (q) => q.eq('logoMediaId', id))
    .take(20))
    out.push({ kind: 'partner', slug: p.slug });
  for (const r of await ctx.db
    .query('contentReplays')
    .withIndex('by_posterMediaId', (q) => q.eq('posterMediaId', id))
    .take(20))
    out.push({ kind: 'replay', slug: r.slug });
  return out;
}

// --- List, search, selector ------------------------------------------------------

const mediaRowValidator = v.object({
  _id: v.id('contentMedia'),
  kind: mediaKind,
  contentType: v.string(),
  size: v.number(),
  filename: v.string(),
  alt: localizedText,
  // Alt text in the screen's language (with fallback).
  altText: v.string(),
  missing: v.array(localeValidator),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  url: v.union(v.string(), v.null()),
  usage: v.array(usageValidator),
  createdAt: v.number(),
});

async function toRow(
  ctx: QueryCtx,
  m: Doc<'contentMedia'>,
  locale: Parameters<typeof pickText>[1],
) {
  return {
    _id: m._id,
    kind: m.kind,
    contentType: m.contentType,
    size: m.size,
    filename: m.filename,
    alt: m.alt,
    altText: pickText(m.alt, locale),
    missing: missingLocales(m.alt),
    width: m.width ?? null,
    height: m.height ?? null,
    url: await ctx.storage.getUrl(m.storageId),
    usage: await mediaUsage(ctx, m._id),
    createdAt: m.createdAt,
  };
}

/**
 * The media library, most recent first, or the result of a SEARCH
 * (file name and alt texts, all languages). `kind` restricts to
 * one type — the logo selector only offers images.
 */
export const list = query({
  args: {
    locale: localeValidator,
    search: v.optional(v.string()),
    kind: v.optional(mediaKind),
  },
  returns: v.array(mediaRowValidator),
  handler: async (ctx, { locale, search, kind }) => {
    await requireEditor(ctx);
    const term = search?.trim().slice(0, 100);
    let rows: Doc<'contentMedia'>[];
    if (term) {
      rows = await ctx.db
        .query('contentMedia')
        .withSearchIndex('search_text', (q) => {
          const s = q.search('searchText', term);
          return kind ? s.eq('kind', kind) : s;
        })
        .take(SEARCH_MAX);
    } else if (kind) {
      rows = await ctx.db
        .query('contentMedia')
        .withIndex('by_kind', (q) => q.eq('kind', kind))
        .order('desc')
        .take(LIST_MAX);
    } else {
      rows = await ctx.db.query('contentMedia').order('desc').take(LIST_MAX);
    }
    return await Promise.all(rows.map((m) => toRow(ctx, m, locale)));
  },
});

export const get = query({
  args: { id: v.id('contentMedia'), locale: localeValidator },
  returns: v.union(mediaRowValidator, v.null()),
  handler: async (ctx, { id, locale }) => {
    await requireEditor(ctx);
    const m = await ctx.db.get(id);
    return m ? await toRow(ctx, m, locale) : null;
  },
});

export const updateAlt = mutation({
  args: { id: v.id('contentMedia'), alt: localizedText },
  returns: v.null(),
  handler: async (ctx, { id, alt }) => {
    const user = await requireEditor(ctx);
    const m = await ctx.db.get(id);
    if (!m) throw new Error('NOT_FOUND');
    const clean = cleanText(alt, ALT_MAX);
    // The requirement also applies on modification: what was required on upload
    // cannot be emptied afterwards.
    if (!hasAnyLocale(clean)) throw new Error('ALT_REQUIRED');
    await ctx.db.patch(id, {
      alt: clean,
      searchText: searchTextOf(m.filename, clean),
    });
    await auditContent(ctx, user._id, AUDIT.MEDIA_UPDATED, 'media', id);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('contentMedia') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const m = await ctx.db.get(id);
    if (!m) throw new Error('NOT_FOUND');
    const usage = await mediaUsage(ctx, id);
    if (usage.length > 0) throw new Error('MEDIA_IN_USE');
    await ctx.storage.delete(m.storageId);
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.MEDIA_DELETED, 'media', id, {
      filename: m.filename,
    });
    return null;
  },
});
