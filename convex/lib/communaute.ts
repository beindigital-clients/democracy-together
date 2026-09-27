import { v } from 'convex/values';

// CHANTIER « COMMUNAUTÉ » — règles PURES partagées par les modules Convex
// (convex/workspaces.ts, convex/workspaceFiles.ts, convex/tribune.ts,
// convex/communityModeration.ts), par le schéma et par les tests unitaires.
// Aucune lecture de base ici : ce qui se décide sans `ctx` se teste sans
// `convex-test`, et ne peut pas diverger entre deux modules.

// --- Espaces collaboratifs (F-24) -------------------------------------------

// Rôles DANS un espace. Trois rangs, du plus large au plus restreint :
//   animateur    gère l'espace (invitations, rôles, retrait, fichiers de tous) ;
//   contributeur écrit (notes, fichiers) ;
//   lecteur      lit (notes, fichiers), n'écrit rien.
// `owner` et `member` sont les deux valeurs de l'incrément 1, encore présentes
// en base : elles valent respectivement animateur et contributeur. On ne les
// réécrit pas (aucune migration à jouer) ; `effectiveWorkspaceRole` les lit.
export const WORKSPACE_ROLES = [
  'animateur',
  'contributeur',
  'lecteur',
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const workspaceRoleValidator = v.union(
  v.literal('animateur'),
  v.literal('contributeur'),
  v.literal('lecteur'),
);

// Valeurs STOCKÉES (héritées comprises) — ce que le schéma accepte.
export const storedWorkspaceRoleValidator = v.union(
  v.literal('owner'),
  v.literal('member'),
  v.literal('animateur'),
  v.literal('contributeur'),
  v.literal('lecteur'),
);
export type StoredWorkspaceRole =
  'owner' | 'member' | 'animateur' | 'contributeur' | 'lecteur';

export function effectiveWorkspaceRole(
  stored: StoredWorkspaceRole,
): WorkspaceRole {
  if (stored === 'owner') return 'animateur';
  if (stored === 'member') return 'contributeur';
  return stored;
}

const WORKSPACE_RANK: Record<WorkspaceRole, number> = {
  lecteur: 0,
  contributeur: 1,
  animateur: 2,
};

export function workspaceRoleAtLeast(
  role: WorkspaceRole | null,
  min: WorkspaceRole,
): boolean {
  return role !== null && WORKSPACE_RANK[role] >= WORKSPACE_RANK[min];
}

// Espace OUVERT : tout membre du réseau le voit et peut le rejoindre.
// Espace PRIVÉ : invisible hors de ses membres (et de ses invités), on n'y
// entre que sur invitation. Un espace de l'incrément 1 n'a pas le champ : il
// était ouvert, il le reste.
export const workspaceVisibilityValidator = v.union(
  v.literal('open'),
  v.literal('private'),
);
export type WorkspaceVisibility = 'open' | 'private';

export function effectiveVisibility(
  stored: WorkspaceVisibility | undefined,
): WorkspaceVisibility {
  return stored ?? 'open';
}

// Invitations : durée de validité. Deux semaines — assez pour qu'un membre
// peu connecté la voie passer, assez court pour qu'une invitation oubliée ne
// reste pas une porte ouverte indéfiniment.
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const invitationStatusValidator = v.union(
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('declined'),
  v.literal('revoked'),
);

// Une invitation `pending` dont l'échéance est passée est EXPIRÉE. Le statut
// n'est pas réécrit (une query ne lit pas l'horloge, une mutation qui lève ne
// peut rien écrire) : l'expiration se calcule, au moment où l'on s'en sert.
export function isInvitationExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

// Fichiers partagés : bornes. Le quota est PAR ESPACE et compte toutes les
// versions conservées — une version remplacée occupe toujours le stockage.
export const WORKSPACE_FILE_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  quotaBytes: 200 * 1024 * 1024,
  maxFiles: 200,
  maxVersionsPerFile: 30,
  nameMaxLength: 160,
} as const;

