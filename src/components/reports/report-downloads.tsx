import { getTranslations } from 'next-intl/server';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS } from '@/i18n/direction';
import { intlLocale } from '@/i18n/locale';
import { reportPdfFileName, reportPdfPath } from '@/lib/reports-content';
import { PrintButton } from './print-button';

// F-41 — "Télécharger le PDF" for an annual report. SERVER component: a
// link to the site route that serves the PDF composed and stored in Convex
// (`/[locale]/rapports/[année]/rapport.pdf`), with its size, page
// count and language — what one wants to know before downloading on a
// slow connection. The other available languages follow, each in its own
// language (`lang`, `hrefLang`).
//
// Without a composed PDF for this language (edition still served from the hard-coded
// content, or composition in progress after a correction), the browser's
// print dialog is still offered.

export type ReportPdfInfo = { locale: Locale; size: number; pages: number };

export async function ReportDownloads({
  year,
  locale,
  pdfs,
}: {
  year: number;
  locale: Locale;
  pdfs: ReportPdfInfo[];
}) {
  const t = await getTranslations('reports');
  const kb = new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  });
  const size = (bytes: number) =>
    kb.format(Math.max(1, Math.round(bytes / 1024)));
  const own = pdfs.find((p) => p.locale === locale);
  const others = routing.locales
    .map((l) => pdfs.find((p) => p.locale === l))
    .filter((p): p is ReportPdfInfo => p !== undefined && p.locale !== locale);

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {own ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={`/${locale}${reportPdfPath(year)}`}
            download={reportPdfFileName(year, locale)}
            type="application/pdf"
            className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
          >
            {t('downloadPdf')}
          </a>
          <span className="text-sm text-muted">
            {t('pdfMeta', {
              size: size(own.size),
              pages: own.pages,
              language: LOCALE_ENDONYMS[locale],
            })}
          </span>
        </div>
      ) : (
        <div>
          <PrintButton label={t('download')} />
          <p className="mt-2 text-sm text-muted">{t('pdfUnavailable')}</p>
        </div>
      )}
      {others.length > 0 ? (
        <p className="text-sm text-ink-soft">
          {t('otherLanguages')}{' '}
          {others.map((p, i) => (
            <span key={p.locale}>
              {i > 0 ? ' · ' : null}
              <a
                href={`/${p.locale}${reportPdfPath(year)}`}
                download={reportPdfFileName(year, p.locale)}
                hrefLang={p.locale}
                lang={p.locale}
                className="inline-block py-1 font-medium text-accent-text hover:underline"
              >
                {LOCALE_ENDONYMS[p.locale]}
              </a>{' '}
              <span className="text-muted">({size(p.size)})</span>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
