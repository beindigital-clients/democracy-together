// RÉSEAU SOCIAL ENTRE PERSONNES — règles PURES (profil, suivi, messagerie).
//
// Ce module n'importe aucun type serveur Convex : l'interface le lit par
// l'alias `@convex/lib/social` (bornes des champs, vocabulaires, décision de
// visibilité), comme elle lit déjà `@convex/lib/validation`. Le compteur d'un
// champ, son `maxLength` et le refus serveur lisent donc LE MÊME nombre.
//
// Les décisions d'accès (qui voit un profil, qui peut écrire à qui) sont des
// fonctions pures : c'est ce qui permet de les tester en table de vérité
// (tests/unit/social-rules.test.ts) indépendamment de la base.

import { v } from 'convex/values';
import { DIRECTORY_THEMES, fold, countryTerms } from './directory';
import { PUB_LANGS } from './publications';

// --- Vocabulaires ------------------------------------------------------------

// Visibilité du profil. `members` = membres VALIDÉS du réseau (rôle ≥ membre),
// pas « tout compte connecté » : un visiteur auto-inscrit n'appartient pas au
// réseau, et le réglage s'appelle « membres du réseau ».
export const PROFILE_VISIBILITIES = ['private', 'members', 'public'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export const profileVisibilityValidator = v.union(
  v.literal('private'),
  v.literal('members'),
  v.literal('public'),
);

// « Qui peut m'écrire ». `followed` = les personnes QUE JE SUIS (c'est moi qui
// ouvre la porte en suivant quelqu'un), pas celles qui me suivent : suivre est
// unilatéral, et laisser écrire tout abonné reviendrait à « tout membre ».
export const MESSAGE_POLICIES = ['nobody', 'followed', 'members'] as const;
export type MessagePolicy = (typeof MESSAGE_POLICIES)[number];
export const messagePolicyValidator = v.union(
  v.literal('nobody'),
  v.literal('followed'),
  v.literal('members'),
);

// Valeurs par défaut d'un profil qui naît. Un profil n'existe que si la
// personne l'enregistre : ce n'est donc pas un réglage imposé à son insu. On
// retient le cran INTERMÉDIAIRE (visible des seuls membres, pas du web) —
// l'indexation publique reste un choix explicite (RGPD, art. 25).
export const DEFAULT_VISIBILITY: ProfileVisibility = 'members';
export const DEFAULT_MESSAGE_POLICY: MessagePolicy = 'members';

// Liens de profil : un type (pour l'icône et le libellé) et une adresse.
export const LINK_KINDS = [
  'website',
  'linkedin',
  'x',
  'mastodon',
  'bluesky',
  'orcid',
  'researchgate',
  'other',
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const linkKindValidator = v.union(
  ...LINK_KINDS.map((k) => v.literal(k)),
);

// Thématiques et langues : les vocabulaires DÉJÀ tenus par l'annuaire (10
// domaines d'expertise) et par la bibliothèque (les langues servies). Une
// seconde liste divergerait au premier ajout.
export const PROFILE_THEMES = DIRECTORY_THEMES;
export const PROFILE_LANGUAGES = PUB_LANGS;

export function isProfileTheme(value: string): boolean {
  return (PROFILE_THEMES as readonly string[]).includes(value);
}
export function isProfileLanguage(value: string): boolean {
  return (PROFILE_LANGUAGES as readonly string[]).includes(value);
}

// --- Bornes ------------------------------------------------------------------

export const PROFILE_BOUNDS = {
  displayName: { min: 2, max: 80 },
  bio: { max: 1000 },
  jobTitle: { max: 120 },
  themes: { max: 10 },
  languages: { max: PUB_LANGS.length },
  links: { max: 5 },
  linkUrl: { max: 300 },
  handle: { min: 3, max: 30 },
} as const;

// Message privé : borné comme un commentaire court. Un message n'est pas un
// billet ; au-delà, c'est un document à partager autrement.
export const MESSAGE_BOUNDS = { min: 1, max: 2000 } as const;

// Motif d'un signalement : court, facultatif.
export const REPORT_REASON_MAX = 500;

// Photo : 2 Mo, trois formats d'image matricielle. Pas de SVG : c'est un
// document actif (scripts, liens), servi depuis le stockage il s'exécuterait.
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

// --- Limitation de débit -----------------------------------------------------
//
// Déclarée ICI et non dans `RATE_LIMITS` (convex/lib/rateLimit.ts) : le
// chantier « social » garde ses barèmes ensemble, et les clés portent le
// préfixe `social:` — aucune collision possible avec les compteurs existants.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
export const SOCIAL_RATE_LIMITS = {
  // Un échange soutenu à deux reste loin de 30 messages en 10 minutes ; un
  // script d'arrosage l'atteint en quelques secondes.
  message: { max: 30, windowMs: 10 * MINUTE },
  // Ouvrir des conversations avec des inconnus est le geste du spam : plafond
  // quotidien distinct du débit de messages.
  newConversation: { max: 20, windowMs: 24 * HOUR },
  follow: { max: 60, windowMs: HOUR },
  block: { max: 30, windowMs: HOUR },
  report: { max: 20, windowMs: HOUR },
  profileSave: { max: 30, windowMs: HOUR },
  photo: { max: 20, windowMs: HOUR },
  // Recherche dans l'annuaire des personnes : une query ne peut pas écrire de
  // compteur ; le plafond d'énumération est donc la TAILLE de page (voir
  // `PEOPLE_SEARCH_MAX`), pas un débit.
  // Courriel « nouveau message » : au plus un par conversation et par demi-heure.
  messageEmail: { max: 1, windowMs: 30 * MINUTE },
} as const;

// Taille maximale d'une page d'annuaire des personnes : borne le coût de la
// query ET ce qu'un membre peut aspirer en une requête.
export const PEOPLE_SEARCH_MAX = 48;

// --- Identifiant public (« handle ») -----------------------------------------
//
// Minuscules, chiffres et tirets, 3 à 30 caractères, ni tiret en tête ni en
// fin. C'est un segment d'URL (`/membres/<handle>`) : rien qui demande un
// encodage, rien qui ressemble à une route du site.
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

// Noms qu'une personne ne peut pas prendre : ils se feraient passer pour
// l'institution ou pour une page du site.
export const RESERVED_HANDLES = [
  'admin',
  'administrateur',
  'moderateur',
  'moderation',
  'support',
  'contact',
  'equipe',
  'democracy-together',
  'democracytogether',
  'membres',
  'membre',
  'messages',
  'profil',
  'reseau',
  'nouveau',
  'api',
  'root',
  'system',
  'systeme',
] as const;

export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return (
    HANDLE_RE.test(handle) &&
    !handle.includes('--') &&
    !(RESERVED_HANDLES as readonly string[]).includes(handle)
  );
}

// Handle DÉRIVÉ du nom affiché quand la personne n'en choisit pas. Stable :
// il n'est calculé qu'à la création du profil, jamais recalculé quand le nom
// change (un lien partagé doit continuer de mener au même profil).
export function deriveHandle(displayName: string): string {
  const base = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROFILE_BOUNDS.handle.max - 4)
    .replace(/-+$/g, '');
  const candidate = base.length >= PROFILE_BOUNDS.handle.min ? base : '';
  if (!candidate || !isValidHandle(candidate)) {
    return candidate ? `${candidate}-dt` : 'membre-dt';
  }
  return candidate;
}

