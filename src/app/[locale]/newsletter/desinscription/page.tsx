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
  const [status, setStatus] = useState<
    'pending' | 'done' | 'notoken' | 'invalid' | 'error'
  >(token ? 'pending' : 'notoken');

  // One-click unsubscribe from the e-mail link (idempotent server-side).
  // A token that matches NOTHING — truncated by a mail client, already
  // consumed, made up — displayed "you are unsubscribed" (measured on
  // 27/09, showcase O2 / R-09): the subscriber with the truncated link
  // believed it and stayed subscribed. The server now says `found`, and the
  // page "invalid or expired link". This is not an oracle: the token is a
  // random secret, it identifies no address (see convex/newsletter.ts#unsubscribe).
  useEffect(() => {
    if (!token) return;
    let active = true;
    unsubscribe({ token })
      .then((r) => {
        if (active) setStatus(r.found ? 'done' : 'invalid');
      })
      .catch(() => {
        // Network unavailable: the mutation did not respond. We can neither
        // confirm nor deny — nor say the link is invalid: it may well not
        // be. We invite the user to reload. Without this `catch`, the rejection
        // bubbled up unhandled.
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [token, unsubscribe]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('unsubTitle')}</h1>
      <p className="mt-3 text-ink-soft">
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

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
