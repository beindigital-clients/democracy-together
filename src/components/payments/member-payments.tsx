'use client';

import { useMemo, useState } from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  PLAN_CATEGORIES,
  PLAN_ZONES,
  type Currency,
  type PlanCategory,
  type PlanZone,
} from '@convex/lib/payments/amounts';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FormError, SelectField } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { resolveLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import { PaymentsUnavailable } from './payments-unavailable';
import { formatDay, formatMoney, knownPaymentError } from './format';

// ESPACE MEMBRE / DONATEUR (F-30) : cotisation en cours et règlement,
// dons mensuels (arrêt), historique des paiements et reçus.

// L'heure passée aux queries est arrondie à l'heure : une valeur qui change à
// chaque rendu relancerait la souscription en boucle.
function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000) * 3_600_000;
}

const TH =
  'px-4 py-3 text-start font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted';

export function MemberPayments() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const [now] = useState(currentHour);
  const me = useQuery(api.users.current);
  const data = useQuery(api.payments.member.overview, { now });

  if (data === undefined || me === undefined) {
    return <p className="mt-6 text-ink-soft">{t('loading')}</p>;
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="dues-title">
        <h2 id="dues-title" className="font-display text-2xl">
          {t('duesTitle')}
        </h2>
        {data.dues ? (
          <p
            className={`mt-3 rounded-sm border px-4 py-3 text-sm ${
              data.dues.upToDate
                ? 'border-accent-edge bg-accent-tint text-accent-text'
                : 'border-line-strong bg-surface text-ink'
            }`}
            data-testid="dues-status"
          >
            {data.dues.upToDate
              ? t('duesUpToDate', {
                  date: formatDay(data.dues.periodEnd, locale),
                })
              : t('duesExpired', {
                  date: formatDay(data.dues.periodEnd, locale),
                })}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">{t('duesNone')}</p>
        )}
        {isMember(me?.role) ? (
          <DuesPayForm />
        ) : (
          <p className="mt-4 text-sm text-ink-soft">
            {t('duesMembersOnly')}{' '}
            <Link
              href="/adhesion"
              className="font-medium text-accent-text hover:underline"
            >
              {t('duesApplyLink')}
            </Link>
          </p>
        )}
      </section>

      <RecurringDonations subscriptions={data.subscriptions} />

      <section aria-labelledby="history-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="history-title" className="font-display text-2xl">
            {t('historyTitle')}
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/don">{t('makeDonation')}</Link>
          </Button>
        </div>
        {data.transactions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">{t('historyEmpty')}</p>
        ) : (
          <ScrollableRegion label={t('historyTitle')} className="mt-4">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>{t('colDate')}</th>
                  <th className={TH}>{t('colType')}</th>
                  <th className={TH}>{t('colAmount')}</th>
                  <th className={TH}>{t('colStatus')}</th>
                  <th className={TH}>{t('colReceipt')}</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr
                    key={tx._id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {formatDay(tx.paidAt, locale)}
                    </td>
                    <td className="px-4 py-3">
                      {tx.kind === 'dues'
                        ? t('purpose_dues')
                        : tx.recurring
                          ? t('frequencyMonthly')
                          : t('purpose_donation')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono">
                      {formatMoney(tx.amountMinor, tx.currency, locale)}
                    </td>
                    <td className="px-4 py-3">
                      {vocabulary(t, 'txStatus_', tx.status)}
                    </td>
                    <td className="px-4 py-3">
                      {tx.receipt ? (
                        <ReceiptButton
                          receiptId={tx.receipt._id}
                          number={tx.receipt.number}
                          ready={tx.receipt.ready}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
        )}
      </section>
    </div>
  );
}

// Téléchargement : l'URL signée est demandée AU CLIC (la query vérifie que le
// reçu appartient au compte), pas précalculée pour toute la liste.
export function ReceiptButton({
  receiptId,
  number,
  ready,
}: {
  receiptId: Id<'paymentReceipts'>;
  number: string;
  ready: boolean;
}) {
  const t = useTranslations('payments');
  const convex = useConvex();
  const [error, setError] = useState(false);
  if (!ready) {
    return <span className="text-xs text-muted">{t('receiptPreparing')}</span>;
  }
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="min-h-11 text-start text-[13px] font-medium text-accent-text hover:underline"
        aria-label={t('receiptDownloadNamed', { number })}
        onClick={async () => {
          setError(false);
          try {
            const res = await convex.query(
              api.payments.member.receiptDownloadUrl,
              {
                receiptId,
              },
            );
            if (res?.url) window.open(res.url, '_blank', 'noopener');
            else setError(true);
          } catch {
            setError(true);
          }
        }}
      >
        {number}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-bar-5">
          {t('receiptError')}
        </span>
      ) : null}
    </span>
  );
}

