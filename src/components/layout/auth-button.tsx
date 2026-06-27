'use client';

import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function AuthButton() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const t = useTranslations('auth');

  if (isLoading) {
    return <span aria-hidden className="inline-block h-5 w-16" />;
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/espace-membre"
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          {t('memberSpace')}
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          {t('signOut')}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/connexion"
      className="text-sm text-ink-soft transition-colors hover:text-ink"
    >
      {t('signIn')}
    </Link>
  );
}
