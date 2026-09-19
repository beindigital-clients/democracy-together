// Helpers d'affichage de l'annuaire (F-19/F-21). Les pays et langues sont
// stockés en codes (ISO 3166-1 alpha-2 / ISO 639) côté Convex et rendus dans la
// langue courante via Intl.DisplayNames — aucune table de traduction à tenir.

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

// Drapeau emoji depuis un code pays ISO alpha-2 (indicateurs régionaux) —
// léger, pas d'image à charger (cohérent avec l'objectif faible débit, F-05).
export function countryFlag(code: string): string {
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
