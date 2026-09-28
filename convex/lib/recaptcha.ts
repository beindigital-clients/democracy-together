import { ConvexError } from 'convex/values';

// reCAPTCHA v3 verification (security — defence in depth) for PUBLIC
// unauthenticated endpoints (contact, newsletter, membership). Complements
// the caps in lib/rateLimit.ts with a "human" signal that is hard to fake: a
// 0..1 score computed by Google.
//
// The network call (secret -> google.com/siteverify) can ONLY live in a
// Convex ACTION (mutations do not have `fetch`). That is why public forms go
// through a gateway action that verifies the token then delegates the
// business logic to an internalMutation.
//
// CONFIG: RECAPTCHA_SECRET_KEY set on the Convex deployment
// (`npx convex env set RECAPTCHA_SECRET_KEY ...`). The secret NEVER passes
// through the browser — only the site key (NEXT_PUBLIC_RECAPTCHA_SITE_KEY) is
// public on the Next side.
//
// FAIL-CLOSED (audit M2, issue #24): without a secret, verification FAILS.
// It used to let requests through, on the grounds that "the rate limit
// remains the baseline defence" — except that this rate limit was keyed on
// the form's e-mail, hence forgeable: varying the address yielded a fresh
// quota. A key forgotten in production must be a visible outage, not a
// silently missing protection.
//
// EXPLICIT BYPASS: RECAPTCHA_DISABLED=true — a DEDICATED variable, not the
// absence of a key. Same mechanism as sendEmail/AUTH_DEV_OTP
// (convex/email.ts): development, CI and E2E set it, production never does.
// The two states ("not configured yet" and "deliberately disabled") thus stop
// being indistinguishable.

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Default threshold. Google recommends 0.5: above = probably human, below =
// suspicious traffic. Adjustable per call depending on sensitivity.
const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaResult = {
  ok: boolean;
  skipped: boolean; // verification bypassed (RECAPTCHA_DISABLED) or Google unreachable
  score?: number;
  reason?: string;
};

type VerifyOptions = {
  minScore?: number;
  remoteIp?: string;
};

// siteverify API response (useful fields).
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
  // REQUESTED bypass (dev/CI/E2E): the only path that lets requests through
  // without verifying. Checked BEFORE the key, so that "disabled" means
  // disabled whatever the deployment's Google configuration.
  if (process.env.RECAPTCHA_DISABLED === 'true') {
    // THE ALARM COULD NOT DISTINGUISH WHAT IT CLAIMED TO DISTINGUISH.
    //
    // It tested `NODE_ENV === 'production'`. But Convex runs functions with that
    // value on ALL its deployments, development included: measured on 26/09 on
    // `dev:…`, which printed "in PRODUCTION" during a local E2E campaign. It
    // therefore shouted everywhere the bypass is set LEGITIMATELY — a dev
    // deployment, and every CI preview, since `e2e.yml` sets it there on purpose.
    //
    // The cost is not the noise: it is that a real configuration error in
    // production would have produced EXACTLY the line everyone had learned to
    // ignore. An alarm that always rings no longer says anything.
    //
    // `AUTH_DEV_OTP` is the marker this repo already has. The deployment docs
    // forbid it in production in the same terms as this variable, and its only
    // two legitimate places are the same: local dev and CI previews. A deployment
    // that bypasses reCAPTCHA WITHOUT it is therefore, by this repo's rules,
    // neither of the two.
    //
    // The direction of the error is intended: a dev deployment that forgot
    // `AUTH_DEV_OTP` triggers the alarm. A safeguard errs on the side of warning,
    // never on the side of staying silent.
    if (process.env.AUTH_DEV_OTP !== 'true') {
      console.error(
        '[recaptcha] RECAPTCHA_DISABLED=true hors dev/préversion — vérification anti-bot volontairement désactivée. Retirez la variable : npx convex env remove RECAPTCHA_DISABLED',
      );
    }
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // Neither key nor bypass -> REJECT. It is a configuration error, not an
  // operating mode: we make it loud (the message says exactly what to set)
  // rather than silently opening the seven public forms.
  if (!secret) {
    console.error(
      '[recaptcha] RECAPTCHA_SECRET_KEY absent — soumission REJETÉE. Posez la clé (npx convex env set RECAPTCHA_SECRET_KEY ...) ou, en développement/CI uniquement, npx convex env set RECAPTCHA_DISABLED true',
    );
    return { ok: false, skipped: false, reason: 'not-configured' };
  }

  // Secret present but token missing -> reject (fail-closed): a legitimate
  // client must always provide a token when reCAPTCHA is enabled.
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
    // Google unreachable / unreadable response -> FAIL-OPEN, but logged. Blocking
    // every submission because a third party is momentarily down would be worse
    // than letting them through — and the interim is now genuinely covered: the
    // per-IP and per-form caps in lib/rateLimit.ts depend on no data supplied by
    // the caller, so a Google outage no longer makes flooding unlimited.
    console.error(
      '[recaptcha] siteverify injoignable — laissé passer (fail-open)',
    );
    return { ok: true, skipped: true, reason: 'verify-unreachable' };
  }

  // From here on, we have a real Google response -> FAIL-CLOSED on any negative
  // signal (invalid/replayed token, wrong action, score too low).
  if (!data.success) {
    return {
      ok: false,
      skipped: false,
      reason: (data['error-codes'] ?? []).join(',') || 'verification-failed',
    };
  }

  // Cross-form anti-replay: the token must carry the expected action.
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

// Ready-to-use guard for gateway actions: verifies then throws a
// ConvexError('CAPTCHA_FAILED') if the verdict is negative. `data` reaches
// the client (like RATE_LIMITED) for a dedicated message.
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
