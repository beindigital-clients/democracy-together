import type { Locale } from '@/i18n/routing';
import {
  CODED_REPORTS,
  CODED_REPORT_YEARS,
  type CodedReport,
} from '@convex/lib/annualReportsCoded';

// F-41 — Rapports annuels, côté site.
//
// Les rapports ont désormais un modèle de données Convex, administré depuis
// `/admin/rapports` (convex/annualReports.ts). Le contenu CODÉ historique vit
// dans `convex/lib/annualReportsCoded.ts` — une seule copie, lue ici par
// l'alias `@convex` — et sert de REPLI : pour une année que la base ne
// connaît pas encore, les pages `/rapports` et `/rapports/<année>` rendent le
// contenu codé, à l'identique. Une année connue de la base (même dépubliée)
// n'est plus servie depuis le code : dépublier ne fait pas réapparaître
// l'ancienne version.

export type AnnualReport = CodedReport;

// Années codées (descendant).
export const REPORT_YEARS = CODED_REPORT_YEARS;

export function getReports(locale: Locale): AnnualReport[] {
  const table = CODED_REPORTS[locale];
  return [...REPORT_YEARS].sort((a, b) => b - a).map((y) => table[y]);
}

export function getReport(locale: Locale, year: number): AnnualReport | null {
  return CODED_REPORTS[locale][year] ?? null;
}

export type ReportListItem = {
  year: number;
  inaugural: boolean;
  title: string;
  intro: string;
};

/**
 * Liste publique : les éditions publiées en base, plus les éditions codées
 * que la base ne connaît pas. Ordre décroissant des années.
 */
export function mergeReportList(
  locale: Locale,
  fromDb: { reports: ReportListItem[]; knownYears: number[] },
): ReportListItem[] {
  const known = new Set(fromDb.knownYears);
  const coded = getReports(locale)
    .filter((r) => !known.has(r.year))
    .map((r) => ({
      year: r.year,
      inaugural: r.inaugural,
      title: r.title,
      intro: r.intro,
    }));
  return [...fromDb.reports, ...coded].sort((a, b) => b.year - a.year);
}

/** Années publiées — pour le plan du site. */
export function publicReportYears(fromDb: {
  reports: { year: number }[];
  knownYears: number[];
}): number[] {
  const known = new Set(fromDb.knownYears);
  return [
    ...new Set([
      ...fromDb.reports.map((r) => r.year),
      ...REPORT_YEARS.filter((y) => !known.has(y)),
    ]),
  ].sort((a, b) => b - a);
}

/** Nom du fichier PDF d'une édition : ASCII, stable, parlant. */
export function reportPdfFileName(year: number, locale: Locale): string {
  return `democracy-together-rapport-${year}-${locale}.pdf`;
}

/** Chemin (sans langue) de la route qui sert le PDF d'une édition. */
export function reportPdfPath(year: number): string {
  return `/rapports/${year}/rapport.pdf`;
}
