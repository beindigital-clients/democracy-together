'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { directoryHref, type DirectoryFilters } from '@/lib/orgs';
import { useDirectoryNavigation } from './directory-navigation';
import { Button } from '@/components/ui/button';

// Directory full-text search (F-19). A GET form: without JavaScript it is
// submitted as is (the hidden inputs keep the active facets). With it, it goes
// through the directory navigation — without scrolling back to the top.
export function DirectorySearch({
  filters,
  placeholder,
  cta,
}: {
  filters: DirectoryFilters;
  placeholder: string;
  cta: string;
}) {
  const { navigate } = useDirectoryNavigation();
  const [value, setValue] = useState(filters.q ?? '');
  // The URL query also changes without this field: the reset link, "Back".
  // The field follows it, otherwise it would show a query the list no longer
  // applies (the old uncontrolled field did).
  const [urlQuery, setUrlQuery] = useState(filters.q);
  if (filters.q !== urlQuery) {
    setUrlQuery(filters.q);
    setValue(filters.q ?? '');
  }

  return (
    <form
      role="search"
      className="relative w-full md:w-72 lg:w-80"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(directoryHref(filters, { q: value.trim() || undefined }));
      }}
    >
      {filters.region ? (
        <input type="hidden" name="region" value={filters.region} />
      ) : null}
      {filters.theme ? (
        <input type="hidden" name="theme" value={filters.theme} />
      ) : null}
      {filters.country ? (
        <input type="hidden" name="country" value={filters.country} />
      ) : null}
      {filters.language ? (
        <input type="hidden" name="language" value={filters.language} />
      ) : null}
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // NON-visible label: `title` makes it readable on hover and meets one
        // condition of RGAA 11.1.3 (the placeholder disappears while typing).
        title={placeholder}
        className="h-10 py-0 pe-11"
      />
      <Button
        type="submit"
        variant="subtle"
        size="icon-sm"
        className="absolute end-1 top-1 rounded-xs"
      >
        <Search aria-hidden="true" />
        <span className="sr-only">{cta}</span>
      </Button>
    </form>
  );
}