function DuesPayForm() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const plans = useQuery(api.payments.plans.publicPlans, {});
  const options = useQuery(api.payments.checkout.paymentOptions, {});
  const start = useAction(api.payments.checkout.startDues);
  const [category, setCategory] = useState<PlanCategory>('ind');
  const [zone, setZone] = useState<PlanZone>('high');
  const [chosen, setChosen] = useState<Currency | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => plans?.find((p) => p.category === category && p.zone === zone),
    [plans, category, zone],
  );

  if (plans === undefined || options === undefined) return null;
  if (options.currencies.length === 0) {
    return (
      <div className="mt-5">
        <PaymentsUnavailable
          bankTransfer={options.bankTransfer}
          purpose="dues"
        />
      </div>
    );
  }
  if (plans.length === 0) {
    return <p className="mt-4 text-sm text-ink-soft">{t('duesNoPlans')}</p>;
  }

  const priced = options.currencies
    .map((c) => c.currency)
    .filter((c) => (c === 'EUR' ? plan?.amountEur : plan?.amountXof) != null);
  const currency = chosen && priced.includes(chosen) ? chosen : priced[0];
  const amountMinor = currency
    ? currency === 'EUR'
      ? plan?.amountEur
      : plan?.amountXof
    : null;

  async function pay() {
    if (!currency) return;
    setPending(true);
    setError(null);
    try {
      const { redirectUrl } = await start({
        category,
        zone,
        currency,
        locale: resolveLocale(locale),
      });
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(vocabulary(t, 'err_', knownPaymentError(err)));
      setPending(false);
    }
  }

  return (
    <div className="mt-5 rounded-md border border-line bg-surface p-5">
      <h3 className="font-display text-lg">{t('duesPayTitle')}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t('planCategory')}
          value={category}
          onChange={(e) => setCategory(e.target.value as PlanCategory)}
        >
          {PLAN_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {vocabulary(t, 'category_', c)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('planZone')}
          value={zone}
          onChange={(e) => setZone(e.target.value as PlanZone)}
        >
          {PLAN_ZONES.map((z) => (
            <option key={z} value={z}>
              {vocabulary(t, 'zone_', z)}
            </option>
          ))}
        </SelectField>
        {priced.length > 0 ? (
          <SelectField
            label={t('currencyLabel')}
            value={currency}
            onChange={(e) => setChosen(e.target.value as Currency)}
          >
            {priced.map((c) => (
              <option key={c} value={c}>
                {vocabulary(t, 'currency_', c)}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>
      {currency && amountMinor != null ? (
        <p className="mt-4 text-sm text-ink-soft">
          {t('duesAmount')}{' '}
          <b className="font-mono text-lg text-ink" data-testid="dues-amount">
            {formatMoney(amountMinor, currency, locale)}
          </b>{' '}
          {t('perYear')}
        </p>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">{t('duesPlanUnavailable')}</p>
      )}
      <FormError className="mt-3">{error}</FormError>
      <Button
        type="button"
        className="mt-4"
        disabled={pending || !currency || amountMinor == null}
        onClick={pay}
      >
        {pending ? t('redirecting') : t('duesPay')}
      </Button>
      <p className="mt-3 text-xs text-muted">{t('duesPeriodNote')}</p>
    </div>
  );
}

type Subscription = {
  _id: Id<'paymentSubscriptions'>;
  status: 'active' | 'cancelled' | 'past_due';
  mode: 'native' | 'reminder';
  currency: Currency;
  amountMinor: number;
  nextDueAt: number;
};

function RecurringDonations({
  subscriptions,
}: {
  subscriptions: Subscription[];
}) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const cancel = useMutation(api.payments.member.cancelMyRecurring);
  const [target, setTarget] = useState<Subscription | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (subscriptions.length === 0) return null;

  return (
    <section aria-labelledby="recurring-title">
      <h2 id="recurring-title" className="font-display text-2xl">
        {t('recurringTitle')}
      </h2>
      <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
        {subscriptions.map((s) => (
          <li
            key={s._id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-mono text-ink">
                {t('recurringAmount', {
                  amount: formatMoney(s.amountMinor, s.currency, locale),
                })}
              </p>
              <p className="text-xs text-muted">
                {vocabulary(t, 'subStatus_', s.status)}
                {s.status === 'active'
                  ? ` · ${t('recurringNext', { date: formatDay(s.nextDueAt, locale) })}`
                  : ''}
              </p>
            </div>
            {s.status !== 'cancelled' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTarget(s)}
              >
                {t('recurringStop')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <FormError className="mt-3">{error}</FormError>
      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? t('recurringStopConfirm', {
                amount: formatMoney(
                  target.amountMinor,
                  target.currency,
                  locale,
                ),
              })
            : ''
        }
        description={t('recurringStopBody')}
        confirmLabel={t('recurringStop')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          setPending(true);
          setError(null);
          try {
            await cancel({ subscriptionId: target._id });
          } catch (err) {
            setError(vocabulary(t, 'err_', knownPaymentError(err)));
          } finally {
            setPending(false);
            setTarget(null);
          }
        }}
      />
    </section>
  );
}
