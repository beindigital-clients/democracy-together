import { v } from 'convex/values';

// DOUBLE OPT-IN DE LA NEWSLETTER (F-18) — règles pures, partagées par
// convex/newsletter.ts et ses tests.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Durée de validité d'un lien de confirmation. 48 h couvrent un week-end et
// une boîte consultée tous les deux jours ; au-delà, l'attente est purgée et
// l'adresse peut se réinscrire.
export const CONFIRM_TTL_MS = 48 * HOUR;

// Abonnés HÉRITÉS relancés par la migration : ils n'ont pas demandé ce
// courriel à l'instant, on leur laisse un mois pour y répondre.
export const LEGACY_CONFIRM_TTL_MS = 30 * DAY;

// RENVOI BORNÉ. Se réinscrire avec une adresse en attente renvoie le lien —
// c'est le geste naturel de qui ne trouve pas le courriel — mais pas plus de
// trois fois par attente, et pas plus d'une fois toutes les dix minutes.
// Sans ces deux bornes, le formulaire public deviendrait un moyen d'inonder
// une boîte tierce (le plafond par IP ne suffit pas : il est par formulaire,
// pas par destinataire).
export const CONFIRM_MAX_SENDS = 3;
export const CONFIRM_RESEND_MIN_INTERVAL_MS = 10 * MINUTE;

// Version du texte d'information affiché sous le formulaire au moment du
// consentement. Elle est enregistrée avec la preuve : si le texte change, on
// sait sous quelle rédaction chaque abonné a consenti.
export const CONSENT_TEXT_VERSION = '2026-09-27';

// Formulaires d'inscription — la SOURCE du consentement. Domaine fermé côté
// client ; le serveur ramène toute autre valeur à 'other' plutôt que de
// refuser (un formulaire ajouté demain ne doit pas casser l'inscription).
export const SUBSCRIPTION_SOURCES = [
  'home',
  'footer',
  'newsletter-page',
  'legacy',
  'other',
] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];
export const subscriptionSourceValidator = v.optional(v.string());

export function normalizeSource(raw: string | undefined): SubscriptionSource {
  // `legacy` est réservé à la migration : un client ne peut pas se déclarer
  // « abonné d'avant le double opt-in ».
  if (!raw || raw === 'legacy') return 'other';
  return (SUBSCRIPTION_SOURCES as readonly string[]).includes(raw)
    ? (raw as SubscriptionSource)
    : 'other';
}

/** Jeton aléatoire de 256 bits, en hexadécimal. */
export function newConfirmToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Empreinte SHA-256 (hexadécimal) — seule forme sous laquelle le jeton de
 * confirmation est stocké. Le jeton ayant 256 bits d'entropie, un hachage
 * rapide suffit : il n'y a pas de dictionnaire à ralentir.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Un jeton reçu d'un lien a-t-il la forme d'un jeton émis ? */
export function isTokenShaped(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Peut-on (r)envoyer un lien de confirmation à cette attente ?
 * Pure : la décision se teste sans base.
 */
export function canResendConfirmation(
  sub: { confirmSends?: number; confirmLastSentAt?: number },
  now: number,
): boolean {
  if ((sub.confirmSends ?? 0) >= CONFIRM_MAX_SENDS) return false;
  if (
    sub.confirmLastSentAt !== undefined &&
    now - sub.confirmLastSentAt < CONFIRM_RESEND_MIN_INTERVAL_MS
  ) {
    return false;
  }
  return true;
}
