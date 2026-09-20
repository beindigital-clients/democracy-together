import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

// Rôles réseau (F-02) — hiérarchie croissante, voir convex/lib/rbac.ts.
export const networkRole = v.union(
  v.literal('visiteur'),
  v.literal('membre'),
  v.literal('moderateur'),
  v.literal('editeur'),
  v.literal('admin'),
);

export const locale = v.union(v.literal('fr'), v.literal('en'));

export default defineSchema({
  // Tables de Convex Auth (users, authSessions, authAccounts, ...).
  ...authTables,

  // Convex Auth possède `users` ; on la redéfinit pour ajouter rôle + langue.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- Democracy Together ---
    role: v.optional(networkRole),
    preferredLocale: v.optional(locale),
  })
    .index('email', ['email'])
    // `by_role` sert la garde « zéro admin » de l'amorçage (convex/bootstrap.ts) :
    // elle doit répondre par un seul document lu, sans parcourir la table.
    .index('by_role', ['role']),

  // Think tanks membres (F-19 annuaire, F-21 fiche membre).
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    country: v.string(),
    region: v.string(),
    languages: v.array(v.string()),
    themes: v.array(v.string()),
    description: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    status: v.union(
      v.literal('active'),
      v.literal('pending'),
      v.literal('suspended'),
    ),
    createdAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_region', ['region']),

  // Rattachement utilisateur <-> organisation (délégation, F-21).
  organizationMemberships: defineTable({
    userId: v.id('users'),
    orgId: v.id('organizations'),
    orgRole: v.union(
      v.literal('owner'),
      v.literal('editor'),
      v.literal('member'),
    ),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_org', ['orgId'])
    .index('by_org_user', ['orgId', 'userId']),

  // Bibliothèque (F-32/F-33/F-34) — publications du réseau. UGC modéré : un
  // membre soumet (status 'pending'), un modérateur publie (status 'published').
  // Les requêtes publiques ne renvoient QUE les publications publiées. Le
  // vocabulaire (type/thème/région) est en slugs neutres (cf. lib/publications).
  publications: defineTable({
    title: v.string(),
    slug: v.string(),
    type: v.union(
      v.literal('rapport'),
      v.literal('policy-brief'),
      v.literal('working-paper'),
      v.literal('note'),
      v.literal('dataset'),
    ),
    theme: v.string(),
    region: v.union(
      v.literal('afrique'),
      v.literal('europe'),
      v.literal('mondial'),
    ),
    languages: v.array(locale),
    access: v.union(v.literal('open'), v.literal('members')),
    authors: v.array(
      v.object({ name: v.string(), role: v.optional(v.string()) }),
    ),
    year: v.number(),
    publishedAt: v.number(),
    abstract: v.string(),
    keypoints: v.array(v.string()),
    body: v.array(v.string()),
    pages: v.optional(v.number()),
    license: v.optional(v.string()),
    doi: v.string(),
    // Vignette de couverture — chemin public (seed) ; optionnelle pour les
    // dépôts membres (F-32), qui téléversent un document, pas une image.
    image: v.optional(v.string()),
    downloads: v.number(),
    citations: v.number(),
    views: v.optional(v.number()),
    status: v.union(
      v.literal('draft'),
      v.literal('pending'),
      v.literal('published'),
    ),
    // Modération (workflow membre -> modérateur, comme F-22/F-26).
    authorUserId: v.optional(v.id('users')),
    submittedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    // Revue à comité de lecture (F-43) — couche AU-DESSUS de la modération.
    // Étape optionnelle : 'in_review' (relecteur assigné), 'revision' (retour
    // à l'auteur), 'reviewed' (avis rendu). Voir convex/peerReview.ts.
    reviewStage: v.optional(
      v.union(
        v.literal('in_review'),
        v.literal('revision'),
        v.literal('reviewed'),
      ),
    ),
    // Document téléversé (F-32) : fichier dans le stockage Convex + nom d'origine.
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_status_and_theme', ['status', 'theme'])
    .index('by_author', ['authorUserId'])
    // File de revue (F-43, convex/peerReview.ts) : `reviewStage` n'est posé que
    // sur les publications ENGAGÉES dans une revue — une infime minorité de la
    // table. L'index les isole sans lire les autres. Les documents où le champ
    // est absent sont indexés sous `undefined`, qui précède toute valeur : la
    // file entière s'obtient donc par la plage `> undefined`, en une lecture
    // contiguë (cf. getReviewQueue).
    .index('by_reviewStage', ['reviewStage']),

  // Consultations par publication (F-37) — compteur ISOLÉ du document.
  //
  // Le décompte était patché sur la publication elle-même : chaque visite
  // réécrivait un document lu par la bibliothèque entière (liste, détail,
  // « même thématique »), donc invalidait tous ces abonnements et mettait la
  // page la plus consultée en concurrence d'écriture avec elle-même (OCC).
  // Une ligne dédiée, minuscule et lue nulle part ailleurs, encaisse le trafic
  // sans toucher au document.
  //
  // MIGRATION : `publications.views` garde les vues comptées AVANT ce
  // découpage (et les valeurs de démonstration posées par devAdmin). Le total
  // affiché est la SOMME des deux — les sources sont disjointes, plus rien
  // n'écrit `publications.views` en production.
  publicationViews: defineTable({
    publicationId: v.id('publications'),
    count: v.number(),
  }).index('by_publication', ['publicationId']),

  // Revue à comité de lecture (F-43) — avis des relecteurs (moderateur+) sur une
  // publication. Couche au-dessus de la modération : un éditeur assigne un
  // relecteur (reviewStage='in_review'), les relecteurs déposent un avis, puis
  // l'éditeur décide (revision / reviewed). `reviewerName` = instantané
  // dénormalisé (évite un join à la lecture de la file).
  peerReviews: defineTable({
    publicationId: v.id('publications'),
    reviewerUserId: v.id('users'),
    reviewerName: v.string(),
    recommendation: v.union(
      v.literal('accept'),
      v.literal('minor'),
      v.literal('major'),
      v.literal('reject'),
    ),
    comment: v.string(),
    createdAt: v.number(),
  })
    .index('by_publication', ['publicationId'])
    .index('by_reviewer', ['reviewerUserId'])
    // Unicité applicative de l'avis (issue #9) : UN avis par relecteur et par
    // publication. L'index rend la garde de `peerReview.submitReview` exacte
    // sans relire toute la liste des avis.
    .index('by_publication_and_reviewer', ['publicationId', 'reviewerUserId']),

  // Candidatures d'adhésion (F-22) — workflow de validation par un modérateur.
  membershipApplications: defineTable({
    type: v.union(v.literal('organisation'), v.literal('individu')),
    applicantUserId: v.optional(v.id('users')),
    organizationName: v.string(),
    contactEmail: v.string(),
    country: v.string(),
    message: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewNotes: v.optional(v.string()),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    // Onboarding (F-01/F-22) : horodatage de l'e-mail d'invitation envoyé au
    // candidat approuvé, et organisation créée à l'approbation. Permet de
    // renvoyer l'invitation sans dupliquer le compte ni la fiche annuaire.
    invitedAt: v.optional(v.number()),
    createdOrgId: v.optional(v.id('organizations')),
  })
    .index('by_status', ['status'])
    .index('by_applicant', ['applicantUserId']),

  // Inscriptions à la newsletter (F-18). Newsletter maison : envoi orchestré par
  // Convex via l'adaptateur e-mail (Resend, puis AWS SES). `unsubToken` = lien
  // de désinscription dans chaque envoi.
  newsletterSubscriptions: defineTable({
    email: v.string(),
    locale: v.optional(locale),
    unsubToken: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_email', ['email'])
    .index('by_token', ['unsubToken']),

  // Campagnes newsletter (F-65) — composées au back-office, envoyées à tous les
  // abonnés via l'adaptateur e-mail.
  newsletterCampaigns: defineTable({
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('sending'),
      v.literal('sent'),
      v.literal('error'),
    ),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    recipientCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
  }).index('by_status', ['status']),

  // Formulaire de contact (F-17).
  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    body: v.string(),
    handled: v.boolean(),
    createdAt: v.number(),
  }).index('by_handled', ['handled']),

  // Inscriptions aux événements (F-53) — RSVP en ligne. `eventSlug` = slug neutre
  // du module Next `events-content.ts` (pas de table événements en base). Index
  // composite (event, email) : sert le dédoublonnage ET le décompte par event.
  eventRegistrations: defineTable({
    eventSlug: v.string(),
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    locale: v.optional(locale),
    createdAt: v.number(),
  }).index('by_event_and_email', ['eventSlug', 'email']),

  // Rappels d'événements par e-mail (F-55) — un visiteur (sans compte) demande
  // à être prévenu avant un événement à venir. `eventSlug` = slug neutre du
  // module Next `events-content.ts` ; `eventDate` = horodatage UTC du jour de
  // l'événement (calculé côté appelant). Un cron quotidien envoie les rappels
  // dont la date approche (sendEmail NO-OP sans clé fournisseur). Index by_sent
  // = file des rappels à traiter ; index composite (event, email) = dédoublonnage.
  eventReminders: defineTable({
    eventSlug: v.string(),
    email: v.string(),
    locale: v.optional(locale),
    eventDate: v.number(),
    sent: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_sent', ['sent'])
    .index('by_event_and_email', ['eventSlug', 'email']),

  // Candidatures Jeunes (F-58) — le hub Jeunes devient fonctionnel. Candidature
  // sans compte (comme l'adhésion F-22, par e-mail). Revue par le staff.
  youthApplications: defineTable({
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email']),

  // Mentorat (F-59) — mise en relation jeunes <-> mentors du réseau. Demande
  // sans compte (par e-mail, comme F-58) : on s'inscrit comme « mentoré »
  // (cherche un mentor) ou « mentor » (propose son accompagnement). `themes` =
  // axes d'intérêt (slugs PUB_THEMES). Revue par le staff (matched / closed).
  mentorshipRequests: defineTable({
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
    status: v.union(
      v.literal('pending'),
      v.literal('matched'),
      v.literal('closed'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email']),

  // Tribune démocratique (F-44/F-47/F-50) — espace d'expression modéré. Lecture
  // publique, écriture réservée aux membres ; modération a posteriori via
  // signalement. `theme` = un des 5 axes (slugs PUB_THEMES). `authorName` est un
  // instantané dénormalisé (évite un join à la lecture du fil).
  tribunePosts: defineTable({
    authorUserId: v.id('users'),
    authorName: v.string(),
    theme: v.string(),
    format: v.union(v.literal('court'), v.literal('fond')),
    title: v.string(),
    body: v.string(),
    // Langue de RÉDACTION du billet (issue #35). Un billet de Tribune est
    // écrit dans UNE seule langue et n'est jamais traduit : les deux préfixes
    // d'URL servent le même texte. Sans ce champ, `tribune/[id]` ne pouvait
    // poser qu'un canonical par locale — deux pages canoniques pour un seul
    // contenu, soit du duplicate content. Renseignée par l'auteur à la
    // publication ; OPTIONNELLE parce que les billets antérieurs n'en portent
    // pas, et que le repli de `resolveLocale` (fr) est la bonne réponse pour
    // eux.
    lang: v.optional(locale),
    status: v.union(v.literal('published'), v.literal('removed')),
    commentCount: v.number(),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_status_and_theme', ['status', 'theme'])
    .index('by_author', ['authorUserId']),

  tribuneComments: defineTable({
    postId: v.id('tribunePosts'),
    authorUserId: v.id('users'),
    authorName: v.string(),
    body: v.string(),
    status: v.union(v.literal('published'), v.literal('removed')),
    createdAt: v.number(),
  }).index('by_post', ['postId']),

  // Réactions de la Tribune — un seul type, « soutien » (comme un like). Une
  // réaction par membre et par post : unicité via l'index composite
  // (postId, userId). Le décompte se fait à la lecture (pas de dénormalisation).
  tribuneReactions: defineTable({
    postId: v.id('tribunePosts'),
    userId: v.id('users'),
    createdAt: v.number(),
  }).index('by_post_and_user', ['postId', 'userId']),

  // Signalements (F-50) — file de modération a posteriori. `targetId` = id d'un
  // post ou d'un commentaire (stocké en chaîne, type porté par `targetType`).
  tribuneReports: defineTable({
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    reason: v.optional(v.string()),
    reporterUserId: v.id('users'),
    resolved: v.boolean(),
    createdAt: v.number(),
  }).index('by_resolved', ['resolved']),

  // Appels à projets collaboratifs (F-60) — propositions de projets menés en
  // commun entre membres. La page publique présente le DISPOSITIF (aucun appel
  // daté ni financement chiffré) ; un membre propose un projet (status
  // 'pending'), revu par le staff (accepted / rejected). `theme` = un des 5 axes
  // (slugs PUB_THEMES). `authorName` = instantané dénormalisé (évite un join).
  projectProposals: defineTable({
    authorUserId: v.id('users'),
    authorName: v.string(),
    theme: v.string(),
    title: v.string(),
    summary: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('rejected'),
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_author', ['authorUserId']),

  // Espaces de travail collaboratifs (F-24) — un membre du réseau ouvre un
  // espace autour d'un thème ; d'autres membres le rejoignent et y déposent des
  // notes. Lecture réservée aux membres réseau (membre+) ; l'écriture de notes
  // est réservée aux MEMBRES DE L'ESPACE (workspaceMembers). `theme` = un des 5
  // axes (slugs PUB_THEMES). `ownerName`/`memberCount` = instantanés dénormalisés
  // (évitent un join à la lecture de la liste).
  workspaces: defineTable({
    title: v.string(),
    theme: v.string(),
    description: v.string(),
    ownerUserId: v.id('users'),
    ownerName: v.string(),
    memberCount: v.number(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerUserId']),

  // Appartenance à un espace (F-24). Unicité (espace, utilisateur) via l'index
  // composite by_workspace_and_user. `userName` = instantané dénormalisé.
  workspaceMembers: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    userName: v.string(),
    role: v.union(v.literal('owner'), v.literal('member')),
    joinedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_and_user', ['workspaceId', 'userId'])
    // « Mes espaces » : l'appartenance d'un utilisateur se lit en UNE requête
    // indexée. Sans lui, `listWorkspaces` résolvait l'appartenance espace par
    // espace — un aller-retour par ligne affichée (N+1).
    .index('by_user', ['userId']),

  // Notes d'un espace (F-24) — fil collaboratif, écriture réservée aux membres
  // de l'espace. `authorName` = instantané dénormalisé.
  workspaceNotes: defineTable({
    workspaceId: v.id('workspaces'),
    authorUserId: v.id('users'),
    authorName: v.string(),
    body: v.string(),
    createdAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  // Notifications par utilisateur (F-25/F-51) — réactif (Convex temps réel).
  // Déclenchées par les moments existants (modération de publication, revue de
  // candidature). `titleKey` = clé i18n (namespace `notifications`), `params`
  // interpolés côté client ; `link` = chemin interne facultatif. Index composite
  // (user, read) : sert la liste par utilisateur ET le décompte des non-lues.
  notifications: defineTable({
    userId: v.id('users'),
    type: v.string(),
    titleKey: v.string(),
    params: v.optional(v.any()),
    link: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  }).index('by_user_and_read', ['userId', 'read']),

  // Journal d'audit des actions sensibles (F-67 ; défense en profondeur).
  auditLog: defineTable({
    actorId: v.optional(v.id('users')),
    action: v.string(),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_action', ['action'])
    .index('by_actor', ['actorId']),

  // Compteurs dénormalisés du back-office (F-61/F-66) — tenus À L'ÉCRITURE.
  //
  // Les tableaux de bord comptaient en chargeant les tables (`collect().length`) :
  // le coût de l'écran d'administration croissait avec le succès du réseau, et
  // Convex facture à la donnée lue. Une ligne par compteur, lue en O(1) par
  // l'index `by_key`, et incrémentée dans la transaction qui écrit la donnée
  // comptée — donc annulée avec elle si elle échoue.
  //
  // Le registre des clés vit dans convex/lib/counters.ts ; `counters.recompute`
  // (internalMutation) les recalcule depuis les tables — amorçage d'un
  // déploiement existant, et réconciliation après une écriture directe.
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),

  // Limiteur de débit (sécurité, défense en profondeur) — compteur par clé sur
  // fenêtre fixe. Voir convex/lib/rateLimit.ts.
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index('by_key', ['key']),

  // DEV/TEST uniquement : codes OTP en clair (les e-mails ne sont pas envoyés
  // sans clé). Jamais alimenté en prod (clé e-mail présente -> envoi réel).
  devOtpCodes: defineTable({
    email: v.string(),
    code: v.string(),
    purpose: v.string(),
    createdAt: v.number(),
  }).index('by_email', ['email']),
});
