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

// MÉDIATHÈQUE (F-64) — images et PDF réutilisables par les autres contenus.
//
// PARCOURS DE TÉLÉVERSEMENT, en trois temps :
//  1. `generateUploadUrl` (éditeur, débit limité) rend une URL de dépôt ;
//  2. le navigateur y envoie le fichier, le stockage rend un `storageId` ;
//  3. `finalizeUpload` (action) relit le fichier RÉEL — taille et premiers
//     octets —, calcule ses dimensions, exige le texte alternatif, puis
//     l'enregistre. Tout fichier refusé est SUPPRIMÉ du stockage : un dépôt
//     raté ne laisse pas d'orphelin.
//
// Le texte alternatif est OBLIGATOIRE (au moins une langue) et traduisible :
// une image sans alternative est illisible au lecteur d'écran, et c'est à la
// médiathèque de le garantir une fois pour toutes plutôt qu'à chaque usage.
//
// Un média UTILISÉ (logo de partenaire, visuel d'événement, vignette de
// replay) ne se supprime pas : la page publique afficherait une image cassée.
// L'usage se lit par les index `by_*MediaId` des tables qui le référencent.

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

// Garde de rang lisible depuis une action (qui n'a pas `ctx.db`).
export const _editorId = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: async (ctx) => (await requireEditor(ctx))._id,
});

export const _discard = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    // Jamais un fichier déjà enregistré dans la médiathèque.
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
    // Rang revérifié ICI : cette mutation écrit, et l'action qui l'appelle
    // pourrait un jour être appelée autrement.
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
    // Le plafond le plus large d'abord : inutile de lire 200 Mo pour les
    // refuser ensuite.
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

// --- Usage : qui référence ce média ? ------------------------------------------

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

// --- Liste, recherche, sélecteur -------------------------------------------------

const mediaRowValidator = v.object({
  _id: v.id('contentMedia'),
  kind: mediaKind,
  contentType: v.string(),
  size: v.number(),
  filename: v.string(),
  alt: localizedText,
  // Texte alternatif dans la langue de l'écran (avec repli).
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
 * La médiathèque, la plus récente d'abord, ou le résultat d'une RECHERCHE
 * (nom de fichier et textes alternatifs, toutes langues). `kind` restreint à
 * une nature — le sélecteur de logo ne propose que des images.
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
    // L'obligation vaut aussi à la modification : on ne vide pas après coup
    // ce qu'on a exigé au dépôt.
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
