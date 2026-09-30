'use client';

import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Choice controls of the profile editor. All three keep a REAL form control
// (`<input type="checkbox|radio">`) inside a wrapping `<label>`: the
// semantics, the keyboard behaviour and the accessible name come from the
// platform; only the look is drawn. Wrapping labels carry no `htmlFor` — the
// association is structural (see the `libelleRattacheALaMain` rule).

// A set of pills that can each be on or off (themes, languages).
export function ChipGroup({
  legend,
  hint,
  options,
  value,
  onToggle,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  options: readonly { value: string; label: string }[];
  value: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                'inline-flex min-h-10 cursor-pointer select-none items-center gap-1.5 rounded-pill border px-3.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text',
                on
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-line-strong bg-surface text-ink-soft hover:border-accent-edge hover:bg-accent-tint hover:text-ink',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onToggle(o.value)}
              />
              {on ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// One choice among several, each with a title, a description and an icon
// (profile visibility, who may write to me).
export function ChoiceCards<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  name: string;
  options: readonly {
    value: T;
    title: string;
    description?: string;
    icon?: LucideIcon;
  }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-3 grid gap-2 @xl:grid-cols-3">
        {options.map((o) => {
          const on = value === o.value;
          const Icon = o.icon;
          return (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-md border p-3.5 transition-colors',
                on
                  ? 'border-accent bg-accent-tint'
                  : 'border-line-strong bg-surface hover:border-accent-edge hover:bg-surface-2',
              )}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name={name}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  checked={on}
                  onChange={() => onChange(o.value)}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 text-sm font-medium',
                    on ? 'text-accent-text' : 'text-ink',
                  )}
                >
                  {o.title}
                </span>
                {Icon ? (
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'h-4 w-4 shrink-0',
                      on ? 'text-accent-text' : 'text-muted',
                    )}
                  />
                ) : null}
              </span>
              {o.description ? (
                <span className="text-xs leading-relaxed text-ink-soft">
                  {o.description}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// An on/off setting drawn as a switch. The control stays a checkbox, with
// the `switch` role: a screen reader says "on"/"off" rather than "checked".
export function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-center justify-between gap-4 rounded-sm px-2 py-2 transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-surface-2',
      )}
    >
      <span className="min-w-0 flex-1 text-sm text-ink">
        {label}
        {hint ? (
          <span className="mt-0.5 block text-xs text-muted">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill border border-line-field bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text [&>span]:translate-x-0.5 [&>span]:bg-muted peer-checked:[&>span]:translate-x-[18px] peer-checked:[&>span]:bg-accent-contrast rtl:[&>span]:-translate-x-0.5 rtl:peer-checked:[&>span]:-translate-x-[18px]"
      >
        <span className="block h-4 w-4 rounded-full shadow-card transition-transform" />
      </span>
    </label>
  );
}
