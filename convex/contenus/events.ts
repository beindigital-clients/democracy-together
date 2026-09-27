import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { getCurrentUser } from '../lib/rbac';
import { AUDIT } from '../lib/auditActions';
import { locale as localeValidator, type SiteLocale } from '../lib/locales';
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
import {
  isValidDate,
  isValidTime,
  isValidTimeZone,
  scheduleInstants,
} from '../lib/contenus/time';
import { findEventBySlug, isEventFull } from '../lib/contenus/events';
import {
  eventFormat,
  eventRegion,
  eventStatus,
  eventType,
} from '../lib/tables/contenus';
import { NETWORK_THEMES } from '../lib/themes';

// AGENDA (F-52) ET WEBINAIRES (F-54) — lecture publique et édition.
//
// Deux familles de fonctions, deux règles :
//  - PUBLIQUES (`listPublic`, `getPublic`, `myVisioAccess`) : ne lisent que
//    les statuts `published` et `cancelled`, par index. Un brouillon n'en sort
//    jamais, ni le lien de visioconférence (seul `myVisioAccess` le rend, et à
//    un compte inscrit).
//  - ÉDITION (`adminList`, `adminGet`, `save`, `setStatus`, `remove`) : rang
//    éditeur, contrôlé ici ; chaque écriture laisse une entrée au journal.

// Plafond de lecture de l'agenda : un réseau publie quelques dizaines
// d'événements par an. La borne protège la requête publique, pas le produit.
const AGENDA_MAX = 500;
// Capacité maximale saisissable : au-delà, la vérification « complet » (qui
// relit au plus `capacity` inscriptions) cesserait d'être bon marché.
const CAPACITY_MAX = 5000;
const EVENT_THEMES: readonly string[] = ['vie-reseau', ...NETWORK_THEMES];

const publicEventValidator = v.object({
  slug: v.string(),
  type: eventType,
  region: eventRegion,
  format: eventFormat,
  theme: v.string(),
  langs: v.array(localeValidator),
  title: v.string(),
  summary: v.union(v.string(), v.null()),
  place: v.string(),
  cityKey: v.union(v.string(), v.null()),
  startDate: v.string(),
  startTime: v.union(v.string(), v.null()),
  endDate: v.union(v.string(), v.null()),
  endTime: v.union(v.string(), v.null()),
  timezone: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  status: v.union(v.literal('published'), v.literal('cancelled')),
  featured: v.boolean(),
  capacity: v.union(v.number(), v.null()),
  // Qu'une salle virtuelle existe se dit publiquement (« le lien est envoyé
  // aux inscrits ») ; son adresse, non.
  hasVisio: v.boolean(),
  durationMin: v.union(v.number(), v.null()),
  image: v.union(publicMediaValidator, v.null()),
});

async function toPublic(
  ctx: QueryCtx,
  e: Doc<'contentEvents'>,
  loc: SiteLocale,
) {
  return {
    slug: e.slug,
    type: e.type,
    region: e.region,
    format: e.format,
    theme: e.theme,
    langs: e.langs,
    title: pickText(e.title, loc),
    summary: pickText(e.summary, loc) || null,
    place: pickText(e.place, loc),
    cityKey: e.cityKey ?? null,
    startDate: e.startDate,
    startTime: e.startTime ?? null,
    endDate: e.endDate ?? null,
    endTime: e.endTime ?? null,
    timezone: e.timezone,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    status:
      e.status === 'cancelled'
        ? ('cancelled' as const)
        : ('published' as const),
    featured: e.featured ?? false,
    capacity: e.capacity ?? null,
    hasVisio: Boolean(e.visioUrl),
    durationMin: e.durationMin ?? null,
    image: await publicMedia(ctx, e.imageMediaId, loc),
  };
}

// --- Lecture publique ---------------------------------------------------------

/**
 * L'agenda public, dans la langue demandée : événements publiés et annulés
 * (l'annulation s'annonce, elle ne fait pas disparaître la date), par date.
 * Le tri passé / à venir se fait côté page, qui lit l'horloge (une requête
 * Convex ne doit pas le faire : elle ne serait pas réévaluée quand le temps
 * passe).
 */
export const listPublic = query({
  args: { locale: localeValidator },
  returns: v.array(publicEventValidator),
  handler: async (ctx, { locale }) => {
    const rows: Doc<'contentEvents'>[] = [];
    for (const status of ['published', 'cancelled'] as const) {
      rows.push(
        ...(await ctx.db
          .query('contentEvents')
          .withIndex('by_status_and_startsAt', (q) => q.eq('status', status))
          .take(AGENDA_MAX)),
      );
    }
    rows.sort((a, b) => a.startsAt - b.startsAt);
    return await Promise.all(rows.map((e) => toPublic(ctx, e, locale)));
  },
});

