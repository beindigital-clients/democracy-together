'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  directoryHref,
  type DirectoryFacetParam,
  type DirectoryFilters,
} from '@/lib/orgs';
import { cn } from '@/lib/utils';
import { useDirectoryNavigation } from './directory-navigation';

export type FacetOption = {
  value: string;
  label: string;
  count: number;
  flag?: string;
};

// One directory facet (F-19) = ONE button, instead of a row of chips. On the
// demo data the four rows showed thirty-five of them at once ("All" four
// times) before the first result — and the country row grows with every new
// member.
//
// Single choice per facet, like the links it replaces (the query takes one
// value per filter): `menuitemradio` items, the current choice checked. The
// button shows the selected value — the active filter can be read without
// opening the menu, and not from colour alone (RGAA 3.1).
//
// Labels and options arrive translated from the server: the `directory`
// namespace does not need to enter the catalogue sent to the browser (F-05).
export function FacetMenu({
  param,
  label,
  allLabel,
  total,
  options,
  filters,
}: {
  param: DirectoryFacetParam;
  label: string;
  allLabel: string;
  total: number;
  options: FacetOption[];
  filters: DirectoryFilters;
}) {
  const { navigate } = useDirectoryNavigation();
  const [open, setOpen] = useState(false);
  const selected = filters[param] ?? '';
  const current = options.find((o) => o.value === selected);

  function select(value: string) {
    if (value === selected) return;
    navigate(directoryHref(filters, { [param]: value || undefined }));
  }

  return (
    // `modal={false}`: no scroll lock and no hiding the rest of the page from
    // screen readers for a simple list of choices; a click on the next facet
    // opens it directly.
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        className={cn(
          'group inline-flex h-10 max-w-full items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors',
          current
            ? 'border-accent-edge bg-accent-tint text-accent-text'
            : 'border-line-field bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
        )}
      >
        <span className="shrink-0">{label}</span>
        {current ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-px shrink-0 bg-current opacity-30"
            />
            <span className="min-w-0 truncate font-semibold sm:max-w-[14rem]">
              {current.flag ? (
                <span aria-hidden="true" className="me-1.5">
                  {current.flag}
                </span>
              ) : null}
              {current.label}
            </span>
          </>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-56"
        // Tab closes the menu and returns focus to the button: Radix blocks
        // tabbing inside a menu, which otherwise left Escape as the only
        // keyboard exit.
        onKeyDown={(event) => {
          if (event.key === 'Tab') setOpen(false);
        }}
      >
        <DropdownMenuRadioGroup value={selected} onValueChange={select}>
          <DropdownMenuRadioItem value="" textValue={allLabel}>
            <span className="flex-1">{allLabel}</span>
            <Count value={total} />
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {options.map((o) => (
            // `textValue`: first-letter typeahead matches the name, not the
            // flag that opens the item's text.
            <DropdownMenuRadioItem
              key={o.value}
              value={o.value}
              textValue={o.label}
            >
              {o.flag ? <span aria-hidden="true">{o.flag}</span> : null}
              <span className="flex-1">{o.label}</span>
              <Count value={o.count} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="ms-4 font-mono text-[11px] font-normal tabular-nums text-muted">
      {value}
    </span>
  );
}
