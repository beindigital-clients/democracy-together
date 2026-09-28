import { otpEmail, type OtpPurpose } from './lib/emailContent';
import type { SiteLocale } from './lib/locales';

// Le type reste exporté d'ici : `convex/otp.ts` l'importe, et le déplacer
// n'apporterait rien qu'un import de plus à changer.
export type { OtpPurpose };

// Adaptateur d'envoi GÉNÉRIQUE, volontairement isolé : c'est le SEUL point à
// changer pour passer de Resend à AWS SES (ou Scaleway/Brevo). Utilisé par l'OTP
// (auth) ET la newsletter. Sans clé fournisseur (dev/test) -> no-op (log) : on
// n'envoie jamais de vrai e-mail en local/CI.
// État du fournisseur, tel que `sendEmail` le déduit — exposé pour que le
// back-office l'annonce AVANT un envoi (campagne du 27/09, R-07 : une campagne
// partait « Envoyée · 3 envoyés » sans qu'aucun fournisseur n'existe).
//  - `configured` : un fournisseur répondra ;
//  - `simulated`  : aucun fournisseur, mais AUTH_DEV_OTP=true — l'envoi est
//    journalisé, pas livré (dev/test) ;
//  - `none`       : aucun fournisseur, et l'envoi échouera.
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
  // En-têtes additionnels (List-Unsubscribe des campagnes, F-65).
  headers?: Record<string, string>;
  // Clé d'idempotence du fournisseur : un envoi repris avec la même clé ne
  // part pas deux fois (Resend la garde 24 h).
  idempotencyKey?: string;
}) {
  const provider =
    process.env.AUTH_EMAIL_PROVIDER ??
    (process.env.AUTH_RESEND_KEY ? 'resend' : 'none');
  const from =
    process.env.AUTH_EMAIL_FROM ?? 'Democracy Together <onboarding@resend.dev>';

  if (provider === 'none') {
    // Fail-closed (audit H3) : sans fournisseur, on ne SIMULE un succès qu'en
    // dev/test explicite (AUTH_DEV_OTP=true). Ailleurs — donc en production —
    // on échoue. Un envoi silencieusement « réussi » est pire qu'une erreur :
    // campagnes marquées `sent` avec un compteur de destinataires faux, rappels
    // d'événement marqués traités définitivement, et connexion par code
    // impossible sans le moindre message. Les appelants savent déjà gérer le
    // rejet (newsletter compte les échecs, le cron de rappels retente).
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

  // AWS SES (à venir) : ajouter ici la branche `provider === 'ses'`.
  throw new Error(
    `Fournisseur e-mail non supporté : ${provider}. Ajouter l'adaptateur (AWS SES…) dans convex/email.ts.`,
  );
}

// OTP (auth) — passe par l'adaptateur générique.
//
// `locale` est OBLIGATOIRE, et c'est délibéré : rendue optionnelle, elle aurait
// laissé chaque appelant retomber en silence sur le français, ce qui est
// exactement le défaut qu'on corrige. Le compilateur oblige désormais à dire
// dans quelle langue le destinataire lit.
export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: OtpPurpose,
  locale: SiteLocale,
) {
  const { subject, html } = otpEmail(code, purpose, locale);
  await sendEmail({ to: email, subject, html });
}

// --- Envoi en volume (F-65, chantier diffusion) -------------------------------
//
// L'API « batch » de Resend accepte jusqu'à 100 courriels par appel : une
// campagne de 5 000 abonnés part en 50 requêtes au lieu de 5 000, ce qui tient
// sous la limite de débit du fournisseur (2 requêtes/s par défaut) sans
// étaler l'envoi sur des heures. Les autres fournisseurs (et le mode simulé de
// développement) retombent sur l'envoi unitaire.

export const RESEND_BATCH_MAX = 100;

export type BatchMessage = {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

export type BatchResult =
  { ok: true; id?: string } | { ok: false; error: string };

// Échec TRANSITOIRE (débit, panne, réseau) : on ne sait pas si le lot est
// parti. L'appelant le retente avec la MÊME clé d'idempotence, jamais avec une
// nouvelle — c'est ce qui empêche le double envoi.
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
      // Refus DÉFINITIF (clé invalide, domaine non vérifié, lot mal formé) :
      // tout le lot est en échec, et le motif est gardé pour l'écran.
      const error = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
      return messages.map(() => ({ ok: false as const, error }));
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { id?: string }[];
    } | null;
    const ids = json?.data ?? [];
    return messages.map((_, i) => ({ ok: true as const, id: ids[i]?.id }));
  }

  // Envoi unitaire : autres fournisseurs, et mode simulé (AUTH_DEV_OTP).
  // `sendEmail` lève sans fournisseur en production : chaque message est
  // alors en échec, jamais compté comme envoyé (audit H3).
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
