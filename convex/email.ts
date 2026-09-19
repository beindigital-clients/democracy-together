export type OtpPurpose = 'verification' | 'reset' | 'signin';

const SUBJECT: Record<OtpPurpose, string> = {
  verification: 'Vérifiez votre adresse e-mail · Democracy Together',
  reset: 'Réinitialisez votre mot de passe · Democracy Together',
  signin: 'Votre code de connexion · Democracy Together',
};

const INTRO: Record<OtpPurpose, string> = {
  verification: 'Confirmez votre adresse e-mail avec ce code :',
  reset: 'Voici votre code pour réinitialiser votre mot de passe :',
  signin: 'Voici votre code de connexion à usage unique :',
};

function htmlBody(code: string, purpose: OtpPurpose) {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#16191f">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">Democracy Together</h2>
    <p>${INTRO[purpose]}</p>
    <p style="font-size:30px;letter-spacing:8px;font-weight:600;font-family:monospace">${code}</p>
    <p style="color:#646771;font-size:13px">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
  </div>`;
}

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
export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: OtpPurpose,
) {
  await sendEmail({
    to: email,
    subject: SUBJECT[purpose],
    html: htmlBody(code, purpose),
  });
}
