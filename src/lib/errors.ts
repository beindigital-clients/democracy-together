import { ConvexError } from 'convex/values';

// Détecte le dépassement de limite de débit renvoyé par le serveur
// (convex/lib/rateLimit.ts -> ConvexError('RATE_LIMITED')). `data` traverse
// jusqu'au client, contrairement au message d'un Error nu (masqué en prod).
export function isRateLimited(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'RATE_LIMITED';
}

// Échec de la vérification reCAPTCHA v3 renvoyée par l'action-portail
// (convex/lib/recaptcha.ts -> ConvexError('CAPTCHA_FAILED')). Même mécanique que
// RATE_LIMITED : `data` traverse jusqu'au client pour un message dédié.
export function isCaptchaFailed(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'CAPTCHA_FAILED';
}

// Mot de passe refusé par la politique du serveur
// (convex/lib/passwordPolicy.ts). Deux codes distincts parce que les deux
// refus n'appellent pas la même correction : allonger, ou changer d'idée.
// Sans eux, le parcours « mot de passe oublié » retomberait sur son message
// d'échec générique — « code invalide » — qui désignerait le mauvais coupable.
export function isPasswordTooShort(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'PASSWORD_TOO_SHORT';
}

export function isPasswordTooCommon(error: unknown): boolean {
  return error instanceof ConvexError && error.data === 'PASSWORD_TOO_COMMON';
}
