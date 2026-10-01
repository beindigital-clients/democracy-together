'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useAction } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { translationErrorSuffix } from '@/lib/article-translation';
import { vocabulary } from '@/i18n/vocabulary';
import { Button } from '@/components/ui/button';

// THE BUTTON THAT REQUESTS A TRANSLATION.
//
// A client component, and the only one in this setup: everything else — the
// display decision, the banner, the translated text — is rendered server-side
// and therefore sends nothing to the browser. What is here is what cannot be
// anywhere else: a call triggered by a click, its pending state, and its
// possible failure.
//
// WHY A CLICK AND NOT A TRANSLATION ON PUBLICATION. Translating every piece
// of content into the four other languages at submission time means four
// calls per item, for languages nobody may ever ask for.
// On demand, the first reader pays for the call and ALL SUBSEQUENT ONES read
// the cache — including in lists and the back office. The cost follows
// actual usage, and the common case (content never read in another language)
// is free.
//
// `router.refresh()` rather than local state: the translation is rendered by
// the page's SERVER component, which rereads it from Convex. Refreshing the
// segment makes it re-run with the translation now cached, without
// reloading the page or losing the reading position.

export function TranslateButton({
  sourceType,
  sourceId,
  targetLocale,
  /** Variant "the translation exists but is stale". */
  retranslate = false,
}: {
  sourceType: 'tribunePost' | 'publication';
  sourceId: string;
  targetLocale: Locale;
  retranslate?: boolean;
}) {
  const t = useTranslations('translation');
  const tl = useTranslations('library');
  const request = useAction(api.translation.requestTranslation);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [errorSuffix, setErrorSuffix] = useState<string | null>(null);

  const language = vocabulary(tl, 'langs.', targetLocale);
  const busy = running || pending;

  async function run() {
    setErrorSuffix(null);
    setRunning(true);
    try {
      const result = await request({ sourceType, sourceId, targetLocale });
      if (!result.ok) {
        setErrorSuffix(translationErrorSuffix(result.code));
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      // An exception here is a transport failure: the action itself
      // returns its failures as `{ ok: false }` rather than throwing.
      setErrorSuffix('Generic');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
          className="size-3.5"
        >
          <path d="M4 5h10M9 3v2c0 4-2 7-5 8M7 10c0 3 3 5 7 6M14 19l4-9 4 9M16.5 16h5" />
        </svg>
        {busy
          ? t('translating')
          : retranslate
            ? t('retranslate')
            : t('offer', { language })}
      </Button>
      {errorSuffix ? (
        // `role="status"` and not `alert`: the failure of an offered translation
        // does not interrupt reading the article, which remains whole above.
        <p role="status" className="text-[13px] text-muted">
          {vocabulary(t, 'err', errorSuffix, t('errGeneric'))}{' '}
          <Button
            type="button"
            variant="link-inline"
            size="inline"
            onClick={() => void run()}
          >
            {t('retry')}
          </Button>
        </p>
      ) : null}
    </div>
  );
}
