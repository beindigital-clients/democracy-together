'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAction, useConvexAuth, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { formatMoney } from './format';

// Écran de retour de paiement. Réactif : il passe de « confirmation en
// cours » à « merci » dès que le webhook a inscrit le paiement, sans
// rechargement. Au montage, il demande une relecture chez le prestataire —
// filet quand le webhook tarde ou n'a pas été déclaré.
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
      // Relecture impossible : le webhook fera foi, l'écran reste réactif.
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