/** La fiche d'un événement, avec son éventuel replay et l'état « complet ». */
export const getPublic = query({
  args: { slug: v.string(), locale: localeValidator },
  returns: v.union(
    v.object({
      event: publicEventValidator,
      full: v.boolean(),
      replay: v.union(
        v.object({
          slug: v.string(),
          videoUrl: v.union(v.string(), v.null()),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { slug, locale }) => {
    if (slug.length > 100) return null;
    const e = await findEventBySlug(ctx, slug);
    if (!e || e.status === 'draft') return null;
    const replay = await ctx.db
      .query('contentReplays')
      .withIndex('by_eventId', (q) => q.eq('eventId', e._id))
      .filter((q) => q.eq(q.field('status'), 'published'))
      .first();
    return {
      event: await toPublic(ctx, e, locale),
      full: await isEventFull(ctx, e),
      replay: replay
        ? { slug: replay.slug, videoUrl: replay.videoUrl ?? null }
        : null,
    };
  },
});

/**
 * Le lien de visioconférence, RÉSERVÉ AUX INSCRITS (F-54).
 *
 * L'inscription se fait sans compte (F-53) ; la reconnaissance se fait donc
 * par l'ADRESSE : un compte connecté dont l'adresse figure parmi les inscrits
 * de l'événement voit le lien. Les adresses de compte sont vérifiées à la
 * création (code par e-mail) : se connecter sous une adresse, c'est prouver
 * qu'on la détient. Un inscrit sans compte reçoit le lien par courriel avant
 * l'événement (`eventReminders.sendDueReminders`).
 *
 * Aucune distinction publique n'est faite entre « pas inscrit », « pas de
 * salle » et « événement inconnu » : la réponse vaut `visioUrl: null`.
 */
export const myVisioAccess = query({
  args: { slug: v.string() },
  returns: v.object({
    registered: v.boolean(),
    visioUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { slug }) => {
    const none = { registered: false, visioUrl: null };
    const user = await getCurrentUser(ctx);
    const email = user?.email?.trim().toLowerCase();
    if (!email || slug.length > 100) return none;
    const e = await findEventBySlug(ctx, slug);
    if (!e || e.status !== 'published') return none;
    const reg = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) =>
        q.eq('eventSlug', slug).eq('email', email),
      )
      .unique();
    if (!reg) return none;
    return { registered: true, visioUrl: e.visioUrl ?? null };
  },
});

// --- Édition (rang éditeur) ------------------------------------------------------

const adminRowValidator = v.object({
  _id: v.id('contentEvents'),
  slug: v.string(),
  title: v.string(),
  type: eventType,
  status: eventStatus,
  startDate: v.string(),
  startsAt: v.number(),
  endsAt: v.number(),
  featured: v.boolean(),
  missing: v.array(localeValidator),
  updatedAt: v.number(),
});

export const adminList = query({
  args: { locale: localeValidator },
  returns: v.array(adminRowValidator),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentEvents').take(AGENDA_MAX);
    return rows
      .sort((a, b) => b.startsAt - a.startsAt)
      .map((e) => ({
        _id: e._id,
        slug: e.slug,
        title: pickText(e.title, locale) || e.slug,
        type: e.type,
        status: e.status,
        startDate: e.startDate,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        featured: e.featured ?? false,
        missing: missingLocales(e.title),
        updatedAt: e.updatedAt,
      }));
  },
});

const editableFields = {
  type: eventType,
  region: eventRegion,
  format: eventFormat,
  theme: v.string(),
  langs: v.array(localeValidator),
  title: localizedText,
  summary: localizedText,
  place: localizedText,
  startDate: v.string(),
  startTime: v.optional(v.string()),
  endDate: v.optional(v.string()),
  endTime: v.optional(v.string()),
  timezone: v.string(),
  visioUrl: v.optional(v.string()),
  capacity: v.optional(v.number()),
  featured: v.boolean(),
  imageMediaId: v.optional(v.id('contentMedia')),
  durationMin: v.optional(v.number()),
};

export const adminGet = query({
  args: { id: v.id('contentEvents') },
  returns: v.union(
    v.object({
      _id: v.id('contentEvents'),
      slug: v.string(),
      status: eventStatus,
      ...editableFields,
      imageUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    await requireEditor(ctx);
    const e = await ctx.db.get(id);
    if (!e) return null;
    const media = e.imageMediaId ? await ctx.db.get(e.imageMediaId) : null;
    return {
      _id: e._id,
      slug: e.slug,
      status: e.status,
      type: e.type,
      region: e.region,
      format: e.format,
      theme: e.theme,
      langs: e.langs,
      title: e.title,
      summary: e.summary ?? {},
      place: e.place,
      startDate: e.startDate,
      startTime: e.startTime,
      endDate: e.endDate,
      endTime: e.endTime,
      timezone: e.timezone,
      visioUrl: e.visioUrl,
      capacity: e.capacity,
      featured: e.featured ?? false,
      imageMediaId: e.imageMediaId,
      durationMin: e.durationMin,
      imageUrl: media ? await ctx.storage.getUrl(media.storageId) : null,
    };
  },
});

// Contrôle et normalisation d'une saisie d'événement. Chaque refus porte un
// code que l'écran traduit (`admin.feedbackErr_<CODE>`).
function normalizeEvent(input: {
  theme: string;
  langs: SiteLocale[];
  title: Doc<'contentEvents'>['title'];
  summary: Doc<'contentEvents'>['title'];
  place: Doc<'contentEvents'>['title'];
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone: string;
  visioUrl?: string;
  capacity?: number;
  durationMin?: number;
}) {
  const title = cleanText(input.title, CONTENT_MAX.title);
  if (!hasAnyLocale(title)) throw new Error('TITLE_REQUIRED');
  const place = cleanText(input.place, CONTENT_MAX.title);
  if (!hasAnyLocale(place)) throw new Error('PLACE_REQUIRED');
  const summary = cleanText(input.summary, CONTENT_MAX.body);
  if (!EVENT_THEMES.includes(input.theme)) throw new Error('INVALID_THEMES');
  const langs = [...new Set(input.langs)];
  if (langs.length === 0) throw new Error('INVALID_LANGUAGES');

  const startTime = input.startTime?.trim() || undefined;
  const endDate = input.endDate?.trim() || undefined;
  const endTime = input.endTime?.trim() || undefined;
  const timezone = input.timezone.trim();
  if (!isValidDate(input.startDate)) throw new Error('INVALID_DATE');
  if (endDate && !isValidDate(endDate)) throw new Error('INVALID_DATE');
  if (startTime && !isValidTime(startTime)) throw new Error('INVALID_DATE');
  if (endTime && !isValidTime(endTime)) throw new Error('INVALID_DATE');
  if (!isValidTimeZone(timezone)) throw new Error('INVALID_TIMEZONE');
  const schedule = {
    startDate: input.startDate,
    startTime,
    endDate,
    endTime,
    timezone,
  };
  const { startsAt, endsAt } = scheduleInstants(schedule);
  if (endsAt <= startsAt) throw new Error('INVALID_DATE');

  const visioUrl = input.visioUrl?.trim()
    ? requireHttpUrl(input.visioUrl)
    : undefined;
  if (
    input.capacity !== undefined &&
    (!Number.isInteger(input.capacity) ||
      input.capacity < 1 ||
      input.capacity > CAPACITY_MAX)
  ) {
    throw new Error('INVALID_CAPACITY');
  }
  if (
    input.durationMin !== undefined &&
    (!Number.isInteger(input.durationMin) ||
      input.durationMin < 1 ||
      input.durationMin > 24 * 60 * 7)
  ) {
    throw new Error('INVALID_DURATION');
  }
  return {
    ...schedule,
    title,
    place,
    summary,
    langs,
    theme: input.theme,
    startsAt,
    endsAt,
    visioUrl,
    capacity: input.capacity,
    durationMin: input.durationMin,
  };
}

/**
 * Création (sans `id`) ou modification d'un événement.
 *
 * Le SLUG ne se modifie pas : il est l'adresse publique de la fiche, et les
 * inscriptions et rappels y sont rattachés. Une création naît en BROUILLON —
 * publier est un geste distinct (`setStatus`), journalisé comme tel.
 */
export const save = mutation({
  args: {
    id: v.optional(v.id('contentEvents')),
    slug: v.optional(v.string()),
    ...editableFields,
  },
  returns: v.id('contentEvents'),
  handler: async (ctx, { id, slug, ...input }) => {
    const user = await requireEditor(ctx);
    const clean = normalizeEvent(input);
    if (input.imageMediaId && !(await ctx.db.get(input.imageMediaId)))
      throw new Error('NOT_FOUND');
    const fields = {
      type: input.type,
      region: input.region,
      format: input.format,
      featured: input.featured,
      imageMediaId: input.imageMediaId,
      ...clean,
      updatedAt: Date.now(),
      updatedBy: user._id,
    };

    if (id) {
      const current = await ctx.db.get(id);
      if (!current) throw new Error('NOT_FOUND');
      // `replace` et non `patch` : un champ vidé (heure de fin retirée, lien
      // visio supprimé) doit disparaître du document, pas garder sa valeur.
      await ctx.db.replace(id, {
        ...fields,
        slug: current.slug,
        status: current.status,
        cityKey: current.cityKey,
      });
      // Les rappels en attente suivent la nouvelle date : ils sont envoyés
      // d'après `eventDate`, qui n'est plus fourni par l'appelant.
      if (current.startsAt !== clean.startsAt) {
        const pending = await ctx.db
          .query('eventReminders')
          .withIndex('by_event_and_email', (q) =>
            q.eq('eventSlug', current.slug),
          )
          .take(1000);
        for (const r of pending) {
          if (!r.sent) await ctx.db.patch(r._id, { eventDate: clean.startsAt });
        }
      }
      await auditContent(ctx, user._id, AUDIT.CONTENT_UPDATED, 'event', id, {
        slug: current.slug,
      });
      return id;
    }

    const newSlug = (slug ?? '').trim();
    if (!isContentSlug(newSlug)) throw new Error('INVALID_SLUG');
    if (await findEventBySlug(ctx, newSlug)) throw new Error('SLUG_TAKEN');
    const newId = await ctx.db.insert('contentEvents', {
      ...fields,
      slug: newSlug,
      status: 'draft',
    });
    await auditContent(ctx, user._id, AUDIT.CONTENT_CREATED, 'event', newId, {
      slug: newSlug,
    });
    return newId;
  },
});

/**
 * Publier, dépublier (retour en brouillon) ou annuler un événement.
 *
 * Annuler n'est pas dépublier : l'événement reste à l'agenda, marqué
 * « annulé », et ses inscriptions sont fermées — les personnes inscrites
 * doivent pouvoir constater l'annulation sur la page qu'elles connaissent.
 */
export const setStatus = mutation({
  args: { id: v.id('contentEvents'), status: eventStatus },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    const user = await requireEditor(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new Error('NOT_FOUND');
    if (e.status === status) return null;
    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    const action =
      status === 'published'
        ? AUDIT.CONTENT_PUBLISHED
        : status === 'cancelled'
          ? AUDIT.CONTENT_CANCELLED
          : AUDIT.CONTENT_UNPUBLISHED;
    await auditContent(ctx, user._id, action, 'event', id, {
      slug: e.slug,
      from: e.status,
    });
    return null;
  },
});

/**
 * Supprimer un événement : seulement un BROUILLON sans inscrit. Un événement
 * qui a été public a des inscriptions, des rappels et des liens partagés —
 * on l'annule ou on le dépublie, on ne l'efface pas.
 */
export const remove = mutation({
  args: { id: v.id('contentEvents') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireEditor(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new Error('NOT_FOUND');
    if (e.status !== 'draft') throw new Error('INVALID_TRANSITION');
    const reg = await ctx.db
      .query('eventRegistrations')
      .withIndex('by_event_and_email', (q) => q.eq('eventSlug', e.slug))
      .first();
    if (reg) throw new Error('EVENT_HAS_REGISTRATIONS');
    const replays = await ctx.db
      .query('contentReplays')
      .withIndex('by_eventId', (q) => q.eq('eventId', id))
      .take(50);
    for (const r of replays) {
      await ctx.db.patch(r._id, { eventId: undefined, eventSlug: undefined });
    }
    await ctx.db.delete(id);
    await auditContent(ctx, user._id, AUDIT.CONTENT_DELETED, 'event', id, {
      slug: e.slug,
    });
    return null;
  },
});

// Options du sélecteur « événement lié » de l'éditeur de replays.
export const adminOptions = query({
  args: { locale: localeValidator },
  returns: v.array(
    v.object({
      _id: v.id('contentEvents'),
      slug: v.string(),
      title: v.string(),
      type: eventType,
      startDate: v.string(),
    }),
  ),
  handler: async (ctx, { locale }) => {
    await requireEditor(ctx);
    const rows = await ctx.db.query('contentEvents').take(AGENDA_MAX);
    return rows
      .sort((a, b) => b.startsAt - a.startsAt)
      .map((e) => ({
        _id: e._id,
        slug: e.slug,
        title: pickText(e.title, locale) || e.slug,
        type: e.type,
        startDate: e.startDate,
      }));
  },
});
