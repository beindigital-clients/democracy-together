'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Button } from '@/components/ui/button';

export function ReceiptByToken({ token }: { token: string }) {
  const t = useTranslations('payments');
  const receipt = useQuery(api.payments.member.receiptByToken, { token });

  if (receipt === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;

  return (
    <section className="rounded-md border border-line bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl text-ink">{t('receiptTitle')}</h1>
      {receipt === null ? (
        <p className="mt-3 text-ink-soft">{t('receiptInvalid')}</p>
      ) : (
        <>
          <p className="mt-3 text-ink-soft">
            {t('receiptNumber', { number: receipt.number })}
          </p>
          <p className="mt-1 text-sm text-muted">{t('receiptFrenchNote')}</p>
          {receipt.url ? (
            <Button asChild className="mt-5">
              <a href={receipt.url} target="_blank" rel="noopener noreferrer">
                {t('receiptDownload')}
              </a>
            </Button>
          ) : (
            <p role="status" className="mt-5 text-sm text-ink-soft">
              {t('receiptPreparing')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
