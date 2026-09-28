'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';

// DOUBLE OPT-IN CONFIRMATION (F-18, outreach workstream).
//
// The e-mail link carries the subscriber's language in its path
// (`/<langue>/newsletter/confirmation?token=…`, see
// convex/lib/newsletterContent.ts): the page is thus shown right away in
// their language. The token is single-use; the page distinguishes
// "confirmed", "expired" (signing up again sends a fresh link) and "invalid
// or already used". As with unsubscribing, this is not an oracle: a 256-bit
// token identifies no address a third party could choose.
type Status = 'pending' | 'confirmed' | 'expired' | 'invalid' | 'error';

function ConfirmInner() {
  const t = useTranslations('newsletter');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const confirm = useMutation(api.newsletter.confirm);
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'invalid');
  // SERVER-SIDE single use: a second call (double render in
  // development, reload) would answer "already used" and wipe out
  // the displayed success. The page therefore calls only once per token.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    confirm({ token })
      .then((r) => setStatus(r.status))
      .catch(() => setStatus('error'));
  }, [token, confirm]);

  const message = {
    pending: t('confirmPending'),
    confirmed: t('confirmDone'),
    expired: t('confirmExpired'),
    invalid: t('confirmInvalid'),
    error: t('confirmError'),
  }[status];

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-2xl">{t('confirmTitle')}</h1>
      <p role="status" className="mt-3 wrap-anywhere text-ink-soft">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {status === 'expired' || status === 'invalid' ? (
          <Link
            href="/newsletter"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
          >
            {t('confirmResubscribe')}
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
        >
          {t('confirmHome')}
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" />}>
      <ConfirmInner />
    </Suspense>
  );
}
