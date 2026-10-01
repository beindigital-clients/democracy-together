'use client';

import { useId, useState, type Ref } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Field,
  type FieldOrientation,
  type FieldShellProps,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
//
// Which one to use:
// - `SelectField`: a closed list of a few values (a type, a role, a
//   language, a level). Radix Select — the first letters typed on the closed
//   button pick a value, as on a native select.
// - `ComboboxField`: a list that grows with the data or is long by nature
//   (countries, time zones, members, organisations, publications…). Its
//   panel opens on a search field.
//
// Both take a plain `options` array and call `onValueChange` with the bare
// value. From `useFormFields`, spread the field and hand its `onChange` over,
// as shadcn does with a form library:
// `<SelectField {...field('theme')} onValueChange={field('theme').onChange} />`.

// `lang`: the option's own language, when it differs from the page's (the
// interface languages are listed by their endonym, each in its language).
export type ChoiceOption = {
  value: string;
  label: string;
  lang?: string;
  disabled?: boolean;
};

// A value Radix accepts for the "empty" choice ("all", "not specified"):
// Radix refuses an empty-string item value. Translated back to '' on change,
// and in the submitted form.
const EMPTY = '__empty__';

// What both fields share beyond the shell.
type ChoiceProps = {
  id?: string;
  // Submits the value with the enclosing form (`FormData`, GET forms). The
  // value submitted for the empty choice is '' — as a native select's.
  name?: string;
  form?: string;
  options: readonly ChoiceOption[];
  // Label of the "empty" choice, listed first; without it, a value is
  // expected (the placeholder shows until one is chosen).
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  // The trigger, for `useFormFields` to move focus to the first faulty field.
  ref?: Ref<HTMLButtonElement>;
};

// Controlled (`value` + `onValueChange`) or not (`defaultValue` only, from a
// server-rendered GET form): either way the current value is known here,
// for the hidden field that submits it.
function useChoiceValue(
  value: string | undefined,
  defaultValue: string | undefined,
  onValueChange: ((value: string) => void) | undefined,
) {
  const [own, setOwn] = useState(defaultValue ?? '');
  const current = value ?? own;
  function change(next: string) {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  }
  return [current, change] as const;
}

// The submitted value. A disabled control submits nothing, as a native one.
function HiddenValue({
  name,
  form,
  value,
  disabled,
}: {
  name?: string;
  form?: string;
  value: string;
  disabled?: boolean;
}) {
  if (!name || disabled) return null;
  return <input type="hidden" name={name} form={form} value={value} />;
}

export function SelectField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  id,
  name,
  form,
  value,
  defaultValue,
  onValueChange,
  options,
  emptyLabel,
  placeholder,
  required,
  disabled,
  size,
  orientation,
  dir,
  ref,
}: FieldShellProps &
  ChoiceProps & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    // Shown while no value is chosen yet (a required choice with no default).
    placeholder?: string;
    size?: 'sm' | 'default';
    orientation?: FieldOrientation;
    // Only for a list whose options are in another script than the page;
    // otherwise the site's `DirectionProvider` sets it.
    dir?: 'ltr' | 'rtl';
  }) {
  const [current, change] = useChoiceValue(value, defaultValue, onValueChange);

  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      className={className}
      id={id}
      orientation={orientation}
    >
      {(control) => (
        <>
          <Select
            value={current === '' && emptyLabel ? EMPTY : current}
            onValueChange={(v) => change(v === EMPTY ? '' : v)}
            required={required}
            disabled={disabled}
            dir={dir}
          >
            <SelectTrigger
              ref={ref}
              {...control}
              size={size}
              // Inline, the button takes the width of its choice.
              className={cn(
                orientation !== 'horizontal' && 'w-full',
                controlClassName,
              )}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {emptyLabel ? (
                  <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>
                ) : null}
                {options.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    lang={o.lang}
                    disabled={o.disabled}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <HiddenValue
            name={name}
            form={form}
            value={current}
            disabled={disabled}
          />
        </>
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

// What cmdk filters on: the label, and the value too ("CI", "SN", "UTC").
function searchText(o: ChoiceOption): string {
  return `${o.label} ${o.value}`;
}

// A select whose list can be SEARCHED (shadcn "combobox": Popover + Command):
// for long lists, the countries first. The trigger is a button named by the
// field's label; the panel opens on a search field that filters as one
// types, the arrows move through the matches and Enter picks one. The
// current choice is the highlighted line on opening, scrolled into view.
export function ComboboxField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  id,
  name,
  form,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  emptyLabel,
  required,
  disabled,
  ref,
  searchLabel,
  searchPlaceholder,
  noResults,
}: Omit<FieldShellProps, 'label'> &
  ChoiceProps & {
    // A string, not any node: it also names the panel and its list.
    label: string;
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    // Shown on the trigger while nothing is chosen.
    placeholder: string;
    searchLabel: string;
    searchPlaceholder: string;
    noResults: string;
  }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [current, change] = useChoiceValue(value, defaultValue, onValueChange);
  const selected = options.find((o) => o.value === current) ?? null;

  function pick(next: string) {
    change(next);
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
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                ref={ref}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={open ? listId : undefined}
                aria-required={required || undefined}
                disabled={disabled}
                {...control}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-line-field bg-surface px-3 py-2.5 text-start transition-colors hover:bg-surface-2 focus-visible:border-accent-text disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-bar-5',
                  selected ? 'text-ink' : 'text-muted',
                  controlClassName,
                )}
              >
                <span className="min-w-0 wrap-break-word hyphens-auto">
                  {selected?.label ?? placeholder}
                </span>
                <ChevronsUpDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={label}
              className="w-(--radix-popover-trigger-width) min-w-[16rem] max-w-[calc(100vw-2rem)] p-0"
            >
              <Command
                // NAMES. cmdk names its search field through a hidden label
                // of its own (`aria-labelledby`, which wins over an
                // `aria-label`) and its list "Suggestions", in English: both
                // are given the page's words here, or the field would have no
                // name at all.
                label={searchLabel}
                // The current choice is the highlighted line on opening.
                defaultValue={selected ? searchText(selected) : undefined}
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
                      <CommandItem
                        value={emptyLabel}
                        onSelect={() => pick('')}
                        data-checked={current === '' || undefined}
                        className="data-[checked=true]:font-medium data-[checked=true]:text-accent-text"
                      >
                        <Check
                          aria-hidden="true"
                          className={cn(
                            current === '' ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {emptyLabel}
                      </CommandItem>
                    ) : null}
                    {options.map((o) => (
                      <CommandItem
                        key={o.value}
                        value={searchText(o)}
                        lang={o.lang}
                        disabled={o.disabled}
                        onSelect={() => pick(o.value)}
                        data-checked={o.value === current || undefined}
                        className="data-[checked=true]:font-medium data-[checked=true]:text-accent-text"
                      >
                        <Check
                          aria-hidden="true"
                          className={cn(
                            o.value === current ? 'opacity-100' : 'opacity-0',
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
          <HiddenValue
            name={name}
            form={form}
            value={current}
            disabled={disabled}
          />
        </>
      )}
    </Field>
  );
}
