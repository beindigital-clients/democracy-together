import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import { vocabulary } from '@/i18n/vocabulary';
import type { ArticleDisplay, Reading } from '@/lib/article-translation';

// WHAT THE READER IS READING, AND IN WHICH OTHER LANGUAGES THEY CAN.
//
// Content is translated into every site language when it goes live
// (convex/translationJobs.ts): the reader no longer requests a translation,
// they pick a language. This banner does two things, in that order:
//
//  1. it SAYS what is on screen — a machine translation (and from which
//     language), or the original (and why: chosen, translation being
//     prepared, failed, or none);
//  2. it OFFERS the other languages: the original and the ready
//     translations as links, those being prepared as plain text, so that a
//     reader sees they are coming without following a link to nothing.
//
// Nothing when the reader reads the original on its own language's pages
// and no translation is ready yet: a banner with nothing to offer is noise.
//
// A SERVER component, with plain links: the language is in the URL
// (`?lang=xx`), so the page stays server-rendered, the address of a
// translation is shareable, and a reader without JavaScript reaches it like
// everyone else — the project's working assumption (F-05, low bandwidth).

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

export async function ReadingLanguages({
  display,
  reading,
  pageLocale,
  /** Page path, to build the language links. */
  pathname,
}: {
  display: ArticleDisplay;
  reading: Reading;
  pageLocale: Locale;
  pathname: string;
}) {
  const versions = (reading?.versions ?? []).filter(
    (v) =>
      v.status === 'original' || v.status === 'ready' || v.status === 'pending',
  );
  const shownLocale =
    display.kind === 'translated'
      ? display.locale
      : display.kind === 'original'
        ? display.sourceLocale
        : pageLocale;
  const anotherReady = versions.some(
    (v) => v.locale !== shownLocale && v.status === 'ready',
  );
  if (display.kind === 'native' && !anotherReady) return null;

  const t = await getTranslations('translation');
  const tl = await getTranslations('library');
  // Language NAMES in the reader's language ("Anglais"), for the sentences;
  // the links below use each language's own name ("English").
  const name = (l: Locale) => vocabulary(tl, 'langs.', l);
  const href = (l: Locale) => `${pathname}?lang=${l}`;
  const linkClass = 'font-medium text-accent-text underline underline-offset-2';

  let notice: React.ReactNode = null;
  let tone: 'info' | 'warn' = 'info';
  if (display.kind === 'translated') {
    notice = (
      <>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-pill border border-accent-edge px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent-text">
            {t('badge')}
          </span>
          <span>
            {t('translatedFrom', { language: name(display.sourceLocale) })}
          </span>
        </p>
        <p className="mt-1.5 text-muted">{t('notReviewed')}</p>
        <p className="mt-2">
          <Link href={href(display.sourceLocale)} className={linkClass}>
            {t('readOriginal', { language: name(display.sourceLocale) })}
          </Link>
        </p>
      </>
    );
  } else if (display.kind === 'original') {
    const source = name(display.sourceLocale);
    const requested = name(display.requested);
    tone = display.reason === 'chosen' ? 'info' : 'warn';
    const message =
      display.reason === 'chosen'
        ? t('originalChosen', { language: source })
        : display.reason === 'pending'
          ? t('pendingNotice', { language: requested, source })
          : display.reason === 'failed'
            ? t('failedNotice', { language: requested, source })
            : t('originalNotice', { language: source });
    const pageVersionReady = versions.some(
      (v) => v.locale === pageLocale && v.status === 'ready',
    );
    notice = (
      <>
        <p>{message}</p>
        {display.reason === 'chosen' && pageVersionReady ? (
          <p className="mt-2">
            <Link href={href(pageLocale)} className={linkClass}>
              {t('readTranslation', { language: name(pageLocale) })}
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <Frame tone={tone}>
      {notice}
      {versions.length > 1 ? (
        <nav
          aria-label={t('readIn')}
          className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${notice ? 'mt-3 border-t border-line pt-2.5' : ''}`}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {t('readIn')}
          </span>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {versions.map((v) => {
              // The language's own name, marked as such (RGAA 8.7); the
              // "(original)" and "(en préparation)" tags stay in the page's
              // language, outside the marked span.
              const label = (
                <span lang={v.locale} dir={direction(v.locale)}>
                  {LOCALE_ENDONYMS[v.locale]}
                </span>
              );
              const tag =
                v.status === 'original'
                  ? ` (${t('originalTag')})`
                  : v.status === 'pending'
                    ? ` (${t('pendingTag')})`
                    : '';
              if (v.locale === shownLocale) {
                return (
                  <li key={v.locale}>
                    <span aria-current="true" className="font-medium text-ink">
                      {label}
                      {tag}
                    </span>
                  </li>
                );
              }
              if (v.status === 'pending') {
                return (
                  <li key={v.locale} className="text-muted">
                    {label}
                    {tag}
                  </li>
                );
              }
              return (
                <li key={v.locale}>
                  <Link href={href(v.locale)} className={linkClass}>
                    {label}
                    {tag}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </Frame>
  );
}
