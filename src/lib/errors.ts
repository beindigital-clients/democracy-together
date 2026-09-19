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

// Code applicatif porté par `ConvexError.data`, lu SANS `instanceof`.
//
// Les deux prédicats ci-dessus s'en contentent : leurs erreurs remontent par
// `useMutation` / `useAction` de `convex/react`, soit le même graphe de modules
// que ce fichier — la classe qui construit l'erreur EST celle importée ici.
//
// Les refus de mot de passe, eux, arrivent par `useAuthActions().signIn` de
// `@convex-dev/auth/react`, qui embarque son propre client Convex. Rien ne
// garantit que l'erreur soit alors une instance de CE `ConvexError`-ci, et
// `instanceof` peut rendre false sur une erreur pourtant parfaitement formée.
// C'est ce que l'E2E a attrapé (issue #25) : le serveur refusait bien
// « MotDePasse123 », mais l'interface affichait « Code invalide ou expiré » —
// exactement le message trompeur que ces prédicats devaient supprimer.
//
// `data` est le contrat entre le serveur et le client ; `instanceof` n'était
// qu'un moyen de l'atteindre, et un moyen qui dépend du bundler.
function convexErrorCode(error: unknown): string | null {
  const data = (error as { data?: unknown } | null | undefined)?.data;
  return typeof data === 'string' ? data : null;
}

// Mot de passe refusé par la politique du serveur
// (convex/lib/passwordPolicy.ts). Deux codes distincts parce que les deux refus
// n'appellent pas la même correction : allonger, ou changer d'idée.
export function isPasswordTooShort(error: unknown): boolean {
  return convexErrorCode(error) === 'PASSWORD_TOO_SHORT';
}

export function isPasswordTooCommon(error: unknown): boolean {
  return convexErrorCode(error) === 'PASSWORD_TOO_COMMON';
}
