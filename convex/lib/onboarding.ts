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

// Le corps de l'e-mail d'invitation vit désormais dans `lib/emailContent.ts`,
// avec les autres courriels transactionnels et leurs cinq langues. Il est
// ré-exporté d'ici pour que les deux appelants (approbation d'une candidature,
// ouverture d'un compte par un administrateur) n'aient pas à changer d'import.
export { invitationEmail } from './emailContent';
