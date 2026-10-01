'use client';

import { useMemo, useState } from 'react';
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import {
  CURRENCIES,
  monthKey,
  type Currency,
} from '@convex/lib/payments/amounts';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { LoadMore } from '@/components/admin/load-more';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';
import { formatDay, formatMoney, knownPaymentError } from './format';
import { ReceiptButton } from './member-payments';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

// FINANCIAL TRACKING (F-31) — administrators' screen. Each block reads its
// own query: a block that fails (permissions, network) does not take the others down.

type TxRow = FunctionReturnType<
  typeof api.payments.finances.listTransactions
>['page'][number];

const PAGE_SIZE = 25;
const TH =
  'py-2 pe-4 text-start font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-muted';

function hourNow(): number {
  return Math.floor(Date.now() / 3_600_000) * 3_600_000;
}

// First month of the table: eleven months before the current month.
function firstMonth(now: number): string {
  const d = new Date(now);
  return monthKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1));
}

function csvField(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map((r) => r.map(csvField).join(','))
    .join('\r\n');
  // UTF-8 BOM: Excel then reads accented characters correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AdminFinances() {
  const t = useTranslations('payments');
  const [now] = useState(hourNow);
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('financesTitle')}</h1>
        <Button asChild variant="outline">
          <Link href="/admin/finances/formules">{t('plansLink')}</Link>
        </Button>
      </div>
      <Dashboard now={now} />
      <Transactions />
      <ExportBlock now={now} />
      <LateDues now={now} />
      <Subscriptions />
      <AuditTrail />
    </div>
  );
}

function Dashboard({ now }: { now: number }) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const data = useQuery(api.payments.finances.dashboard, {
    fromMonth: firstMonth(now),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    // One row per (month, currency); columns: donations, membership fees, refunded.
    const map = new Map<
      string,
      {
        month: string;
        currency: Currency;
        donation: number;
        dues: number;
        refunded: number;
        count: number;
      }
    >();
    for (const m of data.months) {
      const key = `${m.month}|${m.currency}`;
      const row = map.get(key) ?? {
        month: m.month,
        currency: m.currency,
        donation: 0,
        dues: 0,
        refunded: 0,
        count: 0,
      };
      if (m.kind === 'donation') row.donation += m.grossMinor;
      else row.dues += m.grossMinor;
      row.refunded += m.refundedMinor;
      row.count += m.count;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) =>
      a.month === b.month
        ? a.currency.localeCompare(b.currency)
        : b.month.localeCompare(a.month),
    );
  }, [data]);

  const totals = useMemo(() => {
    const out = new Map<Currency, number>();
    for (const r of rows) {
      out.set(
        r.currency,
        (out.get(r.currency) ?? 0) + r.donation + r.dues - r.refunded,
      );
    }
    return [...out.entries()];
  }, [rows]);

  if (data === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;

  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1));

  return (
    <section aria-labelledby="dash-title">
      <h2 id="dash-title" className="font-display text-2xl">
        {t('dashboardTitle')}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        <Badge asChild>
          <li>
            {data.providers.stripe
              ? t('providerStripeOn')
              : t('providerStripeOff')}
          </li>
        </Badge>
        {data.providers.fake !== 'off' ? (
          <Badge asChild variant="accent">
            <li>
              {data.providers.fake === 'active'
                ? t('providerFakeOn')
                : t('providerFakeRefused')}
            </li>
          </Badge>
        ) : null}
      </ul>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {totals.map(([currency, net]) => (
          <div
            key={currency}
            className="rounded-md border border-line bg-surface p-4"
          >
            <dt className="text-xs text-muted">
              {t('net12Months', { currency })}
            </dt>
            <dd className="mt-1 font-mono text-2xl text-ink">
              {formatMoney(net, currency, locale)}
            </dd>
          </div>
        ))}
        <div className="rounded-md border border-line bg-surface p-4">
          <dt className="text-xs text-muted">{t('activeRecurring')}</dt>
          <dd className="mt-1 font-mono text-2xl text-ink">
            {data.activeSubscriptions}
            {data.activeSubscriptionsCapped ? '+' : ''}
          </dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{t('dashboardEmpty')}</p>
      ) : (
        <ScrollableRegion label={t('dashboardTitle')} className="mt-5">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t('dashboardCaption')}</caption>
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>{t('colMonth')}</th>
                <th className={TH}>{t('colCurrency')}</th>
                <th className={TH}>{t('purpose_donation')}</th>
                <th className={TH}>{t('purpose_dues')}</th>
                <th className={TH}>{t('colRefunded')}</th>
                <th className={TH}>{t('colNet')}</th>
                <th className={TH}>{t('colCount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.month}-${r.currency}`}
                  className="border-b border-line"
                >
                  <td className="py-2.5 pe-4 whitespace-nowrap">
                    {monthLabel(r.month)}
                  </td>
                  <td className="py-2.5 pe-4 font-mono">{r.currency}</td>
                  <td className="py-2.5 pe-4 font-mono">
                    {formatMoney(r.donation, r.currency, locale)}
                  </td>
                  <td className="py-2.5 pe-4 font-mono">
                    {formatMoney(r.dues, r.currency, locale)}
                  </td>
                  <td className="py-2.5 pe-4 font-mono">
                    {formatMoney(r.refunded, r.currency, locale)}
                  </td>
                  <td className="py-2.5 pe-4 font-mono font-semibold">
                    {formatMoney(
                      r.donation + r.dues - r.refunded,
                      r.currency,
                      locale,
                    )}
                  </td>
                  <td className="py-2.5 pe-4 font-mono">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableRegion>
      )}
    </section>
  );
}

