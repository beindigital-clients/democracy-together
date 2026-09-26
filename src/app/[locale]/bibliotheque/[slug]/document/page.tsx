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

// VUE DOCUMENT — le PDF joint, reconstruit dans la langue du lecteur.
//
// CE QUE CETTE PAGE EST, ET POURQUOI ELLE N'EST PAS UN PDF.
//
// Le besoin : qu'un rapport déposé en français soit lisible et téléchargeable
// en arabe, en espagnol ou en portugais, images comprises. La voie évidente —
// générer un PDF côté serveur — se heurte à un mur qu'aucune bibliothèque
// JavaScript ne franchit : la composition de l'arabe. L'écriture arabe demande
// la forme CONTEXTUELLE des lettres (une même lettre a jusqu'à quatre dessins
// selon sa place dans le mot) et l'algorithme BIDIRECTIONNEL d'Unicode. Ni
// pdf-lib ni jsPDF ne les implémentent : le texte en sortirait en lettres
// détachées et dans le mauvais ordre. Un moteur de navigateur, lui, les fait
// sans erreur, dans les cinq langues.
//
// Cette page est donc un DOCUMENT MIS EN FORME POUR L'IMPRESSION, que le
// lecteur enregistre en PDF par la fonction de son navigateur. C'est déjà le
// choix fait pour les rapports annuels (F-41, `src/components/reports/
// print-button.tsx` : « Pas de génération PDF serveur : robuste, sans
// dépendance ») — ici, il est en plus le seul qui rende l'arabe correctement.
//
// `noindex` : le document reprend intégralement un PDF déjà indexable par son
// URL de stockage, et ses versions traduites sont des traductions automatiques.
// Les faire indexer multiplierait par cinq un contenu que le réseau n'a pas
// relu, et concurrencerait la fiche de publication sur ses propres termes.

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const WRAP = 'mx-auto w-full max-w-[820px] px-4 sm:px-6';

/**
 * La langue demandée pour le document.
 *
 * `?lang=` prime, et le repli est la langue de l'APPLICATION — c'est la
 * demande explicite : « par défaut, ce sera la langue du système, celle qu'ils
 * ont choisie dans l'application ».
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

  // Le jeton de session part avec la requête : c'est Convex qui décide si le
  // lecteur a le droit de voir le texte intégral d'une publication réservée.
  // Le gating n'est jamais côté client (F-35).
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
  // `null` : publication inconnue, sans document joint, ou réservée à des
  // membres dont le lecteur n'est pas. Les trois donnent la même réponse — une
  // 404 —, et c'est voulu : dire « ce document existe mais vous n'y avez pas
  // droit » renseignerait sur le contenu de la bibliothèque réservée.
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

          {/* Le bandeau est VOLONTAIREMENT visible à l'impression : un document
              enregistré puis transmis doit continuer à dire d'où il vient et
              qu'il n'a pas été relu. C'est la seule chose de cette page qui
              survive au `print:hidden` général. */}
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
            <p className="text-[15px] text-ink-soft">{t('docEmpty')}</p>
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
