'use client';

import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { PROFILE_LANGUAGES, PROFILE_THEMES } from '@convex/lib/social';
import { languageName } from '@/lib/orgs';
import { isMember } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { PersonCard } from './person-card';

// PEOPLE DIRECTORY — reserved for network members.
//
// What the screen does NOT do, and why: it filters nothing itself. The
// `social.profiles.search` query excludes private profiles in the index, and
// re-reads the actual visibility of each row (owner's role, blocking).
// A browser-side filter would already have let the data through.

export function PeopleDirectory({
  themeLabels,
}: {
  themeLabels: Record<string, string>;
}) {
  const t = useTranslations('people');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [theme, setTheme] = useState('');
  const [language, setLanguage] = useState('');
  const [country, setCountry] = useState('');

  // The search fires 300 ms after the last keystroke: each character does not
  // restart an index read on a slow connection.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const member = isMember(me?.role);
  const countryCode = /^[A-Za-z]{2}$/.test(country) ? country : '';
  const result = useQuery(
    api.social.profiles.search,
    member
      ? {
          q: debounced || undefined,
          theme: theme || undefined,
          language: language || undefined,
          country: countryCode || undefined,
        }
      : 'skip',
  );

  if (me === undefined) {
    return (
      <p role="status" className="text-ink-soft">
        {t('loading')}
      </p>
    );
  }
  if (!member) {
    return <p className="text-ink-soft">{t('membersOnly')}</p>;
  }

  const filtered = Boolean(q || theme || language || country);

  return (
    <div>
      <div
        role="search"
        className="grid gap-4 rounded-md border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <TextField
          label={t('search')}
          type="search"
          placeholder={t('searchPlaceholder')}
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField
          label={t('filterTheme')}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="">{t('all')}</option>
          {PROFILE_THEMES.map((slug) => (
            <option key={slug} value={slug}>
              {themeLabels[slug] ?? slug}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('filterLanguage')}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="">{t('all')}</option>
          {PROFILE_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code, locale)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('filterCountry')}
          value={country}
          maxLength={2}
          dir="ltr"
          autoCapitalize="characters"
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted">
          {result ? t('results', { count: result.items.length }) : null}
        </p>
        {filtered ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setQ('');
              setTheme('');
              setLanguage('');
              setCountry('');
            }}
          >
            {t('reset')}
          </Button>
        ) : null}
      </div>

      {result === undefined ? (
        <p className="mt-4 text-ink-soft">{t('loading')}</p>
      ) : result.items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line-strong bg-surface p-8 text-center text-ink-soft">
          {t('empty')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((p) => (
            <li key={p.handle}>
              <PersonCard person={p} themeLabels={themeLabels} />
            </li>
          ))}
        </ul>
      )}
      {result?.truncated ? (
        <p className="mt-4 text-sm text-muted">{t('truncated')}</p>
      ) : null}
    </div>
  );
}
