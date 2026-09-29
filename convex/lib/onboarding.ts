// Member onboarding (F-01/F-22) — pure, testable logic.
//
// Context: the membership model is "approved" (no self-registration). The
// account therefore only exists once the application is approved. Since the
// `createOrUpdateUser` callback in convex/auth.ts refuses any unknown e-mail,
// the ONLY thing that makes a member able to sign in is the existence of a
// `users` row carrying their address — hence the importance of normalizing it
// exactly as sign-in will.

import { REGIONS, DIRECTORY_THEMES } from './directory';
import { isHttpUrl } from './validation';

// Address normalization: it is the junction point between the application
// (typed by hand, arbitrary case and spaces) and sign-in (which
// will look up the address as the auth provider presents it). A
// divergence here, and the approved member never finds their account. The
// sign-in screens (connexion, connexion-otp, mot-de-passe-oublie) apply this
// very function to what is typed.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Directory fields supplied by the moderator at approval. The application
// only collects a free-text country; the directory (F-19) expects a country code
// and a closed vocabulary of regions and themes. It is therefore up to the
// moderator to fill them in — rather than letting the system guess and
// publish a wrong profile.
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

  // The "site web" field ends up in an `href` on a public page (pentest
  // M-9): the scheme is constrained HERE, on input, and not only at
  // render. Empty stays empty — the address is optional.
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

// The body of the invitation e-mail now lives in `lib/emailContent.ts`,
// with the other transactional e-mails and their five languages. It is
// re-exported from here so that the two callers (approving an application,
// an administrator opening an account) don't have to change their import.
export { invitationEmail } from './emailContent';
