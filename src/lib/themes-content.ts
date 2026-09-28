import type { Locale } from '@/i18n/routing';
// F-36 — Thematic summaries. Editorial content (the network's position) for
// each of the five work themes. The slugs mirror `PUB_THEMES`
// (src/lib/publications.ts): it is the key linking a summary to its
// publications (Convex `by_status_and_theme`), to its barometer sub-dimension
// and to the library/directory filters. Theme labels come from i18n
// (`library.themes.*`); here we only carry the summary text. Local bilingual
// module (same approach as `about-content.ts`), no invented data
// (positions and questions, no figures). Checked for banned terms.

// The summary text now lives in
// `convex/lib/contenus/coded/themes.ts`: the internal import copies it into
// `contentThemes`, and the pages serve it as a FALLBACK ("contenus" workstream).
import {
  CODED_THEMES,
  THEME_SLUGS,
  type ThemeSlug,
  type ThemeSynthesis,
} from '@convex/lib/contenus/coded/themes';
export { THEME_SLUGS };
export type { ThemeSlug, ThemeSynthesis };

// Exhaustive table by construction (see `projects-content.ts`).
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
