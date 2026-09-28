import type { SiteLocale } from '../locales';

// Libellés de l'HABILLAGE du PDF des rapports annuels (F-41) — ceux que le
// rédacteur ne saisit pas : sur-titre, pastille d'édition inaugurale, titre du
// bloc de chiffres clés, pagination.
//
// Pourquoi ici et pas dans `src/messages` : le PDF est composé par une action
// Convex, qui n'a pas le catalogue next-intl — même contrainte, et même
// réponse, que les e-mails transactionnels (`convex/lib/emailContent.ts`).
// Le contenu éditorial, lui, vient de la base, dans la langue du PDF.
// `convex/lib/reportPdf/labels.test.ts` vérifie que les cinq langues sont
// complètes et que la pagination porte ses deux marqueurs.

export type ReportPdfLabels = {
  /** Sur-titre de la page de garde, suivi de l'année. */
  eyebrow: string;
  inaugural: string;
  keyFigures: string;
  /** Pagination : `{page}` et `{total}` sont remplacés. */
  pageOf: string;
  /** Nom de l'éditeur, inscrit comme auteur du PDF. */
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
