// Display helpers for the directory (F-19/F-21). Countries and languages are
// stored as codes (ISO 3166-1 alpha-2 / ISO 639) in Convex and rendered in the
// current language via Intl.DisplayNames — no translation table to maintain.

export type Facet = { value: string; count: number };

export type Facets = {
  regions: Facet[];
  themes: Facet[];
  countries: Facet[];
  languages: Facet[];
};

export type DirectoryFilters = {
  region?: string;
  theme?: string;
  // ISO codes (alpha-2 country, 639-1 language), lowercase in the URL.
  country?: string;
  language?: string;
  q?: string;
};

export function countryName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'region' }).of(
        code.toUpperCase(),
      ) ?? code
    );
  } catch {
    return code;
  }
}

export function languageName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

// Emoji flag from an ISO alpha-2 country code (regional indicators) —
// lightweight, no image to load (consistent with the low-bandwidth goal, F-05).
export function countryFlag(code: string): string {
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
