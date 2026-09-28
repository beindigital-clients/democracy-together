import { otpEmail, type OtpPurpose } from './lib/emailContent';
import type { SiteLocale } from './lib/locales';

// The type stays exported from here: `convex/otp.ts` imports it, and moving
// it would bring nothing but one more import to change.
export type { OtpPurpose };

// GENERIC sending adapter, deliberately isolated: it is the ONLY place to
// change to move from Resend to AWS SES (or Scaleway/Brevo). Used by the OTP
// (auth) AND the newsletter. Without a provider key (dev/test) -> no-op (log): we
// never send a real e-mail locally/in CI.
// Provider state, as `sendEmail` infers it — exposed so that the
// back office announces it BEFORE a send (campaign of 27/09, R-07: a campaign
// went out "Envoyée · 3 envoyés" without any provider existing).
//  - `configured`: a provider will answer;
//  - `simulated` : no provider, but AUTH_DEV_OTP=true — the send is
//    logged, not delivered (dev/test);
//  - `none`      : no provider, and the send will fail.
export type EmailProviderStatus = {
  provider: string;
  mode: 'configured' | 'simulated' | 'none';
};

export function emailProviderStatus(): EmailProviderStatus {
  const provider =
    process.env.AUTH_EMAIL_PROVIDER ??
    (process.env.AUTH_RESEND_KEY ? 'resend' : 'none');
  if (provider !== 'none') return { provider, mode: 'configured' };
  return {
    provider,
    mode: process.env.AUTH_DEV_OTP === 'true' ? 'simulated' : 'none',
  };
}

export async function sendEmail({
  to,
  subject,
  html,
  headers,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  // Additional headers (campaign List-Unsubscribe, F-65).
  headers?: Record<string, string>;
  // Provider idempotency key: a send retried with the same key does not
  // go out twice (Resend keeps it for 24 h).
  idempotencyKey?: string;
}) {
  const provider =
    process.env.AUTH_EMAIL_PROVIDER ??
    (process.env.AUTH_RESEND_KEY ? 'resend' : 'none');
  const from =
    process.env.AUTH_EMAIL_FROM ?? 'Democracy Together <onboarding@resend.dev>';

  if (provider === 'none') {
    // Fail-closed (audit H3): without a provider, we only SIMULATE a success in
    // explicit dev/test (AUTH_DEV_OTP=true). Elsewhere — hence in production —
    // we fail. A silently "successful" send is worse than an error:
    // campaigns marked `sent` with a wrong recipient counter, event reminders
    // marked as processed for good, and code sign-in impossible
    // without a single message. Callers already handle the
    // rejection (the newsletter counts failures, the reminder cron retries).
    if (process.env.AUTH_DEV_OTP === 'true') {
      console.log(`[DEV EMAIL] -> ${to} : ${subject}`);
      return;
    }
    throw new Error(
      'EMAIL_PROVIDER_NOT_CONFIGURED : aucun fournisseur e-mail. Définir AUTH_RESEND_KEY (ou AUTH_EMAIL_PROVIDER) sur le déploiement Convex, ou AUTH_DEV_OTP=true en développement.',
    );
  }

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(headers ? { headers } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`);
    }
    return;
  }

  // AWS SES (upcoming): add the `provider === 'ses'` branch here.
  throw new Error(
    `Fournisseur e-mail non supporté : ${provider}. Ajouter l'adaptateur (AWS SES…) dans convex/email.ts.`,
  );
}

// OTP (auth) — goes through the generic adapter.
//
// `locale` is REQUIRED, and that is deliberate: made optional, it would have
// let every caller silently fall back to French, which is
// exactly the defect being fixed. The compiler now forces us to state
// which language the recipient reads.
export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: OtpPurpose,
  locale: SiteLocale,
) {
  const { subject, html } = otpEmail(code, purpose, locale);
  await sendEmail({ to: email, subject, html });
}

// --- Bulk sending (F-65, diffusion workstream) --------------------------------
//
// Resend's "batch" API accepts up to 100 e-mails per call: a
// campaign to 5,000 subscribers goes out in 50 requests instead of 5,000, which
// stays under the provider's rate limit (2 requests/s by default) without
// spreading the send over hours. The other providers (and the simulated
// development mode) fall back to one-by-one sending.

export const RESEND_BATCH_MAX = 100;

export type BatchMessage = {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

export type BatchResult =
  { ok: true; id?: string } | { ok: false; error: string };

// TRANSIENT failure (rate, outage, network): we don't know whether the batch
// went out. The caller retries it with the SAME idempotency key, never with a
// new one — that is what prevents double sending.
export class TransientEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientEmailError';
  }
}

export async function sendEmailBatch(
  messages: BatchMessage[],
  idempotencyKey: string,
): Promise<BatchResult[]> {
  const provider =
    process.env.AUTH_EMAIL_PROVIDER ??
    (process.env.AUTH_RESEND_KEY ? 'resend' : 'none');
  if (messages.length === 0) return [];

  if (provider === 'resend') {
    if (messages.length > RESEND_BATCH_MAX) {
      throw new Error(`BATCH_TOO_LARGE (> ${RESEND_BATCH_MAX})`);
    }
    const from =
      process.env.AUTH_EMAIL_FROM ??
      'Democracy Together <onboarding@resend.dev>';
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(
          messages.map((m) => ({
            from,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            ...(m.headers ? { headers: m.headers } : {}),
          })),
        ),
      });
    } catch (err) {
      throw new TransientEmailError(
        `Resend injoignable : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (res.status === 429 || res.status >= 500) {
      throw new TransientEmailError(`Resend ${res.status}`);
    }
    if (!res.ok) {
      // PERMANENT rejection (invalid key, unverified domain, malformed batch):
      // the whole batch fails, and the reason is kept for the screen.
      const error = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
      return messages.map(() => ({ ok: false as const, error }));
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { id?: string }[];
    } | null;
    const ids = json?.data ?? [];
    return messages.map((_, i) => ({ ok: true as const, id: ids[i]?.id }));
  }

  // One-by-one sending: other providers, and simulated mode (AUTH_DEV_OTP).
  // `sendEmail` throws without a provider in production: each message then
  // fails, never counted as sent (audit H3).
  const out: BatchResult[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    try {
      await sendEmail({ ...m, idempotencyKey: `${idempotencyKey}:${i}` });
      out.push({ ok: true });
    } catch (err) {
      out.push({
        ok: false,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
      });
    }
  }
  return out;
}
