import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Profile not found — AND profile not visible to this reader. All three cases
// (unknown handle, private profile, members-only profile viewed without a
// session) render this same page: distinguishing them would reveal that
// someone is behind the address. Hence a text that covers all three, and a
// sign-in link.
export default async function PersonNotFound() {
  const t = await getTranslations('people.profile');
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl">{t('notFoundTitle')}</h1>
      <p className="mt-3 text-ink-soft">{t('notFoundBody')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/connexion"
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
        >
          {t('notFoundSignIn')}
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('notFoundBack')}
        </Link>
      </div>
    </div>
  );
}
