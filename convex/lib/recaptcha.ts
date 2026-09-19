import { ConvexError } from 'convex/values';

// Vérification reCAPTCHA v3 (sécurité — défense en profondeur) pour les
// endpoints PUBLICS non authentifiés (contact, newsletter, adhésion). Complète
// le rate-limit (clé e-mail usurpable, cf. lib/rateLimit.ts) par un signal
// « humain » difficile à falsifier : un score 0..1 calculé par Google.
//
// L'appel réseau (secret -> google.com/siteverify) ne peut vivre QUE dans une
// ACTION Convex (les mutations n'ont pas `fetch`). C'est pourquoi les
// formulaires publics passent par une action-portail qui vérifie le jeton puis
// délègue la logique métier à une internalMutation.
//
// CONFIG : RECAPTCHA_SECRET_KEY posée sur le déploiement Convex
// (`npx convex env set RECAPTCHA_SECRET_KEY ...`). Le secret ne transite JAMAIS
// par le navigateur — seule la clé de site (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) est
// publique côté Next.
//
// NO-OP GRACIEUX : sans secret (dev/CI/E2E), la vérification est désactivée et
// laisse passer (skipped) — comme sendEmail/AUTH_DEV_OTP. Aucune clé Google
// n'est donc requise pour développer ou faire tourner les tests.

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Seuil par défaut. Google recommande 0.5 : au-dessus = vraisemblablement
// humain, en dessous = trafic suspect. Réglable par appel selon la sensibilité.
const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaResult = {
  ok: boolean;
  skipped: boolean; // vérification désactivée (pas de secret) ou Google injoignable
  score?: number;
  reason?: string;
};

type VerifyOptions = {
  minScore?: number;
  remoteIp?: string;
};

// Réponse de l'API siteverify (champs utiles).
type SiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  ['error-codes']?: string[];
};

export async function verifyRecaptcha(
  token: string | undefined | null,
  expectedAction: string,
  opts: VerifyOptions = {},
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // Pas de secret -> vérification désactivée (dev/CI/E2E). On laisse passer :
  // le rate-limit et la validation serveur restent la défense de base. En prod,
  // c'est presque toujours une ERREUR de config (clé oubliée) : on le trace fort
  // pour que ça ne passe pas inaperçu (les rate-limits couvrent l'intérim).
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[recaptcha] RECAPTCHA_SECRET_KEY absent en production — vérification anti-bot DÉSACTIVÉE. Posez la clé : npx convex env set RECAPTCHA_SECRET_KEY ...',
      );
    }
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  // Secret présent mais jeton manquant -> rejet (fail-closed) : un client
  // légitime doit toujours fournir un jeton quand reCAPTCHA est activé.
  if (!token) return { ok: false, skipped: false, reason: 'missing-token' };

  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp);

  let data: SiteVerifyResponse;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    data = (await res.json()) as SiteVerifyResponse;
  } catch {
    // Google injoignable / réponse illisible -> FAIL-OPEN, mais tracé. Bloquer
    // toutes les soumissions parce qu'un tiers est momentanément down serait
    // pire que laisser passer : rate-limit + validation tiennent toujours.
    console.error(
      '[recaptcha] siteverify injoignable — laissé passer (fail-open)',
    );
    return { ok: true, skipped: true, reason: 'verify-unreachable' };
  }

  // À partir d'ici, on a une vraie réponse Google -> FAIL-CLOSED sur tout signal
  // négatif (jeton invalide/rejoué, mauvaise action, score trop bas).
  if (!data.success) {
    return {
      ok: false,
      skipped: false,
      reason: (data['error-codes'] ?? []).join(',') || 'verification-failed',
    };
  }

  // Anti-rejeu inter-formulaires : le jeton doit porter l'action attendue.
  if (typeof data.action === 'string' && data.action !== expectedAction) {
    return {
      ok: false,
      skipped: false,
      score: data.score,
      reason: 'action-mismatch',
    };
  }

  const score = typeof data.score === 'number' ? data.score : undefined;
  if (score !== undefined && score < minScore) {
    return { ok: false, skipped: false, score, reason: 'low-score' };
  }

  return { ok: true, skipped: false, score };
}

// Garde prête à l'emploi pour les actions-portail : vérifie puis lève une
// ConvexError('CAPTCHA_FAILED') si le verdict est négatif. `data` traverse
// jusqu'au client (comme RATE_LIMITED) pour un message dédié.
export async function enforceRecaptcha(
  token: string | undefined | null,
  expectedAction: string,
  opts: VerifyOptions = {},
): Promise<RecaptchaResult> {
  const verdict = await verifyRecaptcha(token, expectedAction, opts);
  if (!verdict.ok) {
    console.warn(`[recaptcha] rejet (${expectedAction}) : ${verdict.reason}`);
    throw new ConvexError('CAPTCHA_FAILED');
  }
  return verdict;
}
