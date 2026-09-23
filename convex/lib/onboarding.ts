// Onboarding des membres (F-01/F-22) — logique pure, testable.
//
// Contexte : le modèle d'adhésion est « validée » (pas d'auto-inscription). Le
// compte n'existe donc qu'à partir de l'approbation de la candidature. Comme le
// callback `createOrUpdateUser` de convex/auth.ts refuse tout e-mail inconnu,
// la SEULE chose qui rend un membre connectable est l'existence d'une ligne
// `users` portant son adresse — d'où l'importance de la normaliser exactement
// comme le fera la connexion.

import { REGIONS, DIRECTORY_THEMES } from './directory';
import { isHttpUrl } from './validation';

// Normalisation d'adresse : c'est le point de jonction entre la candidature
// (saisie à la main, casse et espaces quelconques) et la connexion (qui
// cherchera l'adresse telle que le fournisseur d'auth la présente). Une
// divergence ici, et le membre approuvé ne retrouve jamais son compte.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Champs d'annuaire fournis par le modérateur à l'approbation. La candidature
// ne collecte qu'un pays en texte libre ; l'annuaire (F-19) attend un code pays
// et un vocabulaire fermé de régions et de thématiques. C'est donc au
// modérateur de compléter — plutôt que de laisser le système deviner et
// publier une fiche fausse.
export type DirectoryFields = {
  countryCode: string;
  region: string;
  themes: string[];
  languages: string[];
  description?: string;
  websiteUrl?: string;
};

export type DirectoryValidation =
  { ok: true; value: DirectoryFields } | { ok: false; reason: string };

export function validateDirectoryFields(
  input: DirectoryFields,
): DirectoryValidation {
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return { ok: false, reason: 'INVALID_COUNTRY_CODE' };
  }
  if (!(REGIONS as readonly string[]).includes(input.region)) {
    return { ok: false, reason: 'INVALID_REGION' };
  }
  const themes = [...new Set(input.themes)];
  if (themes.length === 0) return { ok: false, reason: 'INVALID_THEMES' };
  if (
    !themes.every((t) => (DIRECTORY_THEMES as readonly string[]).includes(t))
  ) {
    return { ok: false, reason: 'INVALID_THEMES' };
  }
  const languages = [...new Set(input.languages)].filter(Boolean);
  if (languages.length === 0) return { ok: false, reason: 'INVALID_LANGUAGES' };

  // Le champ « site web » finit dans un `href` de page publique (pentest
  // M-9) : le schéma est contraint ICI, à l'entrée, et pas seulement au
  // rendu. Vide reste vide — l'adresse est facultative.
  const websiteUrl = input.websiteUrl?.trim() || undefined;
  if (websiteUrl !== undefined && !isHttpUrl(websiteUrl)) {
    return { ok: false, reason: 'INVALID_WEBSITE' };
  }

  return {
    ok: true,
    value: {
      countryCode,
      region: input.region,
      themes,
      languages,
      description: input.description?.trim() || undefined,
      websiteUrl,
    },
  };
}

// Corps de l'e-mail d'invitation. Le membre n'a PAS de mot de passe : on
// l'oriente vers la connexion par code à usage unique, qui fonctionne dès lors
// que son compte existe.
export function invitationEmail(args: {
  organizationName?: string;
  siteUrl: string;
}): { subject: string; html: string } {
  const signInUrl = `${args.siteUrl.replace(/\/+$/, '')}/fr/connexion-otp`;
  // Deux origines possibles : l'approbation d'une candidature, ou l'ouverture
  // d'un compte par un administrateur depuis le back-office.
  const intro = args.organizationName
    ? `<p>La candidature de <b>${escapeHtml(args.organizationName)}</b> a été validée par le secrétariat. Votre compte est désormais actif.</p>`
    : '<p>Un compte vous a été ouvert sur la plateforme Democracy Together.</p>';
  return {
    subject: args.organizationName
      ? 'Votre adhésion est validée · Democracy Together'
      : 'Votre compte Democracy Together',
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#16191f">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">Democracy Together</h2>
    <p>Bonjour,</p>
    ${intro}
    <p>Pour vous connecter, demandez un code à usage unique à cette adresse e-mail :</p>
    <p><a href="${signInUrl}" style="display:inline-block;background:#1f3d6e;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600">Se connecter</a></p>
    <p style="color:#646771;font-size:13px">Aucun mot de passe n'est nécessaire : un code vous sera envoyé à chaque connexion. Vous pourrez en définir un depuis votre espace membre.</p>
  </div>`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
