'use client';

import { Suspense, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// UNSUBSCRIBE FROM THE CERCLE'S LIST — the page the footer link of every
// message opens (the one-click header POSTs to the Convex endpoint instead).
// Idempotent server-side; a token that matches nothing says "invalid or
// expired", never "unsubscribed" (the token is a random secret, it identifies
// no address a third party could choose).
function UnsubscribeInner() {
  const t = useTranslations('cercle');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const unsubscribe = useMutation(api.cercleMailing.unsubscribe);
  const [status, setStatus] = useState<
    'pending' | 'done' | 'notoken' | 'invalid' | 'error'
  >(token ? 'pending' : 'notoken');

  useEffect(() => {
    if (!token) return;
    let active = true;
    unsubscribe({ token })
      .then((r) => {
        if (active) setStatus(r.found ? 'done' : 'invalid');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [token, unsubscribe]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('unsubTitle')}</h1>
      <p role="status" className="mt-3 text-ink-soft">
        {status === 'notoken' || status === 'invalid'
          ? t('unsubInvalid')
          : status === 'error'
            ? t('unsubError')
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

export default function CercleUnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
