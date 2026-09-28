import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Directory entry not found (F-21). Rendered when `notFound()` is thrown by
// the page.
//
// THIS FILE WAS HARD-CODED IN FRENCH, on the grounds — stated in its own
// comment — that "the locale context is not guaranteed in a not-found
// boundary". That is false, and the sibling file already proved it:
// `src/app/[locale]/not-found.tsx` calls `getTranslations` and works.
// Measured before the fix: `/ar/le-reseau/inconnu` did serve
// `<html lang="ar" dir="rtl">` — so the locale WAS resolved — with
// "Membre introuvable" and "Retour à l'annuaire" in the body.
//
// The link goes through `Link` from `@/i18n/navigation` and not a bare `<a>`:
// the old unprefixed `href="/le-reseau"` sent the visitor back to the
// middleware's default language. An Arabic speaker was redirected to /fr.
export default async function OrgNotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl">{t('memberNotFoundTitle')}</h1>
      <p className="mt-3 text-ink-soft">{t('memberNotFoundBody')}</p>
      <Link
        href="/le-reseau"
        className="mt-6 inline-flex items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
      >
        {t('memberNotFoundBack')}
      </Link>
    </div>
  );
}
