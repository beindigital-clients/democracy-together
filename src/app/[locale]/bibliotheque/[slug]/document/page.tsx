import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isSupportedLocale } from '@/i18n/locale';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import type { Locale } from '@/i18n/routing';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { translationErrorSuffix } from '@/lib/article-translation';
import { vocabulary } from '@/i18n/vocabulary';
import { DocumentBlocks } from '@/components/library/document-blocks';
import { DocumentLanguagePicker } from '@/components/library/document-language-picker';
import { PrintButton } from '@/components/reports/print-button';

// DOCUMENT VIEW — the attached PDF, rebuilt in the reader's language.
//
// WHAT THIS PAGE IS, AND WHY IT IS NOT A PDF.
//
// The need: that a report submitted in French be readable and downloadable
// in Arabic, Spanish or Portuguese, images included. The obvious path —
// generating a PDF server-side — hits a wall that no JavaScript
// library gets past: Arabic typesetting. Arabic script requires
// the CONTEXTUAL form of letters (the same letter has up to four shapes
// depending on its position in the word) and Unicode's BIDIRECTIONAL algorithm. Neither
// pdf-lib nor jsPDF implements them: the text would come out as disconnected
// letters and in the wrong order. A browser engine, on the other hand, handles them
// without error, in all five languages.
//
// This page is therefore a DOCUMENT FORMATTED FOR PRINTING, which the
// reader saves as a PDF via their browser's feature. That was already the
// choice made for the annual reports (F-41, `src/components/reports/
// print-button.tsx`: "No server-side PDF generation: robust, no
// dependency") — here, it is moreover the only one that renders Arabic correctly.
//
// `noindex`: the document fully reproduces a PDF already indexable through its
// storage URL, and its translated versions are machine translations.
// Having them indexed would multiply by five content the network has not
// reviewed, and would compete with the publication page on its own terms.

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const WRAP = 'mx-auto w-full max-w-[820px] px-4 sm:px-6';

/**
 * The language requested for the document.
 *
 * `?lang=` takes precedence, and the fallback is the APPLICATION's language — that is the
 * explicit request: "by default, it will be the system language, the one they
 * chose in the application".
 */
function requestedLocale(
  raw: string | string[] | undefined,
  pageLocale: Locale,
): Locale {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSupportedLocale(value) ? value : pageLocale;
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const target = requestedLocale((await searchParams).lang, loc);

  const t = await getTranslations('translation');
  const tl = await getTranslations('library');

  // The session token goes with the request: Convex decides whether the
  // reader is allowed to see the full text of a restricted publication.
  // Gating is never client-side (F-35).
  const token = await convexAuthNextjsToken();
  const doc = await fetchOrFallback(
    'bibliotheque/[slug]/document',
    () =>
      fetchQuery(
        api.documents.getDocument,
        { slug, targetLocale: target },
        { token },
      ),
    null,
  );
  // `null`: unknown publication, without an attached document, or restricted to
  // members the reader is not one of. All three give the same response — a
  // 404 —, and this is intended: saying "this document exists but you are not
  // entitled to it" would reveal information about the restricted library's content.
  if (!doc) notFound();

  const ready = await fetchOrFallback(
    'bibliotheque/[slug]/document:langues',
    () => fetchQuery(api.documents.listDocumentLocales, { slug }, { token }),
    [] as Locale[],
  );

  const sourceName = vocabulary(tl, 'langs.', doc.sourceLocale);
  const isTranslated = doc.targetLocale !== doc.sourceLocale;

  return (
    <div className={`${WRAP} py-10 md:py-14`}>
      <nav className="text-[13px] text-muted print:hidden">
        <Link href="/bibliotheque" className="text-muted hover:text-ink">
          {tl('title')}
        </Link>{' '}
        /{' '}
        <Link
          href={`/bibliotheque/${slug}`}
          className="text-muted hover:text-ink"
        >
          {tl('detail.backToLibrary')}
        </Link>
      </nav>

      <div className="mt-4">
        <DocumentLanguagePicker slug={slug} current={target} ready={ready} />
      </div>

      {doc.status === 'ready' && doc.blocks ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
            <PrintButton label={t('docPrint')} />
            {doc.originalUrl ? (
              <a
                href={doc.originalUrl}
                className="text-[13.5px] text-accent-text underline underline-offset-2"
              >
                {t('docOriginalFile')}
              </a>
            ) : null}
          </div>

          {/* The banner is DELIBERATELY visible when printing: a document
              saved then passed on must keep saying where it comes from and
              that it has not been reviewed. It is the only thing on this page that
              survives the general `print:hidden`. */}
          {isTranslated ? (
            <aside className="mt-8 rounded-sm border border-accent-edge bg-accent-tint px-4 py-3 text-[13px] text-ink-soft print:border-line print:bg-transparent">
              <p>{t('docNotice', { language: sourceName })}</p>
              {doc.originalUrl ? (
                <p className="mt-1">
                  <a
                    href={doc.originalUrl}
                    className="text-accent-text underline underline-offset-2"
                  >
                    {t('docSourceLink')}
                  </a>
                  {doc.pageCount
                    ? ` · ${tl('detail.pages', { count: doc.pageCount })}`
                    : null}
                </p>
              ) : null}
            </aside>
          ) : null}

          <article className="mt-8">
            <h1
              lang={target}
              dir={direction(target)}
              className="dt-doc-title font-display text-[clamp(24px,3.4vw,34px)] font-medium leading-[1.15] text-ink"
            >
              {doc.title}
            </h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {LOCALE_ENDONYMS[target]}
            </p>
            <DocumentBlocks
              blocks={doc.blocks}
              imageUrls={doc.imageUrls}
              contentLocale={target}
              pageLocale={loc}
              figureFallback={t('docFigure', { n: '' }).trim()}
            />
          </article>
        </>
      ) : (
        <div className="mt-8 rounded-sm border border-line bg-surface px-5 py-6 print:hidden">
          {doc.status === 'failed' ? (
            <>
              <p className="text-[15px] text-ink">{t('failed')}</p>
              <p className="mt-1 text-[13.5px] text-muted">
                {vocabulary(
                  t,
                  'err',
                  translationErrorSuffix(doc.error),
                  t('errGeneric'),
                )}
              </p>
            </>
          ) : (
            // Neither ready nor failed: this version was never prepared (no
            // extraction for this file, or none in this language). It does not
            // mean "empty": an extraction without blocks fails instead
            // (`parseExtraction`), and lands in the branch above.
            <p className="text-[15px] text-ink-soft">{t('docPending')}</p>
          )}
          {doc.originalUrl ? (
            <p className="mt-3">
              <a
                href={doc.originalUrl}
                className="text-[13.5px] text-accent-text underline underline-offset-2"
              >
                {t('docOriginalFile')}
              </a>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