// --- Liens -------------------------------------------------------------------

// Un lien de profil est ABSOLU, en HTTPS, sans identifiants embarqués
// (`https://user:pass@…` sert à l'hameçonnage), et d'une longueur bornée. Le
// schéma `http:` est refusé : une page de profil publique ne renvoie pas ses
// lecteurs vers un transport en clair.
export function isValidProfileLink(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > PROFILE_BOUNDS.linkUrl.max) return false;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  // Un hôte sans point (`https://localhost`, `https://intranet`) n'est pas
  // une adresse publique.
  return url.hostname.includes('.');
}

// --- Décisions d'accès (pures) -----------------------------------------------

export type ProfileAccessInput = {
  visibility: ProfileVisibility;
  isSelf: boolean;
  // Le propriétaire appartient-il au réseau (rôle ≥ membre) ? Un profil de
  // visiteur, ou d'un compte rétrogradé, n'est visible que de lui-même, quel
  // que soit le réglage enregistré.
  ownerIsMember: boolean;
  viewerIsMember: boolean;
  // Le propriétaire a bloqué le lecteur : le profil lui est invisible.
  blockedByOwner: boolean;
};

export function canViewProfile(input: ProfileAccessInput): boolean {
  if (input.isSelf) return true;
  if (!input.ownerIsMember) return false;
  if (input.blockedByOwner) return false;
  switch (input.visibility) {
    case 'public':
      return true;
    case 'members':
      return input.viewerIsMember;
    case 'private':
      return false;
  }
}

