import type { Locale } from '@/i18n/routing';
// F-36 — Synthèses thématiques. Contenu éditorial (la position du réseau) pour
// chacun des cinq axes de travail. Les slugs sont le miroir de `PUB_THEMES`
// (src/lib/publications.ts) : c'est la clé qui relie une synthèse à ses
// publications (Convex `by_status_and_theme`), à sa sous-dimension du baromètre
// et aux filtres bibliothèque/annuaire. Les libellés d'axe viennent de l'i18n
// (`library.themes.*`) ; ici on porte uniquement le texte de synthèse. Module
// local bilingue (même approche que `about-content.ts`), pas de donnée inventée
// (positions et questions, pas de chiffres). Vérifié sans terme banni.

// Le texte des synthèses vit désormais dans
// `convex/lib/contenus/coded/themes.ts` : l'import interne le recopie dans
// `contentThemes`, et les pages le servent en REPLI (chantier « contenus »).
import {
  CODED_THEMES,
  THEME_SLUGS,
  type ThemeSlug,
  type ThemeSynthesis,
} from '@convex/lib/contenus/coded/themes';
export { THEME_SLUGS };
export type { ThemeSlug, ThemeSynthesis };

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<
  Locale,
  Record<ThemeSlug, ThemeSynthesis>
> = CODED_THEMES;

export function getThemeSyntheses(locale: Locale): ThemeSynthesis[] {
  const table = BY_LOCALE[locale];
  return THEME_SLUGS.map((s) => table[s]);
}

export function getThemeSynthesis(
  locale: Locale,
  slug: string,
): ThemeSynthesis | null {
  const table = BY_LOCALE[locale];
  return (THEME_SLUGS as readonly string[]).includes(slug)
    ? table[slug as ThemeSlug]
    : null;
}
