import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { vocabulary } from '@/i18n/vocabulary';
import {
  translationErrorSuffix,
  type ArticleDisplay,
} from '@/lib/article-translation';
import { TranslateButton } from './translate-button';
import { Badge } from '@/components/ui/badge';

// THE BANNER THAT TELLS READERS WHAT THEY ARE READING.
//
// A SERVER component: it contains no interaction, only text and
// a link. The only client piece is `TranslateButton`, mounted inside —
// that is why the `translation` catalogue crosses the RSC boundary,
// and for that reason only.
//
// THREE STATES, THREE DIFFERENT BANNERS, and none when the content's
// language is the reader's. A banner saying "this article is in French"
// on a French article to a French reader is exactly the kind of
// noise that makes people stop reading banners — including the one that
// matters.
//
// THE LINK TO THE ORIGINAL GOES THROUGH THE URL (`?original=1`) and not local
// state. Three reasons: the page stays server-rendered, the URL of the
// original is shareable, and a reader without JavaScript reaches it like
// everyone else — which is the project's working assumption (F-05, low
// bandwidth).

function Frame({
  tone,
  children,
}: {
  tone: 'info' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <aside
      className={`mt-6 rounded-sm border px-4 py-3 text-[13px] ${
        tone === 'warn'
          ? 'border-line-strong bg-surface-2 text-ink-soft'
          : 'border-accent-edge bg-accent-tint text-ink-soft'
      }`}
    >
      {children}
    </aside>
  );
}

export async function TranslationNotice({
  display,
  readerLocale,
  sourceType,
  sourceId,
  /** Page path, to build the "read the original" link. */
  pathname,
  /** Current query string, preserved by the link (filters, anchors). */
  search = '',
}: {
  display: ArticleDisplay;
  readerLocale: Locale;
  sourceType: 'tribunePost' | 'publication';
  sourceId: string;
  pathname: string;
  search?: string;
}) {
  if (display.kind === 'native') return null;

  const t = await getTranslations('translation');
  const tl = await getTranslations('library');

  const sourceName = vocabulary(tl, 'langs.', display.sourceLocale);
  const readerName = vocabulary(tl, 'langs.', readerLocale);

  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  params.delete('original');
  const withoutOriginal = params.toString();
  const originalHref = `${pathname}?${new URLSearchParams({
    ...Object.fromEntries(params),
    original: '1',
  }).toString()}`;
  const translatedHref = withoutOriginal
    ? `${pathname}?${withoutOriginal}`
    : pathname;

  if (display.kind === 'translated') {
    return (
      <Frame tone="info">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="accent" size="label">
            {t('badge')}
          </Badge>
          <span>{t('translatedFrom', { language: sourceName })}</span>
        </p>
        <p className="mt-1.5 text-muted">{t('notReviewed')}</p>
        <p className="mt-2">
          <Link
            href={originalHref}
            // The link text carries the original's language, so it is
            // written in the reader's language: no `lang` here. It is the language's
            // NAME that is translated, not the link.
            className="font-medium text-accent-text underline underline-offset-2"
          >
            {t('readOriginal', { language: sourceName })}
          </Link>
        </p>
      </Frame>
    );
  }

  // display.kind === 'original'
  return (
    <Frame tone="warn">
      <p>
        {display.stale
          ? t('stale')
          : t('originalNotice', { language: sourceName })}
      </p>
      {display.errorCode ? (
        <p className="mt-1.5 text-muted">
          {t('failed')}{' '}
          {vocabulary(
            t,
            'err',
            translationErrorSuffix(display.errorCode),
            t('errGeneric'),
          )}
        </p>
      ) : null}
      <div className="mt-2.5">
        {display.translationAvailable ? (
          <Link
            href={translatedHref}
            className="font-medium text-accent-text underline underline-offset-2"
          >
            {t('readTranslation', { language: readerName })}
          </Link>
        ) : (
          <TranslateButton
            sourceType={sourceType}
            sourceId={sourceId}
            targetLocale={readerLocale}
            retranslate={display.stale}
          />
        )}
      </div>
    </Frame>
  );
}

// `textAttrs` now lives in `@/i18n/content-lang`: LISTS need it
// too, including client-side (RGAA 8.7). Re-exported here for the
// detail pages that imported it from this module.
export { textAttrs } from '@/i18n/content-lang';
