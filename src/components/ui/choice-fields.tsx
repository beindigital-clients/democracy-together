'use client';

import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, type FieldShellProps } from '@/components/ui/field';
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
  SelectMenuValue,
} from '@/components/ui/select-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// The shadcn choice controls, plugged into the site's ONE field system
// (`field.tsx`, issue #41): the `Field` shell ties the label, the hint and
// the error to the control (`htmlFor`/`id`, `aria-describedby`,
// `aria-invalid`) exactly as it does for a text field. A separate module so
// that pages which only use text fields do not load Radix Select, Popover
// and cmdk.

// `lang`: the option's own language, when it differs from the page's (the
// interface languages are listed by their endonym, each in its language).
export type ChoiceOption = { value: string; label: string; lang?: string };

// A value Radix accepts for the "empty" choice ("all", "not specified"):
// Radix refuses an empty-string item value. Translated back to '' on change.
const EMPTY = '__empty__';

export function SelectMenuField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  id,
  value,
  onValueChange,
  options,
  emptyLabel,
  placeholder,
  dir,
  disabled,
}: FieldShellProps & {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  // Label of the "empty" choice, listed first; without it, a value is required.
  emptyLabel?: string;
  // Shown while no value is chosen yet (a required choice with no default).
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
}) {
  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      className={className}
      id={id}
    >
      {(control) => (
        <SelectMenu
          value={value === '' && emptyLabel ? EMPTY : value}
          onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}
          dir={dir}
          disabled={disabled}
        >
          <SelectMenuTrigger {...control} className={controlClassName}>
            <SelectMenuValue placeholder={placeholder} />
          </SelectMenuTrigger>
          <SelectMenuContent>
            {emptyLabel ? (
              <SelectMenuItem value={EMPTY}>{emptyLabel}</SelectMenuItem>
            ) : null}
            {options.map((o) => (
              <SelectMenuItem key={o.value} value={o.value} lang={o.lang}>
                {o.label}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
      )}
    </Field>
  );
}

// Accents and case do not count when searching: "senegal", "Sénégal" and
// "SN" all find Senegal.
export function foldSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesSearch(haystack: string, search: string): boolean {
  const needle = foldSearch(search);
  return needle === '' || foldSearch(haystack).includes(needle);
}

// A select whose list can be SEARCHED (shadcn "combobox": Popover + Command):
// for long lists, the countries first. The trigger is a button named by the
// field's label; the panel opens on a search field that filters as one
// types, the arrows move through the matches and Enter picks one.
export function ComboboxField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  id,
  value,
  onValueChange,
  options,
  placeholder,
  emptyLabel,
  searchLabel,
  searchPlaceholder,
  noResults,
}: Omit<FieldShellProps, 'label'> & {
  // A string, not any node: it also names the panel and its list.
  label: string;
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  // Shown on the trigger while nothing is chosen.
  placeholder: string;
  // Label of the "empty" choice, listed first; without it, none is offered.
  emptyLabel?: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResults: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;

  function pick(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      className={className}
      id={id}
    >
      {(control) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? listId : undefined}
              {...control}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-line-field bg-surface px-3 py-2 text-start text-sm transition-colors hover:bg-surface-2 focus-visible:border-accent-text aria-[invalid=true]:border-bar-5',
                selected ? 'text-ink' : 'text-muted',
                controlClassName,
              )}
            >
              <span className="min-w-0 wrap-anywhere">
                {selected?.label ?? placeholder}
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-label={label}
            className="w-(--radix-popover-trigger-width) min-w-[16rem] p-0"
          >
            <Command
              // NAMES. cmdk names its search field through a hidden label of
              // its own (`aria-labelledby`, which wins over an `aria-label`)
              // and its list "Suggestions", in English: both are given the
              // page's words here, or the field would have no name at all.
              label={searchLabel}
              // The list is already in the reader's language and order:
              // cmdk only has to keep the matches, not to re-rank them.
              shouldFilter
              filter={(itemValue, search) =>
                matchesSearch(itemValue, search) ? 1 : 0
              }
            >
              <CommandInput placeholder={searchPlaceholder} />
              <CommandList id={listId} label={label}>
                <CommandEmpty>{noResults}</CommandEmpty>
                <CommandGroup>
                  {emptyLabel ? (
                    <CommandItem value={emptyLabel} onSelect={() => pick('')}>
                      <Check
                        aria-hidden="true"
                        className={cn(
                          value === '' ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {emptyLabel}
                    </CommandItem>
                  ) : null}
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      // The code is searchable too ("CI", "SN").
                      value={`${o.label} ${o.value}`}
                      onSelect={() => pick(o.value)}
                      data-checked={o.value === value || undefined}
                      className="data-[checked=true]:font-medium data-[checked=true]:text-accent-text"
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          o.value === value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </Field>
  );
}