// Le profil est-il INDEXABLE (page publique, métadonnées, sitemap) ?
export function isIndexable(input: {
  visibility: ProfileVisibility;
  ownerIsMember: boolean;
}): boolean {
  return input.visibility === 'public' && input.ownerIsMember;
}

export type MessageAccessInput = {
  senderIsMember: boolean;
  recipientIsMember: boolean;
  // Blocage dans UN des deux sens : il ferme la conversation dans les deux.
  blockedEitherWay: boolean;
  recipientPolicy: MessagePolicy;
  // Le destinataire suit-il l'expéditeur ?
  recipientFollowsSender: boolean;
  // Le destinataire a-t-il DÉJÀ écrit dans cette conversation ? Celui qui a
  // ouvert l'échange ne peut pas se voir refuser la réponse de son
  // interlocuteur : sans cette règle, une personne réglée sur « personne »
  // pourrait écrire à tout le monde sans que personne ne puisse lui répondre.
  recipientHasWritten: boolean;
  isSelf: boolean;
};

export type MessageRefusal = 'SELF' | 'NOT_MEMBER' | 'BLOCKED' | 'POLICY';

export function messageRefusal(
  input: MessageAccessInput,
): MessageRefusal | null {
  if (input.isSelf) return 'SELF';
  if (!input.senderIsMember || !input.recipientIsMember) return 'NOT_MEMBER';
  if (input.blockedEitherWay) return 'BLOCKED';
  if (input.recipientHasWritten) return null;
  switch (input.recipientPolicy) {
    case 'members':
      return null;
    case 'followed':
      return input.recipientFollowsSender ? null : 'POLICY';
    case 'nobody':
      return 'POLICY';
  }
}

// --- Préférences de notification ---------------------------------------------
//
// Les types émis par `notify()` (convex/lib/notify.ts) qu'une personne peut
// couper. La liste est FERMÉE : une préférence enregistrée hors de ce
// vocabulaire est refusée à l'écriture. Un type émis par un autre module et
// absent d'ici reste simplement toujours actif (défaut sûr : on ne perd pas
// une notification faute de l'avoir cataloguée).
export const NOTIFICATION_PREF_TYPES = [
  'publication_published',
  'publication_rejected',
  'membership_approved',
  'membership_rejected',
  'tribune_comment',
  'tribune_thread',
  'peer_review_assigned',
  'peer_review_decided',
  'publication_ai_flagged',
  'social_follow',
  'social_message',
] as const;
export type NotificationPrefType = (typeof NOTIFICATION_PREF_TYPES)[number];

export function isNotificationPrefType(value: string): boolean {
  return (NOTIFICATION_PREF_TYPES as readonly string[]).includes(value);
}

// Types émis par ce chantier.
export const SOCIAL_NOTIF = {
  FOLLOW: 'social_follow',
  MESSAGE: 'social_message',
} as const satisfies Record<string, NotificationPrefType>;

// --- Photo : contenu réel -----------------------------------------------------
//
// Le type annoncé au téléversement est une DÉCLARATION du client ; le type
// relevé par le stockage aussi (il reprend l'en-tête de la requête). Seuls
// les premiers octets disent ce que le fichier est. Un « portrait.png » qui
// commence par `<svg` ou `%PDF` est refusé.
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  return null;
}

// --- Recherche ---------------------------------------------------------------

// Meule de recherche d'un profil : nom, handle, fonction, et pays (code et
// noms dans les langues du site, comme l'annuaire des organisations). La
// biographie n'y est PAS : chercher dans un texte libre transformerait
// l'annuaire en moteur de recherche de phrases personnelles.
export function profileSearchText(p: {
  displayName: string;
  handle: string;
  jobTitle?: string;
  country?: string;
}): string {
  return fold(
    `${p.displayName} ${p.handle.replace(/-/g, ' ')} ${p.jobTitle ?? ''} ${
      p.country ? countryTerms(p.country) : ''
    }`,
  );
}

// Clé de tri alphabétique d'un nom (sans casse ni accents).
export function nameSortKey(displayName: string): string {
  return fold(displayName);
}

export { fold };
