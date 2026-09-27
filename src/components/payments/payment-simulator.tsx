'use client';

import { useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { vocabulary } from '@/i18n/vocabulary';
import { formatMoney, knownPaymentError } from './format';

// Simulateur du prestataire factice : tient le rôle de la page hébergée de
// Stripe ou de PayDunya. « Payer » déclenche un webhook signé côté serveur,
// puis renvoie vers la même page de retour qu'un vrai paiement.
export function PaymentSimulator({ paymentRef }: { paymentRef: string }) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const info = useQuery(api.payments.fake.simulatorInfo, { ref: paymentRef });
  const simulate = useAction(api.payments.fake.simulate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (info === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;

  if (!info.enabled || !info.checkout) {
    return (
      <section className="rounded-md border border-line bg-surface p-6">
        <h1 className="font-display text-2xl text-ink">{t('simTitle')}</h1>
        <p className="mt-3 text-ink-soft">
          {info.enabled ? t('simUnknown') : t('simDisabled')}
        </p>
      </section>
    );
  }

  const c = info.checkout;
  async function run(outcome: 'paid' | 'cancelled') {
    setPending(true);
    setError(null);
    try {
      const { returnPath } = await simulate({ ref: paymentRef, outcome });
      window.location.assign(returnPath);
    } catch (err) {
      setError(vocabulary(t, 'err_', knownPaymentError(err)));
      setPending(false);
    }
  }

  return (
    <section className="rounded-md border border-line bg-surface p-6 shadow-card sm:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent-text">
        {t('simEyebrow')}
      </p>
      <h1 className="mt-2 font-display text-2xl text-ink">{t('simTitle')}</h1>
      <p className="mt-3 text-sm text-ink-soft">{t('simBody')}</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-soft">{t('simAmount')}</dt>
        <dd
          className="font-mono font-semibold text-ink"
          data-testid="sim-amount"
        >
          {formatMoney(c.amountMinor, c.currency, locale)}
        </dd>
        <dt className="text-ink-soft">{t('simPurpose')}</dt>
        <dd className="text-ink">
          {c.purpose === 'dues'
            ? t('purpose_dues')
            : c.recurring
              ? t('frequencyMonthly')
              : t('purpose_donation')}
        </dd>
      </dl>
      <FormError className="mt-4">{error}</FormError>
      {c.status === 'open' || c.status === 'created' ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" disabled={pending} onClick={() => run('paid')}>
            {t('simPay')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run('cancelled')}
          >
            {t('simCancel')}
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-soft">{t('simAlreadyClosed')}</p>
      )}
    </section>
  );
}
