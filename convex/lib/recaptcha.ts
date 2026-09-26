import { ConvexError } from 'convex/values';

// Vérification reCAPTCHA v3 (sécurité — défense en profondeur) pour les
// endpoints PUBLICS non authentifiés (contact, newsletter, adhésion). Complète
// les plafonds de lib/rateLimit.ts par un signal « humain » difficile à
// falsifier : un score 0..1 calculé par Google.
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
// FAIL-CLOSED (audit M2, issue #24) : sans secret, la vérification ÉCHOUE.
// Auparavant elle laissait passer, au motif que « le rate-limit reste la
// défense de base » — sauf que ce rate-limit était indexé sur l'e-mail du
// formulaire, donc forgeable : faire varier l'adresse rendait un quota neuf.
// Une clé oubliée en production doit être une panne visible, pas une protection
// silencieusement absente.
//
// CONTOURNEMENT EXPLICITE : RECAPTCHA_DISABLED=true — une variable DÉDIÉE, et
// non l'absence de clé. Même mécanique que sendEmail/AUTH_DEV_OTP
// (convex/email.ts) : le développement, la CI et les E2E la posent, la
// production ne la pose jamais. Les deux états (« pas encore configuré » et
// « volontairement désactivé ») cessent ainsi d'être indiscernables.

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Seuil par défaut. Google recommande 0.5 : au-dessus = vraisemblablement
// humain, en dessous = trafic suspect. Réglable par appel selon la sensibilité.
const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaResult = {
  ok: boolean;
  skipped: boolean; // vérification contournée (RECAPTCHA_DISABLED) ou Google injoignable
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
  // Contournement DEMANDÉ (dev/CI/E2E) : seul chemin qui laisse passer sans
  // vérifier. Testé AVANT la clé, pour que « désactivé » veuille dire désactivé
  // quelle que soit la configuration Google du déploiement.
  if (process.env.RECAPTCHA_DISABLED === 'true') {
    // L'ALARME NE POUVAIT PAS DISTINGUER CE QU'ELLE PRÉTENDAIT DISTINGUER.
    //
    // Elle testait `NODE_ENV === 'production'`. Or Convex exécute les fonctions
    // avec cette valeur sur TOUS ses déploiements, développement compris :
    // mesuré le 26/09 sur `dev:…`, qui a imprimé « en PRODUCTION » pendant une
    // campagne E2E locale. Elle criait donc partout où le contournement est
    // posé LÉGITIMEMENT — un déploiement de dev, et chaque préversion de CI,
    // puisque `e2e.yml` l'y pose exprès.
    //
    // Le coût n'est pas le bruit : c'est qu'une vraie erreur de configuration
    // en production aurait produit EXACTEMENT la ligne que tout le monde a
    // appris à ignorer. Une alarme qui sonne toujours ne dit plus rien.
    //
    // `AUTH_DEV_OTP` est le marqueur que ce dépôt possède déjà. La doc de
    // déploiement lui interdit la production dans les mêmes termes qu'à cette
    // variable-ci, et ses deux seuls lieux légitimes sont les mêmes : le dev
    // local et les préversions de CI. Un déploiement qui contourne reCAPTCHA
    // SANS lui n'est donc, selon les règles de ce dépôt, aucun des deux.
    //
    // Le sens de l'erreur est voulu : un déploiement de dev qui aurait oublié
    // `AUTH_DEV_OTP` déclenche l'alarme. Un garde-fou se trompe du côté où il
    // avertit, jamais du côté où il se tait.
    if (process.env.AUTH_DEV_OTP !== 'true') {
      console.error(
        '[recaptcha] RECAPTCHA_DISABLED=true hors dev/préversion — vérification anti-bot volontairement désactivée. Retirez la variable : npx convex env remove RECAPTCHA_DISABLED',
      );
    }
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // Ni clé, ni contournement -> REJET. C'est une erreur de configuration, pas
  // un mode de fonctionnement : on la rend bruyante (le message dit exactement
  // quoi poser) plutôt que d'ouvrir les sept formulaires publics en silence.
  if (!secret) {
    console.error(
      '[recaptcha] RECAPTCHA_SECRET_KEY absent — soumission REJETÉE. Posez la clé (npx convex env set RECAPTCHA_SECRET_KEY ...) ou, en développement/CI uniquement, npx convex env set RECAPTCHA_DISABLED true',
    );
    return { ok: false, skipped: false, reason: 'not-configured' };
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
    // pire que laisser passer — et l'intérim est désormais réellement couvert :
    // les plafonds par IP et par formulaire de lib/rateLimit.ts ne dépendent
    // d'aucune donnée fournie par l'appelant, donc une panne de Google ne rend
    // plus le remplissage illimité.
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
