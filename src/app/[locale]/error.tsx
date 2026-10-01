'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

// Localized error boundary (audit § 5.1). Without it, a Convex or Sanity
// outage produced a generic 500, off-brand and in English.
//
// NB Next 16: the recovery prop is called `retry` (not `reset` as in
// earlier versions) — see node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/error.md. An error boundary MUST
// be a client component.
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // No telemetry service in the project: we log server-side via the
    // console, which Vercel already captures in the runtime logs.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
        500
      </p>
      <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(28px,4vw,42px)] font-medium leading-[1.1] tracking-[-0.015em]">
        {t('errorTitle')}
      </h1>
      <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
        {t('errorBody')}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={() => retry()}>
          {t('errorRetry')}
        </Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
        >
          {t('errorHome')}
        </Link>
      </div>
      {/* `digest` is the identifier Next assigns to the error server-side:
          it is what lets us find it in the logs. */}
      {error.digest ? (
        <p className="mt-6 font-mono text-[12px] text-muted">
          {t('errorReference')} : {error.digest}
        </p>
      ) : null}
    </div>
  );
}