type Filters = {
  kind: '' | 'donation' | 'dues';
  currency: '' | Currency;
  status: '' | 'succeeded' | 'refunded';
  provider: '' | 'stripe' | 'fake';
};

function Transactions() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const notify = useActionFeedback();
  const [filters, setFilters] = useState<Filters>({
    kind: '',
    currency: '',
    status: '',
    provider: '',
  });
  const { results, status, loadMore } = usePaginatedQuery(
    api.payments.finances.listTransactions,
    {
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.provider ? { provider: filters.provider } : {}),
    },
    { initialNumItems: PAGE_SIZE },
  );
  const markRefunded = useMutation(api.payments.finances.markRefunded);
  const refundAtProvider = useAction(api.payments.finances.refundAtProvider);
  const [target, setTarget] = useState<TxRow | null>(null);
  const [reason, setReason] = useState('');
  const [viaProvider, setViaProvider] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof Filters>(k: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: value }));

  async function confirmRefund() {
    if (!target) return;
    setPending(true);
    try {
      if (viaProvider) {
        await refundAtProvider({ transactionId: target._id, reason });
      } else {
        await markRefunded({ transactionId: target._id, reason });
      }
      notify(t('refundDone'));
      setTarget(null);
    } catch (err) {
      notify(vocabulary(t, 'err_', knownPaymentError(err)), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="tx-title">
      <h2 id="tx-title" className="font-display text-2xl">
        {t('transactionsTitle')}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <SelectField
          label={t('colType')}
          value={filters.kind}
          onValueChange={(v) => set('kind', v as Filters['kind'])}
          emptyLabel={t('filterAll')}
          options={[
            { value: 'donation', label: t('purpose_donation') },
            { value: 'dues', label: t('purpose_dues') },
          ]}
        />
        <SelectField
          label={t('colCurrency')}
          value={filters.currency}
          onValueChange={(v) => set('currency', v as Filters['currency'])}
          emptyLabel={t('filterAll')}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
        <SelectField
          label={t('colStatus')}
          value={filters.status}
          onValueChange={(v) => set('status', v as Filters['status'])}
          emptyLabel={t('filterAll')}
          options={[
            { value: 'succeeded', label: t('txStatus_succeeded') },
            { value: 'refunded', label: t('txStatus_refunded') },
          ]}
        />
        <SelectField
          label={t('colProvider')}
          value={filters.provider}
          onValueChange={(v) => set('provider', v as Filters['provider'])}
          emptyLabel={t('filterAll')}
          options={[
            { value: 'stripe', label: t('provider_stripe') },
            { value: 'fake', label: t('provider_fake') },
          ]}
        />
      </div>

      {status === 'LoadingFirstPage' ? (
        <p className="mt-5 text-ink-soft">{t('loading')}</p>
      ) : results.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">{t('transactionsEmpty')}</p>
      ) : (
        <ScrollableRegion label={t('transactionsTitle')} className="mt-5">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={`${TH} sticky start-0 z-[1] bg-paper`}>
                  {t('colDate')}
                </th>
                <th className={TH}>{t('colPayer')}</th>
                <th className={TH}>{t('colType')}</th>
                <th className={TH}>{t('colAmount')}</th>
                <th className={TH}>{t('colProvider')}</th>
                <th className={TH}>{t('colStatus')}</th>
                <th className={TH}>{t('colReceipt')}</th>
                <th className={TH}>
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((tx) => (
                <tr
                  key={tx._id}
                  className="border-b border-line align-top"
                  data-testid="finance-tx-row"
                >
                  <td className="sticky start-0 z-[1] bg-paper py-3 pe-4 whitespace-nowrap text-ink-soft">
                    {formatDay(tx.paidAt, locale)}
                  </td>
                  <td className="py-3 pe-4">
                    <span className="block wrap-anywhere">
                      {tx.name ?? '—'}
                    </span>
                    <span className="block wrap-anywhere text-xs text-muted">
                      {tx.email}
                    </span>
                  </td>
                  <td className="py-3 pe-4">
                    {tx.kind === 'dues'
                      ? t('purpose_dues')
                      : tx.recurring
                        ? t('frequencyMonthly')
                        : t('purpose_donation')}
                  </td>
                  <td className="py-3 pe-4 whitespace-nowrap font-mono">
                    {formatMoney(tx.amountMinor, tx.currency, locale)}
                  </td>
                  <td className="py-3 pe-4">
                    {vocabulary(t, 'provider_', tx.provider)}
                  </td>
                  <td className="py-3 pe-4">
                    {vocabulary(t, 'txStatus_', tx.status)}
                    {tx.refundReason ? (
                      <span className="block max-w-[28ch] wrap-anywhere text-xs text-muted">
                        {tx.refundReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pe-4">
                    {tx.receiptId && tx.receiptNumber ? (
                      <ReceiptButton
                        receiptId={tx.receiptId}
                        number={tx.receiptNumber}
                        ready
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3">
                    {tx.status === 'succeeded' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(tx);
                          setReason('');
                          setViaProvider(false);
                        }}
                      >
                        {t('refund')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableRegion>
      )}
      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />

      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? t('refundConfirm', {
                amount: formatMoney(
                  target.amountMinor,
                  target.currency,
                  locale,
                ),
                email: target.email,
              })
            : ''
        }
        description={
          target ? (
            <div className="space-y-3">
              <TextField
                label={t('refundReason')}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
              />
              {target.canRefundAtProvider ? (
                <label className="flex min-h-11 items-start gap-2 text-sm text-ink-soft">
                  <Checkbox
                    checked={viaProvider}
                    onCheckedChange={(checked) =>
                      setViaProvider(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span>{t('refundViaProvider')}</span>
                </label>
              ) : (
                <p className="text-xs text-muted">{t('refundMarkOnly')}</p>
              )}
            </div>
          ) : null
        }
        confirmLabel={t('refund')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onCancel={() => setTarget(null)}
        onConfirm={confirmRefund}
      />
    </section>
  );
}

function ExportBlock({ now }: { now: number }) {
  const t = useTranslations('payments');
  const notify = useActionFeedback();
  const exportTx = useMutation(api.payments.finances.exportTransactions);
  const today = new Date(now).toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const fromMs = Date.parse(`${from}T00:00:00Z`);
      // Upper bound EXCLUDED: add one day to include the end date.
      const toMs = Date.parse(`${to}T00:00:00Z`) + 86_400_000;
      if (
        !Number.isFinite(fromMs) ||
        !Number.isFinite(toMs) ||
        toMs <= fromMs
      ) {
        notify(t('exportInvalidRange'), 'error');
        return;
      }
      const { rows, truncated } = await exportTx({ fromMs, toMs });
      downloadCsv(
        `paiements-${from}-${to}.csv`,
        [
          'date',
          'type',
          'recurrent',
          'montant',
          'devise',
          'statut',
          'prestataire',
          'reference_prestataire',
          'recu',
          'payeur',
          'email',
          'rembourse_le',
          'motif_remboursement',
        ],
        rows.map((r) => [
          new Date(r.paidAt).toISOString(),
          r.kind,
          r.recurring ? 'oui' : 'non',
          // Amount in major units, decimal point: readable by a spreadsheet
          // as well as by accounting software.
          (r.amountMinor / (r.currency === 'EUR' ? 100 : 1)).toFixed(
            r.currency === 'EUR' ? 2 : 0,
          ),
          r.currency,
          r.status,
          r.provider,
          r.providerPaymentId,
          r.receiptNumber ?? '',
          r.name ?? '',
          r.email,
          r.refundedAt ? new Date(r.refundedAt).toISOString() : '',
          r.refundReason ?? '',
        ]),
      );
      notify(
        truncated
          ? t('exportTruncated', { count: rows.length })
          : t('exportDone', { count: rows.length }),
      );
    } catch (err) {
      notify(vocabulary(t, 'err_', knownPaymentError(err)), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="export-title">
      <h2 id="export-title" className="font-display text-2xl">
        {t('exportTitle')}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{t('exportBody')}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <TextField
          label={t('exportFrom')}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          label={t('exportTo')}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={run}
        >
          {t('exportCsv')}
        </Button>
      </div>
    </section>
  );
}

function LateDues({ now }: { now: number }) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const late = useQuery(api.payments.finances.lateDues, { now });
  return (
    <section aria-labelledby="late-title">
      <h2 id="late-title" className="font-display text-2xl">
        {t('lateTitle')}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{t('lateBody')}</p>
      {late === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : late.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{t('lateEmpty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {late.map((l) => (
            <li
              key={l.payerUserId}
              className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="wrap-anywhere">
                <span className="font-medium text-ink">
                  {l.organization ?? l.name ?? l.email ?? '—'}
                </span>
                {l.email ? (
                  <span className="block text-xs text-muted">{l.email}</span>
                ) : null}
              </span>
              <span className="text-ink-soft">
                {t('lateSince', {
                  date: formatDay(l.periodEnd, locale),
                  amount: formatMoney(l.amountMinor, l.currency, locale),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Subscriptions() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const notify = useActionFeedback();
  const { results, status, loadMore } = usePaginatedQuery(
    api.payments.finances.listSubscriptions,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const cancel = useMutation(api.payments.finances.cancelSubscription);
  const [target, setTarget] = useState<(typeof results)[number] | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <section aria-labelledby="subs-title">
      <h2 id="subs-title" className="font-display text-2xl">
        {t('subscriptionsTitle')}
      </h2>
      {status === 'LoadingFirstPage' ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{t('subscriptionsEmpty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {results.map((s) => (
            <li
              key={s._id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <span className="wrap-anywhere">
                <span className="font-mono text-ink">
                  {formatMoney(s.amountMinor, s.currency, locale)}
                </span>{' '}
                <span className="text-ink-soft">· {s.email}</span>
                <span className="block text-xs text-muted">
                  {vocabulary(t, 'subStatus_', s.status)} ·{' '}
                  {vocabulary(t, 'provider_', s.provider)} ·{' '}
                  {vocabulary(t, 'subMode_', s.mode)}
                  {s.status === 'active'
                    ? ` · ${t('recurringNext', { date: formatDay(s.nextDueAt, locale) })}`
                    : ''}
                </span>
              </span>
              {s.status !== 'cancelled' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTarget(s)}
                >
                  {t('recurringStop')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? t('adminStopConfirm', {
                amount: formatMoney(
                  target.amountMinor,
                  target.currency,
                  locale,
                ),
                email: target.email,
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
          try {
            await cancel({ subscriptionId: target._id });
            notify(t('recurringStopped'));
          } catch (err) {
            notify(vocabulary(t, 'err_', knownPaymentError(err)), 'error');
          } finally {
            setPending(false);
            setTarget(null);
          }
        }}
      />
    </section>
  );
}

function AuditTrail() {
  const t = useTranslations('payments');
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(
    api.payments.finances.auditTrail,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  return (
    <section aria-labelledby="audit-title">
      <h2 id="audit-title" className="font-display text-2xl">
        {t('auditTitle')}
      </h2>
      {status === 'LoadingFirstPage' ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{t('auditEmpty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
          {results.map((e, i) => (
            <li
              key={i}
              className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"
            >
              <span>
                <span className="font-medium text-ink">
                  {vocabulary(t, 'audit_', e.action.replace('payment.', ''))}
                </span>
                <span className="block wrap-anywhere text-xs text-muted">
                  {e.actorEmail ?? '—'}
                </span>
              </span>
              <span className="text-ink-soft">
                {new Date(e.createdAt).toLocaleString(intlLocale(locale))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <LoadMore status={status} loadMore={loadMore} pageSize={PAGE_SIZE} />
    </section>
  );
}
