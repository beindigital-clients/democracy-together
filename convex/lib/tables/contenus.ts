import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import { localizedList, localizedText } from '../contenus/i18n';

// EDITORIAL CONTENT MANAGED FROM THE BACK OFFICE (F-52, F-54, F-62, F-64).
//
// Events, replays, partners, press and themes used to be HARD-CODED in the
// repo: adding a webinar required a developer and a deployment. They now live
// here, edited at the "editor" level (`/admin/contenus`), and the hard-coded
// content remains the FALLBACK for public pages as long as a table is empty
// or the backend does not respond (`src/lib/contenus/`).
//
// SHARED CONVENTIONS
//  - Displayed texts are TRANSLATABLE (`localizedText`, five optional keys):
//    a missing language falls back to French, and the back office flags it.
//  - The `draft` status is NEVER served by a public query: public indexes
//    start with `status`, and queries read the `published` range (and
//    `cancelled` for the events calendar, which announces it).
//  - Images come from the media library (`contentMedia`) by identifier; each
//    table that references them carries an index on that field, so that
//    deleting a media item in use is refused with a single index read.
//  - `updatedAt`/`updatedBy`: the current trace; the full history is in the
//    audit log (one entry per action).

export const eventType = v.union(
  v.literal('sommet'),
  v.literal('webinaire'),
  v.literal('atelier'),
);
export const eventRegion = v.union(
  v.literal('afrique'),
  v.literal('europe'),
  v.literal('en-ligne'),
);
export const eventFormat = v.union(
  v.literal('presentiel'),
  v.literal('en-ligne'),
  v.literal('hybride'),
);
export const eventStatus = v.union(
  v.literal('draft'),
  v.literal('published'),
  v.literal('cancelled'),
);
export const publishStatus = v.union(
  v.literal('draft'),
  v.literal('published'),
);
export const videoKind = v.union(
  v.literal('youtube'),
  v.literal('vimeo'),
  v.literal('file'),
);
export const mediaKind = v.union(v.literal('image'), v.literal('pdf'));

export const contenusTables = {
  // Events (F-52): summit, webinars, workshops.
  contentEvents: defineTable({
    // Public address `/evenements/<slug>` — stable, never changed after creation
    // (a shared link does not break).
    slug: v.string(),
    type: eventType,
    region: eventRegion,
    format: eventFormat,
    // Network axis (`NETWORK_THEMES`) or `vie-reseau`.
    theme: v.string(),
    langs: v.array(locale),
    title: localizedText,
    // Profile standfirst (optional: the page has a fallback text).
    summary: v.optional(localizedText),
    // Displayed venue ("Dakar", "En ligne"…), translatable.
    place: localizedText,
    // Venue key from the hard-coded catalogue, kept for migration fidelity.
    cityKey: v.optional(v.string()),
    // Input as announced (day, optional time, venue timezone)…
    startDate: v.string(),
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
    timezone: v.string(),
    // …and the two UTC instants derived from it (see lib/contenus/time.ts),
    // recomputed on every save.
    startsAt: v.number(),
    endsAt: v.number(),
    // Video-conference link: RESERVED FOR REGISTRANTS. No public query returns
    // it; only `myVisioAccess` returns it, to a registered account.
    visioUrl: v.optional(v.string()),
    // Number of seats; absent = unlimited.
    capacity: v.optional(v.number()),
    status: eventStatus,
    featured: v.optional(v.boolean()),
    imageMediaId: v.optional(v.id('contentMedia')),
    // Announced duration (minutes) — taken from the catalogue for replays.
    durationMin: v.optional(v.number()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    // Public agenda: published (and cancelled) events by date.
    .index('by_status_and_startsAt', ['status', 'startsAt'])
    .index('by_imageMediaId', ['imageMediaId']),

  // Replays (F-54): YouTube / Vimeo / file video link, attached or not to an
  // event.
  contentReplays: defineTable({
    slug: v.string(),
    title: localizedText,
    description: v.optional(localizedText),
    eventId: v.optional(v.id('contentEvents')),
    // Event slug, denormalised: the public card points to its page without
    // re-reading the event.
    eventSlug: v.optional(v.string()),
    eventType: v.optional(eventType),
    // Absent = "recording available soon" (honest state carried over from the
    // catalogue, which had no video).
    videoKind: v.optional(videoKind),
    videoUrl: v.optional(v.string()),
    themes: v.array(v.string()),
    langs: v.array(locale),
    recordedOn: v.string(),
    durationMin: v.optional(v.number()),
    posterMediaId: v.optional(v.id('contentMedia')),
    status: publishStatus,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    .index('by_status_and_recordedOn', ['status', 'recordedOn'])
    .index('by_eventId', ['eventId'])
    .index('by_posterMediaId', ['posterMediaId']),

  // Partners (F-14): logo from the media library, link, order.
  contentPartners: defineTable({
    slug: v.string(),
    name: localizedText,
    kicker: v.optional(localizedText),
    summary: v.optional(localizedText),
    gives: v.optional(localizedText),
    gets: v.optional(localizedText),
    logoMediaId: v.optional(v.id('contentMedia')),
    url: v.optional(v.string()),
    order: v.number(),
    status: publishStatus,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    .index('by_status_and_order', ['status', 'order'])
    .index('by_logoMediaId', ['logoMediaId']),

  // Press review (F-16): article, outlet, date, language, link. The title is
  // the article's, in ITS language — it is not translated.
  contentPress: defineTable({
    title: v.string(),
    outlet: v.string(),
    publishedOn: v.string(),
    lang: locale,
    url: v.string(),
    excerpt: v.optional(localizedText),
    status: publishStatus,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  }).index('by_status_and_publishedOn', ['status', 'publishedOn']),

  // Themes (F-36): stable slug (network axis), translated titles and
  // summaries, display order.
  contentThemes: defineTable({
    slug: v.string(),
    title: localizedText,
    lead: localizedText,
    stance: v.optional(localizedList),
    questions: v.optional(localizedList),
    // Barometer sub-dimension (D1…D5).
    dimension: v.optional(v.string()),
    order: v.number(),
    status: publishStatus,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    .index('by_status_and_order', ['status', 'order']),

  // Media library (F-64). The file is in Convex storage; this document carries
  // what we VERIFIED about it (actual type, size, dimensions) and its
  // alternative text, mandatory and translatable.
  contentMedia: defineTable({
    storageId: v.id('_storage'),
    kind: mediaKind,
    contentType: v.string(),
    size: v.number(),
    filename: v.string(),
    alt: localizedText,
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // File name + alternative texts, concatenated for search.
    searchText: v.string(),
    uploadedBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_kind', ['kind'])
    .index('by_storageId', ['storageId'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['kind'],
    }),
};
