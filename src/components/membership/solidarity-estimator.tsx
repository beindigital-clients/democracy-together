'use client';

import { useState } from 'react';
import {
  estimate,
  type IncomeLevel,
  type MemberType,
  type MembershipContent,
} from '@/lib/membership-content';

type EstimatorContent = MembershipContent['estimator'];

// Estimateur de cotisation solidaire (F-20) — îlot client : le montant se
// recalcule en direct selon le niveau de revenu du pays, le type d'adhésion et
// la devise. Montants indicatifs (cf. lib/membership-content).
export function SolidarityEstimator({
  content,
  locale,
}: {
  content: EstimatorContent;
  locale: 'fr' | 'en';
}) {
  const [income, setIncome] = useState<IncomeLevel>('high');
  const [type, setType] = useState<MemberType>('org');
  const [currency, setCurrency] = useState<'EUR' | 'XOF'>('EUR');

  const amount = estimate(type, income, currency);
  const formatted = amount.toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR');
  const typeLabel = content.types.find((t) => t.value === type)!.label;
  const incomeLabel = content.incomes.find((i) => i.value === income)!.label.toLowerCase();
  const ctx = content.ctxTemplate.replace('{type}', typeLabel).replace('{income}', incomeLabel);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_.9fr]">
      <form aria-label={content.title} className="flex flex-col gap-5">
        <RadioGroup
          legend={`${content.incomeLabel} `}
          hint={content.incomeHint}
          name="income"
          value={income}
          options={content.incomes}
          onChange={(v) => setIncome(v as IncomeLevel)}
        />
        <RadioGroup
          legend={content.typeLabel}
          name="etype"
          value={type}
          options={content.types}
          onChange={(v) => setType(v as MemberType)}
        />
        <RadioGroup
          legend={content.currencyLabel}
          name="cur"
          value={currency}
          options={[
            { value: 'EUR', label: 'EUR', desc: 'Euro' },
            { value: 'XOF', label: 'XOF', desc: locale === 'en' ? 'CFA franc (West Africa)' : "Franc CFA (Afrique de l'Ouest)" },
          ]}
          onChange={(v) => setCurrency(v as 'EUR' | 'XOF')}
          cols={2}
        />
      </form>

      <div aria-live="polite" className="flex flex-col rounded-md border border-line bg-paper p-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{content.outLabel}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <b className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{formatted}</b>
          <span className="font-mono text-sm text-ink-soft">{currency}</span>
        </div>
        <span className="mt-1 text-[12px] text-muted">{content.perYear}</span>
        <p className="mt-4 text-[13px] text-ink-soft">{ctx}</p>
        <div className="mt-auto flex gap-2.5 rounded-sm border border-accent-edge bg-accent-tint p-3 text-[12.5px] leading-relaxed text-accent-text">
          <span aria-hidden="true">♥</span>
          <span>{content.solidarity}</span>
        </div>
      </div>
    </div>
  );
}

function RadioGroup({
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
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">
        {legend}
        {hint ? <span className="ml-1 font-normal text-muted">{hint}</span> : null}
      </legend>
      <div className={`grid gap-2 ${cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer flex-col rounded-sm border px-3.5 py-2.5 transition-colors ${
                active ? 'border-accent bg-accent-tint' : 'border-line-strong bg-surface hover:border-ink'
              }`}
            >
              <input type="radio" name={name} value={o.value} checked={active} onChange={() => onChange(o.value)} className="sr-only" />
              <span className={`text-sm font-semibold ${active ? 'text-accent-text' : 'text-ink'}`}>{o.label}</span>
              <span className="text-[12px] text-muted">{o.desc}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
