'use client';

import { useId, type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CheckboxChoice,
  CheckboxChoiceIndicator,
} from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';

// Choice controls of the profile editor, each inside a wrapping `<label>`
// that names it and makes the whole line clickable. Wrapping labels carry no
// `htmlFor` — the association is structural (see the
// `libelleRattacheALaMain` rule). The pills are shadcn `CheckboxChoice`
// chips, named by their own text; the cards and the switch are the shadcn
// `RadioGroup` and `Switch`, whose semantics and keyboard behaviour Radix
// carries.

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
        {options.map((o) => (
          <CheckboxChoice
            key={o.value}
            checked={value.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            className="min-h-10 select-none rounded-pill px-3.5"
          >
            <CheckboxChoiceIndicator />
            {o.label}
          </CheckboxChoice>
        ))}
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
  const legendId = useId();
  return (
    <fieldset className="min-w-0">
      <legend id={legendId} className="text-sm font-medium text-ink">
        {legend}
      </legend>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <RadioGroup
        name={name}
        value={value}
        onValueChange={(next) => onChange(next as T)}
        aria-labelledby={legendId}
        className="mt-3 grid gap-2 @xl:grid-cols-3"
      >
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
                <RadioGroupItem value={o.value} />
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
      </RadioGroup>
    </fieldset>
  );
}

// An on/off setting: the shadcn `Switch` (`switch` role — a screen reader
// says "on"/"off" rather than "checked"), named by the whole line.
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
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  );
}