// --- Tribune : modération (F-45, F-49) --------------------------------------

// Mode de modération. A PRIORI : un contenu soumis attend la décision d'un
// modérateur, invisible du public. A POSTERIORI : il paraît aussitôt, et la
// modération agit sur signalement (comportement antérieur au chantier).
export const moderationModeValidator = v.union(
  v.literal('a_priori'),
  v.literal('a_posteriori'),
);
export type ModerationMode = 'a_priori' | 'a_posteriori';

// Réglages par défaut, quand l'administrateur n'a jamais ouvert le panneau.
// Billets : A PRIORI, c'est ce que demande le backlog (F-45 : « validation par
// un groupe de modérateurs avant publication »). Commentaires : A POSTERIORI —
// F-45 parle de publication, F-47 de réactions et de débat ; retenir chaque
// réponse en file tuerait la conversation. L'administrateur peut basculer
// l'un et l'autre.
export const DEFAULT_COMMUNITY_MODERATION = {
  postMode: 'a_priori' as ModerationMode,
  commentMode: 'a_posteriori' as ModerationMode,
};

export const contentStatusValidator = v.union(
  v.literal('pending'),
  v.literal('published'),
  v.literal('rejected'),
  v.literal('removed'),
);
export type ContentStatus = 'pending' | 'published' | 'rejected' | 'removed';

export type ModerationDecision = 'approve' | 'reject' | 'remove';

// Machine à états d'un contenu de la Tribune. Toute décision humaine passe
// par ici ; un refus de transition est une erreur (`INVALID_TRANSITION`),
// jamais un no-op silencieux.
//   approve : pending -> published ; ou RÉVISION d'une décision négative
//             (rejected/removed -> published) — un modérateur peut revenir sur
//             un rejet, et l'historique le montre.
//   reject  : pending -> rejected (avec motif).
//   remove  : published -> removed (avec motif) — retrait après parution.
export function nextStatus(
  from: ContentStatus,
  decision: ModerationDecision,
): ContentStatus | null {
  switch (decision) {
    case 'approve':
      return from === 'published' ? null : 'published';
    case 'reject':
      return from === 'pending' ? 'rejected' : null;
    case 'remove':
      return from === 'published' ? 'removed' : null;
  }
}

// Motif d'une décision négative : il est montré à l'auteur, il doit donc
// exister et rester lisible.
export const MODERATION_REASON = { min: 3, max: 1000 } as const;

// Portée de l'auto-acceptation par l'IA. Le panneau /admin/moderation-ia règle
// un périmètre de TYPES éligibles à la mise en ligne automatique ; la Tribune y
// entre comme un type de plus, `tribune`, que l'administrateur doit cocher
// EXPLICITEMENT. Sans cette case, l'IA ne fait que proposer : la décision
// reste humaine (F-45).
export const TRIBUNE_AI_SCOPE = 'tribune';

// Événements de l'historique d'un contenu (F-49). Une ligne par fait, jamais
// réécrite : c'est ce qui permet de répondre à « qui a fait quoi, quand ».
export const moderationEventKindValidator = v.union(
  v.literal('submitted'),
  v.literal('edited'),
  v.literal('ai_review'),
  v.literal('ai_published'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('removed'),
  v.literal('reported'),
  v.literal('reports_dismissed'),
);
export type ModerationEventKind =
  | 'submitted'
  | 'edited'
  | 'ai_review'
  | 'ai_published'
  | 'approved'
  | 'rejected'
  | 'removed'
  | 'reported'
  | 'reports_dismissed';

export const moderationTargetValidator = v.union(
  v.literal('post'),
  v.literal('comment'),
);
export type ModerationTarget = 'post' | 'comment';

// Extrait d'un texte pour une liste : borné, et coupé sur un caractère.
export function excerpt(text: string, max = 180): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
