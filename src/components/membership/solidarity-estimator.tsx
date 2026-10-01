'use client';

import { useId, useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/components/payments/format';
import {
  estimate,
  type IncomeLevel,
  type MemberType,
  type MembershipContent,
} from '@/lib/membership-content';
import { intlLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/routing';
import {
  RadioGroup,
  RadioGroupChoice,
  RadioGroupChoiceIndicator,
} from '@/components/ui/radio-group';

type EstimatorContent = MembershipContent['estimator'];

// Solidarity membership fee estimator (F-20) — client island: the amount is
// recalculated live according to the country's income level and the membership type.
//
// ACTUAL FEE SCALE (F-27): as soon as the administrator has published the scale
// (/admin/finances/formules), IT is what is shown — in euros and in CFA
// francs — with the link to pay the fee in the member area. As long
// as it does not exist, the original indicative estimate stays shown, and
// labelled as indicative (see lib/membership-content).
export function SolidarityEstimator({
  content,
  locale,
}: {
  content: EstimatorContent;
  locale: Locale;
}) {
  const [income, setIncome] = useState<IncomeLevel>('high');
  const [type, setType] = useState<MemberType>('org');

  const tp = useTranslations('payments');
  const plans = useQuery(api.payments.plans.publicPlans, {});
  const plan = plans?.find((p) => p.category === type && p.zone === income);
  const amount = estimate(type, income);
  const formatted = amount.toLocaleString(intlLocale(locale));
  const typeLabel = content.types.find((t) => t.value === type)!.label;
  const incomeLabel = content.incomes
    .find((i) => i.value === income)!
    .label.toLowerCase();
  const ctx = content.ctxTemplate
    .replace('{type}', typeLabel)
    .replace('{income}', incomeLabel);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_.9fr]">
      <form aria-label={content.title} className="flex flex-col gap-5">
        <ChoiceCards
          legend={`${content.incomeLabel} `}
          hint={content.incomeHint}
          name="income"
          value={income}
          options={content.incomes}
          onChange={(v) => setIncome(v as IncomeLevel)}
        />
        <ChoiceCards
          legend={content.typeLabel}
          name="etype"
          value={type}
          options={content.types}
          onChange={(v) => setType(v as MemberType)}
        />
      </form>

      <div
        aria-live="polite"
        className="flex flex-col rounded-md border border-line bg-paper p-6"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {content.outLabel}
        </div>
        {plan && (plan.amountEur !== null || plan.amountUsd !== null) ? (
          <>
            <div
              className="mt-2 flex flex-col gap-1"
              data-testid="plan-amounts"
            >
              {plan.amountEur !== null ? (
                <b className="font-mono text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {formatMoney(plan.amountEur, 'EUR', locale)}
                </b>
              ) : null}
              {plan.amountUsd !== null ? (
                <b className="font-mono text-[22px] font-semibold leading-tight text-ink-soft">
                  {formatMoney(plan.amountUsd, 'USD', locale)}
                </b>
              ) : null}
            </div>
            <span className="mt-1 text-[12px] text-muted">
              {content.perYear} · {tp('planOfficial')}
            </span>
            <p className="mt-4 text-[13px] text-ink-soft">{ctx}</p>
            <Link
              href="/espace-membre/cotisations"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
            >
              {tp('payDuesCta')}
            </Link>
          </>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <b className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">
                {formatted}
              </b>
              <span className="font-mono text-sm text-ink-soft">EUR</span>
            </div>
            <span className="mt-1 text-[12px] text-muted">
              {content.perYear} · {tp('planIndicative')}
            </span>
            <p className="mt-4 text-[13px] text-ink-soft">{ctx}</p>
          </>
        )}
        <div className="mt-auto flex gap-2.5 rounded-sm border border-accent-edge bg-accent-tint p-3 text-[12.5px] leading-relaxed text-accent-text">
          <span aria-hidden="true">♥</span>
          <span>{content.solidarity}</span>
        </div>
      </div>
    </div>
  );
}

// One choice among a few, each a CARD with its description: the shadcn
// `RadioGroup`, whose choices are the cards themselves. The arrows move and
// choose; the focus outline is on the card, which IS the radio (RGAA 10.7),
// and a tick backs the accent colour of the chosen one (RGAA 3.1).
function ChoiceCards({
  legend,
  hint,
  name,
  value,
  options,
  onChange,
  cols,
}: {
  legend: string;
  hint?: string;
  name: string;
  value: string;
  options: { value: string; label: string; desc: string }[];
  onChange: (v: string) => void;
  cols?: number;
}) {
  const legendId = useId();
  return (
    <fieldset>
      <legend id={legendId} className="mb-2 text-sm font-medium text-ink">
        {legend}
        {hint ? (
          <span className="ms-1 font-normal text-muted">{hint}</span>
        ) : null}
      </legend>
      {/* Named after the legend: never an anonymous radio group (RGAA 11.6). */}
      <RadioGroup
        name={name}
        value={value}
        onValueChange={onChange}
        aria-labelledby={legendId}
        className={`gap-2 ${cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
      >
        {options.map((o) => (
          <RadioGroupChoice
            key={o.value}
            value={o.value}
            className="flex-col items-start gap-0 rounded-sm border-line-strong bg-surface px-3.5 py-2.5 hover:border-ink data-[state=checked]:border-accent"
          >
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink group-data-[state=checked]/choice:text-accent-text">
              <RadioGroupChoiceIndicator />
              {o.label}
            </span>
            {/* `text-ink-soft`, not `text-muted`: on `bg-accent-tint` in
                dark mode, muted gives 3.93:1 (measured on 27/09). */}
            <span className="text-[12px] font-normal text-ink-soft">
              {o.desc}
            </span>
          </RadioGroupChoice>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
