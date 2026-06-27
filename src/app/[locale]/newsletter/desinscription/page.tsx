'use client';

import { Suspense, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

function UnsubscribeInner() {
  const t = useTranslations('newsletter');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const unsubscribe = useMutation(api.newsletter.unsubscribe);
  const [status, setStatus] = useState<'pending' | 'done' | 'notoken'>(
    token ? 'pending' : 'notoken',
  );

  // Désinscription en un clic depuis le lien de l'e-mail (idempotent côté
  // serveur). On confirme toujours, même si le jeton est déjà retiré.
  useEffect(() => {
    if (!token) return;
    let active = true;
    unsubscribe({ token }).finally(() => {
      if (active) setStatus('done');
    });
    return () => {
      active = false;
    };
  }, [token, unsubscribe]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('unsubTitle')}</h1>
      <p className="mt-3 text-ink-soft">
        {status === 'notoken'
          ? t('unsubInvalid')
          : status === 'pending'
            ? t('unsubPending')
            : t('unsubDone')}
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-accent-text hover:underline"
      >
        {t('unsubHome')}
      </Link>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
