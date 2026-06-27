'use client';

import { useEffect } from 'react';
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { isMember } from '@/lib/roles';
import { PublicationSubmitForm } from '@/components/library/publication-submit-form';

function Loading() {
  const t = useTranslations('auth');
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-ink-soft sm:px-6">
      {t('loading')}
    </div>
  );
}

// Redirige seulement si l'état est *définitivement* non authentifié.
function RedirectToSignIn() {
  const router = useRouter();
  useEffect(() => {
    const id = setTimeout(() => router.replace('/connexion'), 1200);
    return () => clearTimeout(id);
  }, [router]);
  return <Loading />;
}

function DepositPage() {
  const t = useTranslations('library');
  const me = useQuery(api.users.current);
  if (me === undefined) return <Loading />;
  const member = isMember(me?.role);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-[13px] text-muted">
        <Link href="/" className="text-muted hover:text-ink">
          {t('breadcrumbHome')}
        </Link>{' '}
        /{' '}
        <Link href="/espace-membre" className="text-muted hover:text-ink">
          {t('submit.memberSpace')}
        </Link>{' '}
        / {t('submit.title')}
      </p>
      <h1 className="mt-4 font-display text-[clamp(28px,3.4vw,40px)] font-medium leading-tight tracking-[-0.015em]">
        {t('submit.title')}
      </h1>
      <p className="mt-3 max-w-[58ch] text-lg leading-relaxed text-ink-soft">
        {t('submit.lead')}
      </p>
      <div className="mt-8">
        {member ? (
          <PublicationSubmitForm />
        ) : (
          <div className="rounded-md border border-accent-edge bg-accent-tint p-6">
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">
              {t('submit.membersOnly')}
            </p>
            <Button asChild className="mt-4">
              <Link href="/adhesion">{t('submit.becomeMemberCta')}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeposerPage() {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <DepositPage />
      </Authenticated>
    </>
  );
}
