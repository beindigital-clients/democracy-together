'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { formatMoney } from './format';

// Payment return screen. Reactive: it goes from "confirmation in
// progress" to "thank you" as soon as the webhook has recorded the payment, without
// reloading. On mount, it asks for a re-read from the provider —
// a safety net when the webhook is late or has not been registered.
export function PaymentReturn({
  paymentRef,
  cancelled,
}: {
  paymentRef: string;
  cancelled: boolean;
}) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(
    api.payments.checkout.checkoutStatus,
    paymentRef ? { ref: paymentRef } : 'skip',
  );
  const sync = useAction(api.payments.checkout.syncCheckout);
  const synced = useRef(false);

  const open = status?.status === 'open';
  useEffect(() => {
    if (!open || cancelled || synced.current) return;
    synced.current = true;
    sync({ ref: paymentRef }).catch(() => {
      // Re-read impossible: the webhook will be authoritative, the screen stays reactive.
    });
  }, [open, cancelled, paymentRef, sync]);

  if (!paymentRef || status === null) {
    return (
      <Panel title={t('returnUnknownTitle')} body={t('returnUnknownBody')}>
        <Button asChild>
          <Link href="/don">{t('backToDonate')}</Link>
        </Button>
      </Panel>
    );
  }
  if (status === undefined) {
    return <p className="text-ink-soft">{t('loading')}</p>;
  }

  const amount = formatMoney(status.amountMinor, status.currency, locale);
  const retryHref =
    status.purpose === 'dues' ? '/espace-membre/cotisations' : '/don';

  if (status.status === 'completed') {
    return (
      <Panel
        title={
          status.purpose === 'dues'
            ? t('returnThanksDuesTitle')
            : t('returnThanksTitle')
        }
        body={
          status.recurring
            ? t('returnThanksMonthlyBody', { amount })
            : status.purpose === 'dues'
              ? t('returnThanksDuesBody', { amount })
              : t('returnThanksBody', { amount })
        }
        tone="success"
      >
        <p className="text-sm text-ink-soft">{t('returnReceiptByEmail')}</p>
        {isAuthenticated ? (
          <Button asChild>
            <Link href="/espace-membre/cotisations">{t('seeMyReceipts')}</Link>
          </Button>
        ) : null}
      </Panel>
    );
  }

  if (
    cancelled ||
    status.status === 'cancelled' ||
    status.status === 'expired'
  ) {
    return (
      <Panel title={t('returnCancelledTitle')} body={t('returnCancelledBody')}>
        <Button asChild>
          <Link href={retryHref}>{t('retry')}</Link>
        </Button>
      </Panel>
    );
  }

  if (status.status === 'failed') {
    return (
      <Panel title={t('returnFailedTitle')} body={t('returnFailedBody')}>
        <Button asChild>
          <Link href={retryHref}>{t('retry')}</Link>
        </Button>
      </Panel>
    );
  }

  return (
    <Panel
      title={t('returnPendingTitle')}
      body={t('returnPendingBody', { amount })}
    >
      <p className="text-xs text-muted">{t('returnPendingHint')}</p>
    </Panel>
  );
}

function Panel({
  title,
  body,
  tone,
  children,
}: {
  title: string;
  body: string;
  tone?: 'success';
  children?: ReactNode;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-md border p-6 sm:p-8 ${
        tone === 'success'
          ? 'border-accent-edge bg-accent-tint'
          : 'border-line bg-surface'
      }`}
    >
      <h1 className="font-display text-3xl text-ink">{title}</h1>
      <p className="mt-3 wrap-anywhere leading-relaxed text-ink-soft">{body}</p>
      {children ? (
        <div className="mt-5 flex flex-wrap items-center gap-4">{children}</div>
      ) : null}
    </section>
  );
}
