import type { Locale } from '@/i18n/routing';
import {
  CODED_REPORTS,
  CODED_REPORT_YEARS,
  type CodedReport,
} from '@convex/lib/annualReportsCoded';

// F-41 — Annual reports, site side.
//
// Reports now have a Convex data model, managed from `/admin/rapports`
// (convex/annualReports.ts). The historical HARD-CODED content lives in
// `convex/lib/annualReportsCoded.ts` — a single copy, read here through the
// `@convex` alias — and serves as a FALLBACK: for a year the database does
// not know yet, the `/rapports` and `/rapports/<année>` pages render the
// hard-coded content, identically. A year known to the database (even
// unpublished) is no longer served from the code: unpublishing does not make
// the old version reappear.

export type AnnualReport = CodedReport;

// Hard-coded years (descending).
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
 * Public list: the editions published in the database, plus the hard-coded
 * editions the database does not know. Descending order of years.
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

/** Published years — for the sitemap. */
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

/** File name of an edition's PDF: ASCII, stable, meaningful. */
export function reportPdfFileName(year: number, locale: Locale): string {
  return `democracy-together-rapport-${year}-${locale}.pdf`;
}

/** Path (without locale) of the route that serves an edition's PDF. */
export function reportPdfPath(year: number): string {
  return `/rapports/${year}/rapport.pdf`;
}
