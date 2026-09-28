'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import {
  fromMinor,
  PLAN_CATEGORIES,
  PLAN_ZONES,
  type PlanCategory,
  type PlanZone,
} from '@convex/lib/payments/amounts';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { useActionFeedback } from '@/components/admin/action-feedback';
import { vocabulary } from '@/i18n/vocabulary';
import { formatDay, knownPaymentError } from './format';

// ÉDITION DU BARÈME (F-27) — administrateurs. Une ligne par (catégorie,
// zone), un montant par devise ; un champ vide = formule non proposée dans
// cette devise. Chaque enregistrement est journalisé côté serveur.

type Row = {
  category: PlanCategory;
  zone: PlanZone;
  amountEur: number | null;
  amountUsd: number | null;
  active: boolean;
  updatedAt: number | null;
};

export function AdminPlans() {
  const t = useTranslations('payments');
  const notify = useActionFeedback();
  const plans = useQuery(api.payments.plans.adminPlans, {});
  const seed = useMutation(api.payments.plans.seedDefaultPlans);

  if (plans === undefined)
    return <p className="text-ink-soft">{t('loading')}</p>;

  const rows: Row[] = PLAN_CATEGORIES.flatMap((category) =>
    PLAN_ZONES.map((zone) => {
      const p = plans.find((x) => x.category === category && x.zone === zone);
      return {
        category,
        zone,
        amountEur: p?.amountEur ?? null,
        amountUsd: p?.amountUsd ?? null,
        active: p?.active ?? false,
        updatedAt: p?.updatedAt ?? null,
      };
    }),
  );
  const missing = rows.filter((r) => r.updatedAt === null).length;

  return (
    <div>
      <Link
        href="/admin/finances"
        className="inline-block py-2 text-sm font-medium text-accent-text hover:underline"
      >
        {t('backToFinances')}
      </Link>
      <h1 className="mt-2 font-display text-3xl">{t('plansTitle')}</h1>
      <p className="mt-2 max-w-[70ch] text-sm text-ink-soft">
        {t('plansIntro')}
      </p>
      {missing > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-accent-edge bg-accent-tint p-4 text-sm text-accent-text">
          <span>{t('plansMissing', { count: missing })}</span>
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              try {
                const created = await seed({});
                notify(t('plansSeeded', { count: created }));
              } catch (err) {
                notify(vocabulary(t, 'err_', knownPaymentError(err)), 'error');
              }
            }}
          >
            {t('plansSeed')}
          </Button>
        </div>
      ) : null}
      <ScrollableRegion label={t('plansTitle')} className="mt-6">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-start font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pe-4 text-start font-normal">
                {t('planCategory')}
              </th>
              <th className="py-2 pe-4 text-start font-normal">
                {t('planZone')}
              </th>
              <th className="py-2 pe-4 text-start font-normal">EUR</th>
              <th className="py-2 pe-4 text-start font-normal">USD</th>
              <th className="py-2 pe-4 text-start font-normal">
                {t('planActive')}
              </th>
              <th className="py-2 text-start font-normal">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PlanRow
                key={`${r.category}-${r.zone}-${r.updatedAt ?? 0}`}
                row={r}
              />
            ))}
          </tbody>
        </table>
      </ScrollableRegion>
    </div>
  );
}

function PlanRow({ row }: { row: Row }) {
  const t = useTranslations('payments');
  const locale = useLocale();
  const notify = useActionFeedback();
  const upsert = useMutation(api.payments.plans.upsertPlan);
  const [eur, setEur] = useState(
    row.amountEur === null ? '' : String(fromMinor(row.amountEur, 'EUR')),
  );
  const [usd, setUsd] = useState(
    row.amountUsd === null ? '' : String(fromMinor(row.amountUsd, 'USD')),
  );
  const [active, setActive] = useState(row.active || row.updatedAt === null);
  const [pending, setPending] = useState(false);
  const label = `${vocabulary(t, 'category_', row.category)} · ${vocabulary(t, 'zone_', row.zone)}`;

  const parse = (v: string) =>
    v.trim() === '' ? null : Number(v.replace(',', '.'));

  return (
    <tr
      className="border-b border-line align-middle"
      data-testid={`plan-${row.category}-${row.zone}`}
    >
      <th scope="row" className="py-2.5 pe-4 text-start font-medium">
        {vocabulary(t, 'category_', row.category)}
      </th>
      <td className="py-2.5 pe-4 text-ink-soft">
        {vocabulary(t, 'zone_', row.zone)}
        {row.updatedAt ? (
          <span className="block text-xs text-muted">
            {t('planUpdated', { date: formatDay(row.updatedAt, locale) })}
          </span>
        ) : null}
      </td>
      <td className="py-2.5 pe-4">
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          step={0.01}
          value={eur}
          onChange={(e) => setEur(e.target.value)}
          aria-label={t('planAmountLabel', { plan: label, currency: 'EUR' })}
          className="w-32"
        />
      </td>
      <td className="py-2.5 pe-4">
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          step={0.01}
          value={usd}
          onChange={(e) => setUsd(e.target.value)}
          aria-label={t('planAmountLabel', { plan: label, currency: 'USD' })}
          className="w-32"
        />
      </td>
      <td className="py-2.5 pe-4">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          aria-label={t('planActiveLabel', { plan: label })}
          className="size-5"
        />
      </td>
      <td className="py-2.5">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await upsert({
                category: row.category,
                zone: row.zone,
                amountEur: parse(eur),
                amountUsd: parse(usd),
                active,
              });
              notify(t('planSaved', { plan: label }));
            } catch (err) {
              notify(vocabulary(t, 'err_', knownPaymentError(err)), 'error');
            } finally {
              setPending(false);
            }
          }}
        >
          {t('save')}
        </Button>
      </td>
    </tr>
  );
}
