import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';

// Tables du chantier « diffusion » : envoi en volume de la newsletter (F-65) et
// mesure d'audience first-party (F-66). Les modifications des tables
// EXISTANTES (abonnés, campagnes, champs de recherche) sont, elles, en place
// dans convex/schema.ts.

export const deliveryStatus = v.union(
  v.literal('queued'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('failed'),
  // Abonné parti (désinscrit, ou revenu en attente) entre la mise en file et
  // l'envoi : on ne lui écrit pas, et on le dit.
  v.literal('skipped'),
);

export const audienceDimension = v.union(
  v.literal('total'),
  v.literal('page'),
  v.literal('lang'),
  v.literal('referrer'),
  v.literal('screen'),
  // Nombre de clés distinctes déjà créées pour (jour, dimension) — sert à
  // borner la cardinalité (cf. convex/audience.ts).
  v.literal('meta'),
);

export const diffusionTables = {
  // UN STATUT PAR DESTINATAIRE ET PAR CAMPAGNE (F-65).
  //
  // Pas d'adresse ici : la ligne pointe l'abonnement, relu au moment de
  // l'envoi. Un abonné qui se désinscrit pendant que la campagne part n'est
  // donc plus servi (`skipped`), et la table ne duplique aucune donnée
  // personnelle.
  //
  // `claimId` identifie le LOT qui a pris la ligne en charge. Il sert de clé
  // d'idempotence auprès du fournisseur : un lot repris après une coupure est
  // renvoyé avec la MÊME clé, et le fournisseur rend la réponse d'origine au
  // lieu d'envoyer une seconde fois.
  newsletterDeliveries: defineTable({
    campaignId: v.id('newsletterCampaigns'),
    subscriptionId: v.id('newsletterSubscriptions'),
    status: deliveryStatus,
    claimId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    attempts: v.number(),
    locale: v.optional(locale),
    sentAt: v.optional(v.number()),
    providerId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index('by_campaign_and_status', ['campaignId', 'status'])
    .index('by_campaign_and_subscription', ['campaignId', 'subscriptionId'])
    .index('by_claim', ['claimId']),

  // ÉVÉNEMENTS BRUTS D'AUDIENCE — TAMPON DE QUELQUES MINUTES (F-66).
  //
  // Une page vue = une insertion, sans aucune lecture préalable : rien ne
  // contend, même en pic de sommet. Une tâche planifiée les agrège par jour
  // toutes les cinq minutes puis les SUPPRIME : aucun événement brut ne vit
  // plus longtemps que l'intervalle d'agrégation (plus une marge de reprise).
  // Aucun identifiant, aucune IP, aucun agent utilisateur : rien ne permet de
  // relier deux lignes à une même personne.
  audienceEvents: defineTable({
    day: v.string(),
    path: v.string(),
    lang: v.optional(v.string()),
    referrer: v.optional(v.string()),
    screen: v.optional(v.string()),
    at: v.number(),
  }),

  // COMPTEURS AGRÉGÉS PAR JOUR — la seule donnée d'audience conservée.
  // Une ligne par (dimension, jour, clé). Rétention bornée
  // (`AUDIENCE_RETENTION_DAYS`, 395 jours par défaut, soit 13 mois).
  audienceDaily: defineTable({
    dimension: audienceDimension,
    day: v.string(),
    key: v.string(),
    count: v.number(),
  })
    .index('by_dimension_and_day_and_key', ['dimension', 'day', 'key'])
    .index('by_day', ['day']),

  // Anti-abus du point d'entrée public — fenêtres d'une minute, purgées toutes
  // les cinq minutes. La clé d'un visiteur est une EMPREINTE salée de son bloc
  // d'adresses, jamais l'adresse : le sel change chaque jour et l'ancien est
  // détruit, ce qui rend l'empreinte inutilisable au-delà de la journée.
  audienceThrottle: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_windowStart', ['windowStart']),

  // Sel du jour de l'empreinte anti-abus. Singleton (une ligne) : remplacé, et
  // donc détruit, à chaque changement de jour.
  audienceSalt: defineTable({
    day: v.string(),
    salt: v.string(),
  }),

  // DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) — boîte d'envoi simulée : le lien
  // de confirmation newsletter y est lisible par la spec E2E, comme
  // `devOtpCodes` pour les codes de connexion. Jamais alimentée quand
  // AUTH_DEV_OTP n'est pas 'true' ; purgée après 24 h.
  devOutbox: defineTable({
    to: v.string(),
    kind: v.string(),
    subject: v.string(),
    link: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_to', ['to'])
    .index('by_createdAt', ['createdAt']),
};
