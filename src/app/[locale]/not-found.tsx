import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Localized 404 (audit § 5.1). Without this file, an unknown slug on
// /bibliotheque/x or /tribune/x showed Next's default 404: in
// English, without header or footer, off-brand. Placed under [locale],
// it is rendered INSIDE the layout: header, footer and language preserved.
export default async function LocaleNotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">
        404
      </p>
      <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(28px,4vw,42px)] font-medium leading-[1.1] tracking-[-0.015em]">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
        {t('notFoundBody')}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          {t('notFoundHome')}
        </Link>
        <Link
          href="/bibliotheque"
          className="inline-flex items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
        >
          {t('notFoundLibrary')}
        </Link>
      </div>
    </div>
  );
}
