import type { SiteLocale } from '../locales';

// Labels for the FRAME of the annual report PDF (F-41) — the ones the editor
// does not enter: kicker, inaugural edition badge, key figures block title,
// pagination.
//
// Why here and not in `src/messages`: the PDF is composed by a Convex action,
// which does not have the next-intl catalogue — same constraint, and same
// answer, as the transactional e-mails (`convex/lib/emailContent.ts`).
// The editorial content, on the other hand, comes from the database, in the
// PDF's language.
// `convex/lib/reportPdf/labels.test.ts` checks that the five languages are
// complete and that the pagination carries its two markers.

export type ReportPdfLabels = {
  /** Cover page kicker, followed by the year. */
  eyebrow: string;
  inaugural: string;
  keyFigures: string;
  /** Pagination: `{page}` and `{total}` are replaced. */
  pageOf: string;
  /** Publisher name, recorded as the PDF's author. */
  publisher: string;
};

export const REPORT_PDF_LABELS: Record<SiteLocale, ReportPdfLabels> = {
  fr: {
    eyebrow: 'Rapport annuel',
    inaugural: 'Édition inaugurale',
    keyFigures: 'Chiffres clés',
    pageOf: 'Page {page} sur {total}',
    publisher: 'Democracy Together',
  },
  en: {
    eyebrow: 'Annual report',
    inaugural: 'Inaugural edition',
    keyFigures: 'Key figures',
    pageOf: 'Page {page} of {total}',
    publisher: 'Democracy Together',
  },
  es: {
    eyebrow: 'Informe anual',
    inaugural: 'Edición inaugural',
    keyFigures: 'Cifras clave',
    pageOf: 'Página {page} de {total}',
    publisher: 'Democracy Together',
  },
  pt: {
    eyebrow: 'Relatório anual',
    inaugural: 'Edição inaugural',
    keyFigures: 'Números-chave',
    pageOf: 'Página {page} de {total}',
    publisher: 'Democracy Together',
  },
  ar: {
    eyebrow: 'التقرير السنوي',
    inaugural: 'الإصدار الافتتاحي',
    keyFigures: 'أرقام رئيسية',
    pageOf: 'الصفحة {page} من {total}',
    publisher: 'Democracy Together',
  },
};

export function pageLabel(
  labels: ReportPdfLabels,
  page: number,
  total: number,
): string {
  return labels.pageOf
    .replace('{page}', String(page))
    .replace('{total}', String(total));
}
