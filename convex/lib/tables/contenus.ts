import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import { localizedList, localizedText } from '../contenus/i18n';

// CONTENUS ÉDITORIAUX GÉRÉS DEPUIS LE BACK-OFFICE (F-52, F-54, F-62, F-64).
//
// Événements, replays, partenaires, presse et thématiques étaient CODÉS dans le
// dépôt : ajouter un webinaire demandait un développeur et un déploiement. Ils
// vivent désormais ici, édités au rang « éditeur » (`/admin/contenus`), et le
// contenu codé reste le REPLI des pages publiques tant qu'une table est vide
// ou que le backend ne répond pas (`src/lib/contenus/`).
//
// CONVENTIONS COMMUNES
//  - Les textes affichés sont TRADUISIBLES (`localizedText`, cinq clés
//    optionnelles) : une langue manquante retombe sur le français, et le
//    back-office la signale.
//  - Le statut `draft` n'est JAMAIS servi par une requête publique : les index
//    publics commencent par `status`, et les requêtes lisent la plage
//    `published` (et `cancelled` pour l'agenda, qui l'annonce).
//  - Les images viennent de la médiathèque (`contentMedia`) par identifiant ;
//    chaque table qui en référence porte un index sur ce champ, pour que la
//    suppression d'un média utilisé soit refusée en une lecture d'index.
//  - `updatedAt`/`updatedBy` : la trace courante ; l'historique complet est
//    dans le journal d'audit (une entrée par action).

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
  // Agenda (F-52) : sommet, webinaires, ateliers.
  contentEvents: defineTable({
    // Adresse publique `/evenements/<slug>` — stable, jamais modifiée après
    // création (un lien partagé ne casse pas).
    slug: v.string(),
    type: eventType,
    region: eventRegion,
    format: eventFormat,
    // Axe du réseau (`NETWORK_THEMES`) ou `vie-reseau`.
    theme: v.string(),
    langs: v.array(locale),
    title: localizedText,
    // Chapô de la fiche (optionnel : la fiche a un texte de repli).
    summary: v.optional(localizedText),
    // Lieu affiché (« Dakar », « En ligne »…), traduisible.
    place: localizedText,
    // Clé de lieu du catalogue codé, gardée pour la fidélité de la migration.
    cityKey: v.optional(v.string()),
    // Saisie telle qu'annoncée (jour, heure facultative, fuseau du lieu)…
    startDate: v.string(),
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
    timezone: v.string(),
    // …et les deux instants UTC qui en dérivent (cf. lib/contenus/time.ts),
    // recalculés à chaque enregistrement.
    startsAt: v.number(),
    endsAt: v.number(),
    // Lien de visioconférence : RÉSERVÉ AUX INSCRITS. Aucune requête publique
    // ne le renvoie ; seule `myVisioAccess` le rend, à un compte inscrit.
    visioUrl: v.optional(v.string()),
    // Nombre de places ; absent = sans limite.
    capacity: v.optional(v.number()),
    status: eventStatus,
    featured: v.optional(v.boolean()),
    imageMediaId: v.optional(v.id('contentMedia')),
    // Durée annoncée (minutes) — reprise du catalogue pour les rediffusions.
    durationMin: v.optional(v.number()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    // Agenda public : les publiés (et annulés) par date.
    .index('by_status_and_startsAt', ['status', 'startsAt'])
    .index('by_imageMediaId', ['imageMediaId']),

  // Replays (F-54) : lien vidéo YouTube / Vimeo / fichier, rattachés ou non à
  // un événement.
  contentReplays: defineTable({
    slug: v.string(),
    title: localizedText,
    description: v.optional(localizedText),
    eventId: v.optional(v.id('contentEvents')),
    // Slug de l'événement, dénormalisé : la carte publique pointe sa fiche
    // sans relire l'événement.
    eventSlug: v.optional(v.string()),
    eventType: v.optional(eventType),
    // Absent = « enregistrement bientôt disponible » (état honnête repris du
    // catalogue, qui n'avait aucune vidéo).
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

  // Partenaires (F-14) : logo depuis la médiathèque, lien, ordre.
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

  // Revue de presse (F-16) : article, média, date, langue, lien. Le titre est
  // celui de l'article, dans SA langue — il ne se traduit pas.
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

  // Thématiques (F-36) : slug stable (axe du réseau), titres et synthèses
  // traduits, ordre d'affichage.
  contentThemes: defineTable({
    slug: v.string(),
    title: localizedText,
    lead: localizedText,
    stance: v.optional(localizedList),
    questions: v.optional(localizedList),
    // Sous-dimension du baromètre (D1…D5).
    dimension: v.optional(v.string()),
    order: v.number(),
    status: publishStatus,
    updatedAt: v.number(),
    updatedBy: v.optional(v.id('users')),
  })
    .index('by_slug', ['slug'])
    .index('by_status_and_order', ['status', 'order']),

  // Médiathèque (F-64). Le fichier est dans le stockage Convex ; ce document
  // porte ce qu'on en a VÉRIFIÉ (nature réelle, taille, dimensions) et son
  // texte alternatif, obligatoire et traduisible.
  contentMedia: defineTable({
    storageId: v.id('_storage'),
    kind: mediaKind,
    contentType: v.string(),
    size: v.number(),
    filename: v.string(),
    alt: localizedText,
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    // Nom de fichier + textes alternatifs, concaténés pour la recherche.
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
