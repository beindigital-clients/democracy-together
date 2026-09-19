import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// 404 localisée (audit § 5.1). Sans ce fichier, un slug inconnu sur
// /bibliotheque/x ou /tribune/x affichait la 404 par défaut de Next : en
// anglais, sans en-tête ni pied de page, hors charte. Placée sous [locale],
// elle est rendue DANS le layout : en-tête, pied de page et langue conservés.
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
