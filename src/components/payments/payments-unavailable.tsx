'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

type BankTransfer = {
  holder: string;
  iban: string;
  bic: string | null;
  bank: string | null;
};

// NO PAYMENT PROVIDER CONFIGURED: the screen SAYS so, and offers
// the alternative — never a button that leads nowhere. Bank transfer if
// the association has published its details (PAYMENTS_BANK_* variables), otherwise
// the contact form.
export function PaymentsUnavailable({
  bankTransfer,
  purpose,
}: {
  bankTransfer: BankTransfer | null;
  purpose: 'donation' | 'dues';
}) {
  const t = useTranslations('payments');
  return (
    <div
      role="status"
      className="rounded-md border border-line-strong bg-surface p-6"
    >
      <h2 className="font-display text-xl text-ink">{t('unavailableTitle')}</h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
        {purpose === 'donation'
          ? t('unavailableBodyDonation')
          : t('unavailableBodyDues')}
      </p>
      {bankTransfer ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">{t('bankTitle')}</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-soft">{t('bankHolder')}</dt>
            <dd className="wrap-anywhere font-medium text-ink">
              {bankTransfer.holder}
            </dd>
            <dt className="text-ink-soft">{t('bankIban')}</dt>
            <dd className="wrap-anywhere font-mono text-ink" dir="ltr">
              {bankTransfer.iban}
            </dd>
            {bankTransfer.bic ? (
              <>
                <dt className="text-ink-soft">{t('bankBic')}</dt>
                <dd className="wrap-anywhere font-mono text-ink" dir="ltr">
                  {bankTransfer.bic}
                </dd>
              </>
            ) : null}
            {bankTransfer.bank ? (
              <>
                <dt className="text-ink-soft">{t('bankName')}</dt>
                <dd className="wrap-anywhere text-ink">{bankTransfer.bank}</dd>
              </>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-muted">{t('bankNote')}</p>
        </div>
      ) : null}
      <p className="mt-4 text-sm text-ink-soft">
        {bankTransfer ? t('contactAfterTransfer') : t('contactInstead')}{' '}
        <Link
          href="/contact"
          className="inline-block py-2 font-medium text-accent-text hover:underline"
        >
          {t('contactLink')}
        </Link>
      </p>
    </div>
  );
}
