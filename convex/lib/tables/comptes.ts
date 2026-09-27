import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Chantier « comptes » (F-63 cycle de vie, F-21 fiche membre, 2FA).
//
// Tables PROPRES au chantier. Les champs ajoutés à des tables existantes
// (`users.suspendedAt`, `organizations.logoFileId`, `publications.organizationId`…)
// vivent, eux, en place dans convex/schema.ts.

// Champs publics d'une fiche d'annuaire tels qu'un responsable les propose.
// Même vocabulaire que la fiche (`organizations`), plus `showMembers` : c'est
// l'organisation qui décide si sa page publique nomme ses membres.
export const organizationRevisionFields = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  country: v.string(),
  region: v.string(),
  themes: v.array(v.string()),
  languages: v.array(v.string()),
  showMembers: v.boolean(),
});

export const comptesTables = {
  // --- Double authentification (TOTP, RFC 6238) ----------------------------
  //
  // UNE ligne par compte. Le secret n'est JAMAIS stocké en clair : il est
  // chiffré en AES-GCM avec la clé d'environnement TWO_FACTOR_ENCRYPTION_KEY
  // (convex/lib/secretBox.ts). `keyId` dit avec quelle clé : `env` en
  // production, `dev` sur un déploiement de test sans clé (AUTH_DEV_OTP) — un
  // secret chiffré avec la clé de développement est REFUSÉ dès que le
  // déploiement porte une vraie clé, il ne peut donc pas survivre à une mise
  // en service par inadvertance.
  //
  // `lastUsedStep` : pas de temps (compteur RFC 6238) du dernier code accepté.
  // Un code n'est valable que pour un pas STRICTEMENT supérieur — c'est ce qui
  // interdit de rejouer, dans sa fenêtre de 30 s, un code intercepté.
  //
  // Les codes de secours sont des EMPREINTES (SHA-256), dix au plus : liste
  // bornée par construction, d'où un tableau plutôt qu'une table.
  twoFactorCredentials: defineTable({
    userId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active')),
    secretCiphertext: v.string(),
    secretIv: v.string(),
    keyId: v.union(v.literal('env'), v.literal('dev')),
    lastUsedStep: v.optional(v.number()),
    backupCodes: v.array(
      v.object({ hash: v.string(), usedAt: v.optional(v.number()) }),
    ),
    createdAt: v.number(),
    activatedAt: v.optional(v.number()),
  }).index('by_user', ['userId']),

  // Preuve de second facteur, LIÉE À UNE SESSION Convex Auth
  // (`getAuthSessionId`). Une nouvelle connexion ouvre une nouvelle session,
  // donc une session sans preuve : c'est ce qui oblige chaque connexion à
  // présenter le code, et pas seulement la première.
  twoFactorSessionProofs: defineTable({
    sessionId: v.id('authSessions'),
    userId: v.id('users'),
    method: v.union(v.literal('totp'), v.literal('backup')),
    verifiedAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_user', ['userId']),

  // Réglages de sécurité — SINGLETON (`key` vaut toujours 'default'), même
  // motif que `aiModerationConfig`. Absent = valeurs par défaut
  // (convex/lib/accountAccess.ts) : 2FA NON obligatoire, parce que le serveur
  // E2E partagé crée des comptes administrateurs qui n'ont pas d'appareil.
  // docs/backlog/comptes.md : À ACTIVER À LA MISE EN SERVICE.
  securitySettings: defineTable({
    key: v.literal('default'),
    twoFactorRequiredForStaff: v.boolean(),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // Code de reconfirmation par e-mail d'une action irréversible demandée par
  // le titulaire lui-même (suppression de son compte). EMPREINTE seulement,
  // expiration courte, essais comptés.
  accountConfirmationCodes: defineTable({
    userId: v.id('users'),
    purpose: v.literal('delete_account'),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    createdAt: v.number(),
  }).index('by_user_and_purpose', ['userId', 'purpose']),

  // Suppressions de compte EN COURS ou terminées (convex/lib/accountDeletion.ts).
  // La suppression est découpée en lots (une mutation Convex est bornée) :
  // cette ligne tient la reprise. Elle ne garde AUCUNE donnée personnelle —
  // ni adresse ni nom — seulement l'identifiant du compte disparu, qui ne
  // désigne plus personne une fois la ligne `users` supprimée.
  accountDeletions: defineTable({
    userId: v.id('users'),
    via: v.union(v.literal('admin'), v.literal('self')),
    requestedBy: v.optional(v.id('users')),
    status: v.union(v.literal('running'), v.literal('done')),
    // Étape courante dans le registre ordonné des modules.
    step: v.number(),
    // Adresse du compte, gardée LE TEMPS du traitement seulement : plusieurs
    // tables se rattachent par l'adresse (newsletter, rappels…). Effacée à la
    // dernière étape.
    email: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_status', ['status']),

  // Révisions de fiche d'annuaire proposées par le RESPONSABLE d'une
  // organisation (F-21). Soumises à validation d'un modérateur : la fiche
  // publique parle au nom du réseau (cf. docs/backlog/comptes.md). La fiche en
  // ligne reste servie telle quelle pendant la revue.
  organizationRevisions: defineTable({
    orgId: v.id('organizations'),
    submittedBy: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('superseded'),
    ),
    fields: organizationRevisionFields,
    // Logo proposé : fichier du stockage Convex dont le CONTENU a été vérifié
    // (signature PNG / JPEG / WebP, taille) par `orgAdmin.attachLogo`.
    logoFileId: v.optional(v.id('_storage')),
    removeLogo: v.optional(v.boolean()),
    submittedAt: v.number(),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
  })
    .index('by_org_and_status', ['orgId', 'status'])
    .index('by_status', ['status'])
    .index('by_submitter', ['submittedBy']),

  // Logos téléversés et VÉRIFIÉS, en attente d'être joints à une révision.
  // Un fichier n'entre dans une révision qu'en passant par cette table : le
  // client ne peut pas désigner n'importe quel identifiant de stockage.
  organizationLogoUploads: defineTable({
    orgId: v.id('organizations'),
    uploadedBy: v.id('users'),
    fileId: v.id('_storage'),
    contentType: v.string(),
    createdAt: v.number(),
  })
    .index('by_file', ['fileId'])
    .index('by_uploader', ['uploadedBy']),
};
