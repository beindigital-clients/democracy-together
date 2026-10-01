'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { LOCALE_ENDONYMS, direction } from '@/i18n/direction';
import { translationErrorSuffix } from '@/lib/article-translation';
import { vocabulary } from '@/i18n/vocabulary';
import { Button } from '@/components/ui/button';

// CHOOSING THE DOCUMENT LANGUAGE.
//
// The reader sees all five languages. Those that are READY lead straight to
// the corresponding version; the others carry a button that prepares it, then
// leads there. The distinction is visible before the click — otherwise all buttons
// would look alike and one of them would take thirty seconds without warning.
//
// THE DEFAULT LANGUAGE IS THE APPLICATION'S. The page opens on
// `?lang=<page locale>`; this component only serves to leave it. That is
// what the use case calls for: an Arabic-speaking reader downloading a report
// wants its Arabic version, not a choice to make.
//
// THE LABELS ARE ENDONYMS, as in the site's language picker
// (src/i18n/direction.ts): "Português", not "Portugais".

export function DocumentLanguagePicker({
  slug,
  current,
  /** Languages already ready — the others require preparation. */
  ready,
}: {
  slug: string;
  current: Locale;
  ready: readonly Locale[];
}) {
  const t = useTranslations('translation');
  const router = useRouter();
  const [preparing, setPreparing] = useState<Locale | null>(null);
  const [errorSuffix, setErrorSuffix] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prepare = useAction(api.documents.prepareDocument);

  function goTo(target: Locale) {
    startTransition(() => {
      router.replace(`/bibliotheque/${slug}/document?lang=${target}`);
      router.refresh();
    });
  }

  async function run(target: Locale) {
    setErrorSuffix(null);
    setPreparing(target);
    try {
      const result = await prepare({ slug, targetLocale: target });
      if (!result.ok) {
        setErrorSuffix(translationErrorSuffix(result.code));
        return;
      }
      goTo(target);
    } catch {
      setErrorSuffix('Generic');
    } finally {
      setPreparing(null);
    }
  }

  return (
    <div className="print:hidden">
      <h2 className="font-display text-lg text-ink">{t('docTitle')}</h2>
      <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">
        {t('docLead')}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {routing.locales.map((l) => {
          const isCurrent = l === current;
          const isReady = ready.includes(l);
          const busy = preparing === l || (pending && preparing === l);
          const label = LOCALE_ENDONYMS[l];
          // THE CURRENT LANGUAGE IS ONLY INERT IF IT IS READY.
          //
          // It used to be rendered as a `<span>` in every case, and that was a
          // dead end: the page opens by default on the application's language
          // (that is the requirement), so the first visitor to a never-prepared
          // document landed on THEIR language, read "no content" and had
          // no button to prepare it. The only path was to prepare ANOTHER
          // language — a full call paid for nothing — and then come back.
          const inerte = isCurrent && isReady;
          return (
            <li key={l}>
              {inerte ? (
                <span
                  aria-current="true"
                  lang={l}
                  dir={direction(l)}
                  className="inline-flex items-center rounded-sm border border-accent-edge bg-accent-tint px-3 py-1.5 text-[13px] font-medium text-accent-text"
                >
                  {label}
                </span>
              ) : (
                // The current language only gets here while busy, hence
                // disabled: the button needs no "current" look of its own.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  lang={l}
                  dir={direction(l)}
                  disabled={busy}
                  aria-busy={busy}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => (isReady ? goTo(l) : void run(l))}
                  className="gap-1.5"
                >
                  {label}
                  {isReady ? (
                    // A dot, not a word: the list stays readable at a
                    // glance, and the information also reaches assistive
                    // technology through the neighbouring SVG's `title`.
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                    />
                  ) : null}
                  <span className="sr-only">
                    {isReady
                      ? t('docReady', { language: label })
                      : t('docPrepare', { language: label })}
                  </span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {preparing ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {t('docPreparing')}
        </p>
      ) : null}
      {errorSuffix ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          {vocabulary(t, 'err', errorSuffix, t('errGeneric'))}
        </p>
      ) : null}
    </div>
  );
}
