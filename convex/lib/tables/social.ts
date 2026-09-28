import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  linkKindValidator,
  messagePolicyValidator,
  profileVisibilityValidator,
} from '../social';

// Tables du chantier « social » (profils de personnes, suivi, messagerie
// privée). Aucune n'étend `users` : le cycle de vie des comptes appartient à
// un autre chantier, et tout ce qui est propre au réseau social vit ici, à
// côté de sa fonction de suppression (`convex/social/account.ts`).
export const socialTables = {
  // Profil de personne — UN par compte (`by_userId`), créé à la première
  // sauvegarde. Le handle est l'identifiant public (`/membres/<handle>`).
  memberProfiles: defineTable({
    userId: v.id('users'),
    handle: v.string(),
    displayName: v.string(),
    photoId: v.optional(v.id('_storage')),
    bio: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    // Pays (ISO 3166-1 alpha-2, majuscules) : filtre de l'annuaire.
    country: v.optional(v.string()),
    themes: v.array(v.string()),
    languages: v.array(v.string()),
    links: v.array(v.object({ kind: linkKindValidator, url: v.string() })),
    visibility: profileVisibilityValidator,
    messagePolicy: messagePolicyValidator,
    // Types de notification coupés (vocabulaire NOTIFICATION_PREF_TYPES).
    mutedNotificationTypes: v.array(v.string()),
    // Courriel « nouveau message de X » (sans le contenu). Opt-in.
    messageEmail: v.boolean(),
    // Dénormalisations tenues À L'ÉCRITURE : `listed` = visible dans
    // l'annuaire (visibilité ≠ privé) — sert de filtre DANS l'index de
    // recherche, pour qu'un profil privé ne soit même pas lu ; `searchText`
    // et `nameKey` servent la recherche et le tri.
    listed: v.boolean(),
    searchText: v.string(),
    nameKey: v.string(),
    followerCount: v.number(),
    followingCount: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_handle', ['handle'])
    // Une photo n'appartient qu'à UN profil : sans ce contrôle, rattacher
    // l'identifiant de stockage d'autrui ferait effacer SA photo le jour où
    // l'on changerait la sienne.
    .index('by_photoId', ['photoId'])
    .index('by_listed_and_nameKey', ['listed', 'nameKey'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['listed', 'country'],
    }),

  // Suivi de personne à personne (unilatéral).
  follows: defineTable({
    followerId: v.id('users'),
    followeeId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_follower_and_followee', ['followerId', 'followeeId'])
    .index('by_followee', ['followeeId']),

  // Suivi d'une organisation de l'annuaire.
  orgFollows: defineTable({
    userId: v.id('users'),
    orgId: v.id('organizations'),
    createdAt: v.number(),
  })
    .index('by_user_and_org', ['userId', 'orgId'])
    .index('by_org', ['orgId']),

  // Blocage : `blockerId` a bloqué `blockedId`. L'effet est symétrique pour
  // la messagerie et le suivi (voir `isBlockedEitherWay`).
  blocks: defineTable({
    blockerId: v.id('users'),
    blockedId: v.id('users'),
    createdAt: v.number(),
  })
    .index('by_blocker_and_blocked', ['blockerId', 'blockedId'])
    .index('by_blocked', ['blockedId']),

  // Conversation 1:1. La paire est RANGÉE (`userA` < `userB` en chaîne) pour
  // qu'une seule conversation existe par couple, quel que soit l'initiateur.
  conversations: defineTable({
    userA: v.id('users'),
    userB: v.id('users'),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  }).index('by_pair', ['userA', 'userB']),

  // État d'une conversation POUR UN participant (deux lignes par
  // conversation) : non-lus, dernière lecture, copie effacée. Séparé de
  // `conversations` pour que la lecture d'un participant n'entre pas en
  // conflit d'écriture avec l'envoi de l'autre.
  conversationMembers: defineTable({
    conversationId: v.id('conversations'),
    userId: v.id('users'),
    otherUserId: v.id('users'),
    lastMessageAt: v.number(),
    unreadCount: v.number(),
    hasUnread: v.boolean(),
    lastReadAt: v.number(),
    // « Supprimer ma copie » de la conversation : les messages antérieurs à
    // cet instant ne sont plus servis à ce participant.
    clearedAt: v.optional(v.number()),
    // Retirée de la liste jusqu'au prochain message.
    hidden: v.boolean(),
    // Ce participant a-t-il déjà écrit ? (règle « qui peut m'écrire »).
    hasWritten: v.boolean(),
  })
    .index('by_user_and_lastMessageAt', ['userId', 'lastMessageAt'])
    .index('by_user_and_hasUnread', ['userId', 'hasUnread'])
    .index('by_conversation', ['conversationId'])
    .index('by_otherUserId', ['otherUserId']),

  // Messages privés. `hiddenFor` : participants qui ont supprimé LEUR copie
  // de ce message ; quand les deux l'ont fait, la ligne est effacée.
  directMessages: defineTable({
    conversationId: v.id('conversations'),
    senderId: v.id('users'),
    body: v.string(),
    createdAt: v.number(),
    hiddenFor: v.array(v.id('users')),
    // Retiré par la modération à la suite d'un signalement : le corps est
    // vidé, la ligne reste pour que le fil garde sa chronologie.
    removed: v.optional(v.boolean()),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_sender', ['senderId']),

  // Signalements de messages privés — file du back-office
  // (/admin/signalements-messages). Même modèle que `tribuneReports`, avec
  // une différence de fond : un message privé n'est lisible que par ses deux
  // participants, donc le modérateur ne peut le lire que parce que la
  // personne qui signale le lui TRANSMET. `bodySnapshot` est cette
  // transmission ; il est effacé à la résolution (minimisation).
  messageReports: defineTable({
    messageId: v.id('directMessages'),
    conversationId: v.id('conversations'),
    reporterId: v.id('users'),
    reportedUserId: v.id('users'),
    reason: v.optional(v.string()),
    bodySnapshot: v.optional(v.string()),
    resolved: v.boolean(),
    resolution: v.optional(
      v.union(v.literal('dismissed'), v.literal('removed')),
    ),
    createdAt: v.number(),
  })
    .index('by_resolved', ['resolved'])
    .index('by_message_and_reporter', ['messageId', 'reporterId'])
    .index('by_reporter', ['reporterId'])
    .index('by_reportedUser', ['reportedUserId']),
};
