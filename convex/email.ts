import { otpEmail, type OtpPurpose } from './lib/emailContent';
import type { SiteLocale } from './lib/locales';

// Le type reste exporté d'ici : `convex/otp.ts` l'importe, et le déplacer
// n'apporterait rien qu'un import de plus à changer.
export type { OtpPurpose };

// Adaptateur d'envoi GÉNÉRIQUE, volontairement isolé : c'est le SEUL point à
// changer pour passer de Resend à AWS SES (ou Scaleway/Brevo). Utilisé par l'OTP
// (auth) ET la newsletter. Sans clé fournisseur (dev/test) -> no-op (log) : on
// n'envoie jamais de vrai e-mail en local/CI.
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
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
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
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
